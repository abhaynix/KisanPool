import { Router } from 'express';
import { z } from 'zod';
import { Types } from 'mongoose';
import { ApiError, ok } from '../../lib/envelope';
import { asyncHandler } from '../../middleware/error';
import { requireAdmin, requireAuth, requireRole, type AuthedRequest } from '../../middleware/auth';
import { Payment, RecoveryIncident, Trip, TripShipment, Vehicle } from '../../models';
import { getDirections } from '../maps/service';
import { priceTrip, routeCost, transporterEarning } from '../pooling/pricing';
import { notifyRecoveryIncident } from '../notifications/service';
import { config } from '../../config';
import { requireWritable } from '../resilience/guard';

export const recoveryRouter = Router();
const fail = (message: string) => new ApiError('BOOKING_STATE_INVALID', message);
const active = (state: string) => ['EN_ROUTE', 'IN_TRANSIT', 'AT_DESTINATION'].includes(state);

async function incidentFor(id: string) {
  if (!Types.ObjectId.isValid(id)) throw new ApiError('RESOURCE_NOT_FOUND', 'Recovery incident was not found.');
  const row = await RecoveryIncident.findById(id);
  if (!row) throw new ApiError('RESOURCE_NOT_FOUND', 'Recovery incident was not found.');
  return row;
}

recoveryRouter.post('/incidents', requireAuth, requireRole('TRANSPORTER'), asyncHandler<AuthedRequest>(async (req, res) => {
  const body = z.object({ tripId: z.string(), category: z.enum(['BREAKDOWN', 'ACCIDENT', 'WEATHER', 'ROAD_BLOCK', 'OTHER']), description: z.string().min(5).max(1000), location: z.object({ name: z.string().max(200).default(''), lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180), source: z.enum(['GPS', 'DRIVER', 'OTHER']) }) }).parse(req.body);
  const trip = await Trip.findById(body.tripId);
  if (!trip) throw new ApiError('RESOURCE_NOT_FOUND', 'Trip was not found.');
  if (String(trip.transporterId) !== req.userId) throw new ApiError('AUTH_FORBIDDEN', 'Only the trip transporter can report this incident.');
  if (!active(trip.state)) throw fail('Only an active trip can enter recovery.');
  const existing = await RecoveryIncident.findOne({ tripId: trip._id, status: { $nin: ['CLOSED', 'RECOVERED'] } });
  if (existing) return ok(res, existing);
  const shipments = await TripShipment.find({ tripId: trip._id, state: { $in: ['PICKED_UP', 'IN_TRANSIT'] } });
  if (!shipments.length) throw fail('There are no onboard shipments to recover.');
  const incident = await RecoveryIncident.create({ tripId: trip._id, reportedBy: req.userId, originalTransporterId: trip.transporterId, originalVehicleId: trip.vehicleId, status: 'REPORTED', category: body.category, description: body.description, location: body.location, affectedShipments: shipments.map(s => ({ shipmentId: s._id, farmerId: s.farmerId, quantityKg: s.quantityKg, condition: 'UNKNOWN' })), legs: [{ sequence: 1, transporterId: trip.transporterId, vehicleId: trip.vehicleId, from: shipments[0].pickup, to: body.location, distanceKm: 0, quotedCost: 0, compensation: 0, state: 'ACTIVE', startedAt: trip.startedAt ?? trip.createdAt }] });
  await notifyRecoveryIncident([...new Set([req.userId, ...shipments.map(s => String(s.farmerId))])], String(trip._id), String(incident._id));
  ok(res, incident, 201);
}));

recoveryRouter.patch('/incidents/:id/triage', requireAuth, requireRole('TRANSPORTER'), asyncHandler<AuthedRequest>(async (req, res) => {
  const { safeToMove, note } = z.object({ safeToMove: z.boolean(), note: z.string().max(1000).default('') }).parse(req.body);
  const incident = await incidentFor(req.params.id);
  if (!incident.location) throw fail('Incident location is missing; escalate this recovery for review.');
  if (String(incident.originalTransporterId) !== req.userId) throw new ApiError('AUTH_FORBIDDEN', 'Only the reporting trip transporter can triage this incident.');
  if (!['REPORTED', 'SAFETY_CHECK'].includes(incident.status)) throw fail('Incident is no longer awaiting safety triage.');
  incident.safetyNote = note;
  incident.status = safeToMove ? 'RECOVERY_REQUIRED' : 'ESCALATED_TO_OPERATIONS';
  if (!safeToMove) incident.escalationReason = note || 'Driver reported the scene is unsafe.';
  await incident.save();
  ok(res, incident);
}));

recoveryRouter.get('/incidents/:id/replacements', requireAuth, requireRole('TRANSPORTER'), asyncHandler<AuthedRequest>(async (req, res) => {
  const incident = await incidentFor(req.params.id);
  if (String(incident.originalTransporterId) !== req.userId) throw new ApiError('AUTH_FORBIDDEN', 'Only the reporting trip transporter can search replacements.');
  if (!incident.location) throw fail('Incident location is missing; escalate this recovery for review.');
  const location = incident.location as { name: string; lat: number; lng: number; source: 'GPS' | 'DRIVER' | 'OTHER' };
  if (!['RECOVERY_REQUIRED', 'SEARCHING_REPLACEMENT', 'NO_REPLACEMENT_AVAILABLE'].includes(incident.status)) throw fail('Safety triage must be complete before searching.');
  const trip = await Trip.findById(incident.tripId);
  if (!trip) throw new ApiError('RESOURCE_NOT_FOUND', 'Parent trip was not found.');
  incident.status = 'SEARCHING_REPLACEMENT';
  await incident.save();
  const requiredKg = incident.affectedShipments.reduce((sum, s) => sum + s.quantityKg, 0);
  const vehicles = await Vehicle.find({ ownerId: { $ne: incident.originalTransporterId }, status: 'AVAILABLE', ...(!config.skipDocumentVerification ? { verificationStatus: 'VERIFIED' } : {}), availableCapacityKg: { $gte: requiredKg }, 'currentLocation.lat': { $exists: true }, 'currentLocation.lng': { $exists: true } }).limit(100);
  const destination = { lat: trip.destination.lat ?? location.lat, lng: trip.destination.lng ?? location.lng };
  const candidates = await Promise.all(vehicles.map(async vehicle => {
    const [approach, distance] = await Promise.all([getDirections(vehicle.currentLocation as { lat: number; lng: number }, location), getDirections(location, destination)]);
    const pricing = await priceTrip({ ratePerKm: vehicle.ratePerKm, destination, version: incident.legs.length, shipments: incident.affectedShipments.map((s, i) => ({ id: String(s.shipmentId), farmerId: String(s.farmerId), quantityKg: s.quantityKg, pickup: location, sequence: i })) });
    return { vehicleId: String(vehicle._id), transporterId: String(vehicle.ownerId), vehicleType: vehicle.vehicleType, capacityKg: vehicle.availableCapacityKg, approachDistanceKm: approach.distanceKm, approachEtaMinutes: approach.durationMinutes, remainingLegDistanceKm: distance.distanceKm, quoteTotal: pricing.totalCost, quoteShares: pricing.shares.map(s => ({ shipmentId: s.shipmentId, farmerId: s.farmerId, amount: s.amount })) };
  }));
  candidates.sort((a, b) => a.approachDistanceKm - b.approachDistanceKm);
  if (!candidates.length) { incident.status = 'NO_REPLACEMENT_AVAILABLE'; incident.escalationReason = 'No verified available vehicle has sufficient capacity.'; await incident.save(); }
  ok(res, { incidentId: String(incident._id), candidates });
}));

recoveryRouter.post('/incidents/:id/replacement', requireAuth, requireRole('TRANSPORTER'), asyncHandler<AuthedRequest>(async (req, res) => {
  const { vehicleId } = z.object({ vehicleId: z.string() }).parse(req.body);
  const incident = await incidentFor(req.params.id);
  if (String(incident.originalTransporterId) !== req.userId) throw new ApiError('AUTH_FORBIDDEN', 'Only the original trip transporter can propose a replacement.');
  if (!incident.location) throw fail('Incident location is missing; escalate this recovery for review.');
  const location = incident.location as { name: string; lat: number; lng: number; source: 'GPS' | 'DRIVER' | 'OTHER' };
  if (!['RECOVERY_REQUIRED', 'SEARCHING_REPLACEMENT', 'NO_REPLACEMENT_AVAILABLE'].includes(incident.status)) throw fail('Incident is not ready for a replacement proposal.');
  const vehicle = await Vehicle.findOne({ _id: vehicleId, status: 'AVAILABLE', ...(!config.skipDocumentVerification ? { verificationStatus: 'VERIFIED' } : {}), ownerId: { $ne: incident.originalTransporterId } });
  if (!vehicle) throw new ApiError('NO_VEHICLE_AVAILABLE', 'Replacement vehicle is unavailable or unverified.');
  const trip = await Trip.findById(incident.tripId);
  if (!trip) throw new ApiError('RESOURCE_NOT_FOUND', 'Parent trip was not found.');
  const requiredKg = incident.affectedShipments.reduce((sum, s) => sum + s.quantityKg, 0);
  if (vehicle.availableCapacityKg < requiredKg) throw new ApiError('CAPACITY_EXCEEDED', 'Replacement vehicle capacity is below the onboard cargo quantity.');
  const destination = { lat: trip.destination.lat ?? location.lat, lng: trip.destination.lng ?? location.lng };
  const [route, pricing] = await Promise.all([getDirections(location, destination), priceTrip({ ratePerKm: vehicle.ratePerKm, destination, version: incident.legs.length, shipments: incident.affectedShipments.map((s, i) => ({ id: String(s.shipmentId), farmerId: String(s.farmerId), quantityKg: s.quantityKg, pickup: location, sequence: i })) })]);
  const reservedVehicle = await Vehicle.findOneAndUpdate({ _id: vehicle._id, status: 'AVAILABLE', ...(!config.skipDocumentVerification ? { verificationStatus: 'VERIFIED' } : {}), availableCapacityKg: { $gte: requiredKg } }, { $set: { status: 'BUSY' } }, { new: true });
  if (!reservedVehicle) throw new ApiError('CONCURRENT_BOOKING', 'Replacement vehicle availability changed; refresh and retry.');
  const reservedTrip = await Trip.findOneAndUpdate({ _id: trip._id, openForVehicle: incident.originalVehicleId }, { $set: { openForVehicle: vehicle._id } }, { new: true });
  if (!reservedTrip) { await Vehicle.updateOne({ _id: vehicle._id, status: 'BUSY' }, { $set: { status: 'AVAILABLE' } }); throw new ApiError('CONCURRENT_BOOKING', 'Trip or replacement vehicle reservation changed; refresh and retry.'); }
  incident.replacement = { transporterId: vehicle.ownerId, vehicleId: vehicle._id, distanceKm: route.distanceKm, quoteTotal: pricing.totalCost, quoteShares: pricing.shares.map(s => ({ shipmentId: new Types.ObjectId(s.shipmentId), farmerId: new Types.ObjectId(s.farmerId), amount: s.amount })), proposedAt: new Date() } as never;
  incident.status = 'AWAITING_CONFIRMATION';
  try { await incident.save(); }
  catch (error) {
    await Vehicle.updateOne({ _id: vehicle._id, status: 'BUSY' }, { $set: { status: 'AVAILABLE' } });
    await Trip.updateOne({ _id: trip._id, openForVehicle: vehicle._id }, { $set: { openForVehicle: incident.originalVehicleId } });
    throw error;
  }
  ok(res, { incident, routeSource: route.source, farmerChargesChanged: false });
}));

recoveryRouter.post('/incidents/:id/confirm-replacement', requireAuth, requireRole('TRANSPORTER'), asyncHandler<AuthedRequest>(async (req, res) => {
  const { accept } = z.object({ accept: z.boolean() }).parse(req.body);
  const incident = await incidentFor(req.params.id);
  if (incident.status !== 'AWAITING_CONFIRMATION' || !incident.replacement?.vehicleId) throw fail('There is no replacement proposal awaiting confirmation.');
  if (req.userId !== String(incident.originalTransporterId) && req.userId !== String(incident.replacement.transporterId)) throw new ApiError('AUTH_FORBIDDEN', 'Only the two drivers can confirm the handover.');
  if (!accept) {
    await Vehicle.updateOne({ _id: incident.replacement.vehicleId, status: 'BUSY' }, { $set: { status: 'AVAILABLE' } });
    const trip = await Trip.findById(incident.tripId);
    if (trip && incident.replacement.vehicleId) { trip.openForVehicle = incident.originalVehicleId as never; await trip.save(); }
    incident.status = 'SEARCHING_REPLACEMENT'; incident.replacement = undefined as never; await incident.save(); return ok(res, incident);
  }
  if (req.userId === String(incident.originalTransporterId)) incident.replacement.originalDriverAcceptedAt = new Date();
  else incident.replacement.replacementAcceptedAt = new Date();
  incident.status = incident.replacement.originalDriverAcceptedAt && incident.replacement.replacementAcceptedAt ? 'HANDOVER_IN_PROGRESS' : 'AWAITING_CONFIRMATION';
  await incident.save();
  ok(res, incident);
}));

recoveryRouter.post('/incidents/:id/handover', requireAuth, requireRole('TRANSPORTER'), asyncHandler<AuthedRequest>(async (req, res) => {
  const body = z.object({ location: z.object({ name: z.string().max(200).default(''), lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }), at: z.string().datetime(), completedDistanceKm: z.number().positive().max(2000), shipments: z.array(z.object({ shipmentId: z.string(), quantityKg: z.number().positive(), condition: z.string().min(1).max(300) })).min(1), evidenceUrls: z.array(z.string().url()).max(5).default([]) }).parse(req.body);
  const incident = await incidentFor(req.params.id);
  const proposal = incident.replacement;
  if (incident.status !== 'HANDOVER_IN_PROGRESS' || !proposal?.vehicleId) throw fail('Both drivers must accept before custody is recorded.');
  const expectedDriver = incident.custodyAcks.length === 0 ? String(incident.originalTransporterId) : String(proposal.transporterId);
  if (req.userId !== expectedDriver) throw new ApiError('AUTH_FORBIDDEN', 'Custody acknowledgements must be recorded by the outgoing and incoming drivers in order.');
  const expected = incident.affectedShipments.map(s => `${s.shipmentId}:${s.quantityKg}`).sort();
  const actual = body.shipments.map(s => `${s.shipmentId}:${s.quantityKg}`).sort();
  if (JSON.stringify(expected) !== JSON.stringify(actual)) { incident.status = 'ESCALATED_TO_OPERATIONS'; incident.escalationReason = 'Handover shipment quantities differ from the recorded onboard cargo.'; await incident.save(); return ok(res, incident); }
  incident.custodyAcks.push({ transporterId: new Types.ObjectId(req.userId), at: new Date(body.at), completedDistanceKm: body.completedDistanceKm, location: body.location, shipments: body.shipments.map(s => ({ ...s, shipmentId: new Types.ObjectId(s.shipmentId) })), evidenceUrls: body.evidenceUrls } as never);
  if (incident.custodyAcks.length === 2) {
    const [outgoing, incoming] = incident.custodyAcks;
    const describe = (ack: typeof outgoing) => ack.shipments.map(s => `${s.shipmentId}:${s.quantityKg}:${s.condition}`).sort();
    if (JSON.stringify(describe(outgoing)) !== JSON.stringify(describe(incoming)) || outgoing.completedDistanceKm !== incoming.completedDistanceKm) { incident.status = 'ESCALATED_TO_OPERATIONS'; incident.escalationReason = 'Outgoing and incoming driver cargo or completed-distance records differ.'; }
    else {
      const original = await Vehicle.findById(incident.originalVehicleId);
      const first = incident.legs[0];
      if (first) { first.to = body.location; first.completedAt = new Date(body.at); first.state = 'COMPLETED'; }
      const nextSequence = incident.legs.length + 1;
      incident.legs.push({ sequence: nextSequence, transporterId: new Types.ObjectId(String(proposal.transporterId)), vehicleId: new Types.ObjectId(String(proposal.vehicleId)), from: body.location, to: { name: '', lat: (await Trip.findById(incident.tripId))?.destination.lat ?? body.location.lat, lng: (await Trip.findById(incident.tripId))?.destination.lng ?? body.location.lng }, distanceKm: proposal.distanceKm ?? 0, quotedCost: proposal.quoteTotal ?? 0, compensation: 0, state: 'ACTIVE', startedAt: new Date(body.at) } as never);
      const completedDistance = outgoing.completedDistanceKm;
      const completedCost = routeCost(completedDistance, original?.ratePerKm ?? 0);
      const completedEarning = transporterEarning(completedCost);
      if (first) { first.distanceKm = completedDistance; first.quotedCost = completedCost; first.compensation = completedEarning; }
      await Vehicle.updateOne({ _id: incident.originalVehicleId }, { $set: { status: 'AVAILABLE' } });
      const payments = await Payment.find({ tripId: incident.tripId }, '_id');
      incident.settlement ??= { status: 'PENDING_OPERATIONS_REVIEW', ledger: [] } as never;
      incident.settlement.status = 'BLOCKED_REQUIRES_OPERATIONS';
      incident.settlement.ledger.push({ legSequence: 1, transporterId: new Types.ObjectId(String(incident.originalTransporterId)), quotedCost: completedCost, expectedCompensation: completedEarning, earnedCompensation: completedEarning, status: 'BLOCKED_REQUIRES_OPERATIONS', attemptCount: 0, idempotencyKey: `${String(incident._id)}:leg:1`, lastError: 'Existing shipment payout targets one transporter; per-leg split requires operations reconciliation.', farmerChargeAdjustment: 0, paymentIds: payments.map(p => p._id), recordedAt: new Date() } as never);
      incident.settlement.ledger.push({ legSequence: nextSequence, transporterId: new Types.ObjectId(String(proposal.transporterId)), quotedCost: proposal.quoteTotal ?? 0, expectedCompensation: transporterEarning(proposal.quoteTotal ?? 0), earnedCompensation: null, status: 'AWAITING_LEG_COMPLETION', attemptCount: 0, idempotencyKey: `${String(incident._id)}:leg:${nextSequence}`, lastError: 'Estimate only; earned amount awaits verified completion distance.', farmerChargeAdjustment: 0, paymentIds: payments.map(p => p._id), recordedAt: new Date() } as never);
      incident.status = 'RECOVERED';
    }
  }
  await incident.save();
  ok(res, incident);
}));

recoveryRouter.get('/incidents/:id', requireAuth, asyncHandler<AuthedRequest>(async (req, res) => {
  const incident = await incidentFor(req.params.id);
  const allowed = req.role === 'TRANSPORTER' && [String(incident.originalTransporterId), String(incident.replacement?.transporterId ?? '')].includes(req.userId) || incident.affectedShipments.some(s => String(s.farmerId) === req.userId);
  if (!allowed) throw new ApiError('AUTH_FORBIDDEN', 'You are not a party to this recovery incident.');
  const farmer = incident.affectedShipments.find(s => String(s.farmerId) === req.userId);
  ok(res, farmer ? { ...incident.toObject(), affectedShipments: incident.affectedShipments.filter(s => String(s.farmerId) === req.userId), settlement: undefined } : incident);
}));

recoveryRouter.patch('/settlements/:incidentId/legs/:sequence/verify-completion', requireAdmin, requireWritable, asyncHandler(async (req, res) => {
  const body = z.object({ completedDistanceKm: z.number().positive().max(2000), evidenceUrl: z.string().url() }).parse(req.body);
  const incident = await incidentFor(req.params.incidentId);
  const sequence = z.coerce.number().int().positive().parse(req.params.sequence);
  const leg = incident.legs.find((item) => item.sequence === sequence);
  const entry = incident.settlement?.ledger.find((item) => item.legSequence === sequence);
  if (!leg || !entry) throw new ApiError('RESOURCE_NOT_FOUND', 'Recovery settlement leg was not found.');
  if (leg.state !== 'COMPLETED') throw fail('A leg cannot be financially reconciled before its completion is recorded.');
  if (entry.earnedCompensation != null) {
    if (entry.verifiedDistanceKm === body.completedDistanceKm && entry.evidenceUrl === body.evidenceUrl) return ok(res, { incidentId: incident._id, leg: entry, idempotentReplay: true });
    throw fail('This leg already has verified completion facts; create an operations correction record instead of overwriting it.');
  }
  const vehicle = await Vehicle.findById(leg.vehicleId);
  if (!vehicle) throw fail('The recovery vehicle pricing record is unavailable.');
  const actualCost = routeCost(body.completedDistanceKm, vehicle.ratePerKm);
  const earnedCompensation = transporterEarning(actualCost);
  const update = await RecoveryIncident.updateOne({
    _id: incident._id,
    legs: { $elemMatch: { sequence, state: 'COMPLETED' } },
    settlement: { $exists: true },
    'settlement.ledger': { $elemMatch: { legSequence: sequence, earnedCompensation: null } },
  }, { $set: {
    'settlement.status': 'BLOCKED_REQUIRES_OPERATIONS',
    'settlement.ledger.$[entry].quotedCost': actualCost,
    'settlement.ledger.$[entry].expectedCompensation': earnedCompensation,
    'settlement.ledger.$[entry].earnedCompensation': earnedCompensation,
    'settlement.ledger.$[entry].verifiedDistanceKm': body.completedDistanceKm,
    'settlement.ledger.$[entry].evidenceUrl': body.evidenceUrl,
    'settlement.ledger.$[entry].verifiedBy': (req as any).userId,
    'settlement.ledger.$[entry].status': 'BLOCKED_REQUIRES_OPERATIONS',
    'settlement.ledger.$[entry].lastError': 'Leg earnings are reconciled; payment is held for provider-compatible per-leg operations settlement.',
  } }, { arrayFilters: [{ 'entry.legSequence': sequence, 'entry.earnedCompensation': null }] });
  const committed = await RecoveryIncident.findById(incident._id);
  const committedEntry = committed?.settlement?.ledger.find((item) => item.legSequence === sequence);
  if (!update.modifiedCount) {
    if (committedEntry?.verifiedDistanceKm === body.completedDistanceKm && committedEntry.evidenceUrl === body.evidenceUrl) {
      return ok(res, { incidentId: incident._id, leg: committedEntry, idempotentReplay: true });
    }
    throw fail('Completion facts changed concurrently; review the current settlement entry before retrying.');
  }
  ok(res, { incidentId: incident._id, leg: committedEntry, idempotentReplay: false }, 201);
}));

recoveryRouter.get('/settlements/pending', requireAdmin, asyncHandler(async (_req, res) => {
  const rows = await RecoveryIncident.find({ 'settlement.status': { $in: ['PENDING_OPERATIONS_REVIEW', 'PENDING', 'RETRYABLE', 'BLOCKED_REQUIRES_OPERATIONS', 'BLOCKED_PAYOUT_CAPABILITY'] } }).sort({ updatedAt: -1 });
  ok(res, rows.map(row => ({ incidentId: String(row._id), tripId: String(row.tripId), status: row.settlement?.status, ledger: row.settlement?.ledger ?? [], note: 'Leg estimates and verified earnings are separate. Settlement remains blocked pending an idempotent per-leg transfer and provider reconciliation.' })));
}));
