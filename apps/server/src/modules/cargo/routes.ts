import { Router } from 'express';
import { createHash } from 'crypto';
import { Types } from 'mongoose';
import { z } from 'zod';
import { ApiError, ok } from '../../lib/envelope';
import { config } from '../../config';
import { asyncHandler } from '../../middleware/error';
import { requireAdmin, requireAuth, requireRole, type AuthedRequest } from '../../middleware/auth';
import { CargoLedger, FreshBuyerOffer, FreshRecommendation, RecoveryIncident, TransportRequest, Trip, TripShipment } from '../../models';
import { getDirections } from '../maps/service';
import { previewLoadQuote } from '../pooling/service';
import { createRequest } from '../transport/service';
import { estimateFreshness } from '../freshness/profiles';
import { applyCargoQuantityEvent, cargoBalanceIsValid, cargoEventMatches, hasSameOptionApprovals } from './ledger-math';

export const cargoRouter = Router();
const fail = (message: string) => new ApiError('BOOKING_STATE_INVALID', message);
const pointSchema = z.object({ name: z.string().trim().min(1).max(120), lat: z.number().finite().min(-90).max(90), lng: z.number().finite().min(-180).max(180) });
const eventKey = z.string().trim().min(8).max(120);
function resultSaleKg(events: any[], version: number): number {
  return events.filter((event) => event.type === 'SALE' && event.decisionPlanVersion === version).reduce((sum, event) => sum + event.quantityKg, 0);
}

async function parentContext(shipmentId: string) {
  if (!Types.ObjectId.isValid(shipmentId)) throw new ApiError('RESOURCE_NOT_FOUND', 'Cargo shipment was not found.');
  const shipment = await TripShipment.findById(shipmentId);
  if (!shipment) throw new ApiError('RESOURCE_NOT_FOUND', 'Cargo shipment was not found.');
  const [trip, request] = await Promise.all([Trip.findById(shipment.tripId), TransportRequest.findById(shipment.requestId)]);
  if (!trip || !request) throw new ApiError('RESOURCE_NOT_FOUND', 'The shipment journey was not found.');
  return { shipment, trip, request };
}

async function ledgerFor(id: string) {
  if (!Types.ObjectId.isValid(id)) throw new ApiError('RESOURCE_NOT_FOUND', 'Cargo ledger was not found.');
  const ledger = await CargoLedger.findById(id);
  if (!ledger) throw new ApiError('RESOURCE_NOT_FOUND', 'Cargo ledger was not found.');
  return ledger;
}

async function isCurrentTransporter(tripId: Types.ObjectId, userId: string): Promise<boolean> {
  const trip = await Trip.findById(tripId);
  if (trip && String(trip.transporterId) === userId) return true;
  const recovery = await RecoveryIncident.findOne({ tripId, status: { $in: ['RECOVERED', 'CLOSED'] }, 'legs.state': 'ACTIVE' });
  return Boolean(recovery?.legs.some((leg) => leg.state === 'ACTIVE' && String(leg.transporterId) === userId));
}

async function currentTransporterId(tripId: Types.ObjectId): Promise<string | null> {
  const recovery = await RecoveryIncident.findOne({ tripId, status: { $in: ['RECOVERED', 'CLOSED'] }, 'legs.state': 'ACTIVE' });
  const activeLeg = recovery?.legs.find((leg) => leg.state === 'ACTIVE');
  if (activeLeg?.transporterId) return String(activeLeg.transporterId);
  const trip = await Trip.findById(tripId, 'transporterId');
  return trip ? String(trip.transporterId) : null;
}

async function assertCargoParty(ledger: { farmerId: unknown; tripId: Types.ObjectId }, userId: string, role: string, allowAdmin = false): Promise<void> {
  if (allowAdmin && role === 'ADMIN') return;
  if (role === 'FARMER' && String(ledger.farmerId) === userId) return;
  if (role === 'TRANSPORTER' && await isCurrentTransporter(ledger.tripId, userId)) return;
  throw new ApiError('AUTH_FORBIDDEN', 'You are not a party to this cargo journey.');
}

function checkBalance(ledger: { receivedKg: number; soldKg: number; rejectedKg: number; returnedKg: number; deliveredKg: number; inTransitKg: number; remainingAvailableKg: number; documentedVarianceKg: number }) {
  if (!cargoBalanceIsValid(ledger)) throw new ApiError('EXTERNAL_SERVICE_ERROR', 'Cargo quantity ledger failed reconciliation; operations review is required.');
}

async function appendEvent(ledger: any, input: { type: string; key: string; quantityKg: number; actorId: string; source: string; location: { name: string; lat: number; lng: number }; condition?: string; evidenceUrls?: string[]; buyerOfferId?: string; decisionPlanVersion?: number; priceINRPerKg?: number; note?: string }) {
  const duplicate = ledger.events.find((event: any) => event.idempotencyKey === input.key);
  if (duplicate) {
    if (!cargoEventMatches(duplicate, { type: input.type, quantityKg: input.quantityKg, decisionPlanVersion: input.decisionPlanVersion, priceINRPerKg: input.priceINRPerKg })) throw fail('This idempotency key was already used for a different cargo event.');
    return { ledger, duplicate: true };
  }
  if (['SALE', 'REJECTED', 'RETURNED', 'FINAL_DELIVERY', 'VARIANCE'].includes(input.type) && ledger.plans.some((plan: any) => ['BOOKING_REQUESTED', 'DISPATCHED'].includes(plan.status))) {
    throw fail('Cargo is committed to an active reroute leg; record its receipt before changing disposition.');
  }
  const q = input.quantityKg;
  if (q <= 0) throw new ApiError('VALIDATION_ERROR', 'quantityKg must be greater than zero.');
  if (['SALE', 'REJECTED', 'RETURNED', 'FINAL_DELIVERY', 'REROUTE_DISPATCHED', 'VARIANCE'].includes(input.type) && q > ledger.remainingAvailableKg) {
    throw new ApiError('CAPACITY_EXCEEDED', 'Quantity exceeds the currently available cargo balance.');
  }
  if (input.type === 'REROUTE_RECEIVED' && q > ledger.inTransitKg) throw new ApiError('CAPACITY_EXCEEDED', 'Received quantity exceeds cargo in transit.');
  const nextQuantities = applyCargoQuantityEvent(ledger, input.type as any, q);
  if (!nextQuantities) throw new ApiError('CAPACITY_EXCEEDED', 'Cargo quantity event would over-allocate the reconciled balance.');
  ledger.events.push({ type: input.type, idempotencyKey: input.key, quantityKg: q, actorId: input.actorId, source: input.source, location: input.location, condition: input.condition ?? '', evidenceUrls: input.evidenceUrls ?? [], buyerOfferId: input.buyerOfferId ? new Types.ObjectId(input.buyerOfferId) : undefined, decisionPlanVersion: input.decisionPlanVersion, priceINRPerKg: input.priceINRPerKg, note: input.note ?? '', at: new Date() });
  for (const key of ['soldKg', 'rejectedKg', 'returnedKg', 'deliveredKg', 'inTransitKg', 'remainingAvailableKg', 'documentedVarianceKg'] as const) ledger[key] = nextQuantities[key];
  ledger.revision += 1;
  checkBalance(ledger);
  try { await ledger.save(); }
  catch (err) {
    if ((err as { name?: string }).name === 'VersionError') throw new ApiError('CONCURRENT_BOOKING', 'Cargo changed at the same time. Refresh the ledger before retrying.');
    throw err;
  }
  return { ledger, duplicate: false };
}

async function freshContext(ledger: any) {
  const request = await TransportRequest.findById(ledger.requestId);
  const snapshot = request?.freshRecommendationId ? await FreshRecommendation.findById(request.freshRecommendationId).lean() as any : null;
  return { request, snapshot };
}

async function rerouteOptions(ledger: any) {
  const { snapshot } = await freshContext(ledger);
  if (!snapshot || ledger.remainingAvailableKg <= 0) return [];
  const input = snapshot.input as any;
  const current = ledger.currentLocation as { name: string; lat: number; lng: number };
  const currentRecord = [...ledger.marketRecords].reverse().find((record: any) => record.currentSellPriceINRPerKg != null && record.currentHandlingCostsINR != null);
  const transporterId = await currentTransporterId(ledger.tripId);
  const options = (snapshot.options as any[]).filter((option) => option.marketId && option.marketId !== current.name && option.marketLocation && !(Math.abs(option.marketLocation.lat - current.lat) < 0.0001 && Math.abs(option.marketLocation.lng - current.lng) < 0.0001));
  return Promise.all(options.map(async (option) => {
    const destination = { lat: Number(option.marketLocation.lat), lng: Number(option.marketLocation.lng) };
    const [route, transport] = await Promise.all([
      getDirections(current, destination),
      previewLoadQuote({ farmerId: String(ledger.farmerId), quantityKg: ledger.remainingAvailableKg, cropType: ledger.cropType, pickup: current, destination }),
    ]);
    const freshness = estimateFreshness({ cropKey: String(input.cropKey ?? ledger.cropType), harvestedAt: ledger.harvestedAt ?? input.harvestedAt, now: new Date(), ripenessStage: ledger.currentRipenessStage, storageCondition: ledger.currentStorageCondition, storageTemperatureC: ledger.currentStorageTemperatureC, routeDurationMinutes: route.durationMinutes, handlingCondition: ledger.currentHandlingCondition });
    const candidate = transport.candidates.find((row) => row.transporterId === transporterId);
    const marketRecord = [...ledger.marketRecords].reverse().find((record: any) => record.marketId === String(option.marketId));
    const targetPrice = marketRecord?.targetPriceINRPerKg ?? option.price?.modalINRPerKg ?? null;
    const sellPrice = currentRecord?.currentSellPriceINRPerKg;
    const incrementalAdvantage = candidate && targetPrice != null && sellPrice != null && marketRecord?.targetHandlingCostsINR != null && currentRecord?.currentHandlingCostsINR != null
      ? Math.round(((targetPrice * ledger.remainingAvailableKg - marketRecord.targetHandlingCostsINR - candidate.farmerPayableINR) - (sellPrice * ledger.remainingAvailableKg - currentRecord.currentHandlingCostsINR)) * 100) / 100
      : null;
    return {
      option: 'REROUTE_TO_MARKET', marketId: String(option.marketId), marketName: String(option.marketName), marketLocation: destination,
      marketAcceptance: marketRecord?.acceptedCrop ? 'OPERATIONS_VERIFIED' : 'UNKNOWN', receivingHoursStatus: marketRecord?.receivingHoursVerified ? 'OPERATIONS_VERIFIED' : 'UNKNOWN', marketPriceINRPerKg: targetPrice,
      priceStatus: marketRecord ? 'OPERATIONS_RECORDED' : option.price?.status ?? 'UNAVAILABLE', priceSource: marketRecord?.targetPriceSource ?? option.price?.sourceType ?? 'NONE',
      route: { distanceKm: route.distanceKm, durationMinutes: route.durationMinutes, source: route.source },
      quote: candidate ? { amountINR: candidate.farmerPayableINR, vehicleId: candidate.vehicleId, transporterId: candidate.transporterId, pickupDistanceKm: candidate.vehicleToPickupDistanceKm } : null,
      additionalCostsINR: marketRecord?.targetHandlingCostsINR ?? null, incrementalAdvantageINR: incrementalAdvantage,
      minimumBenefitINR: config.cargo.minRerouteBenefitINR,
      minimumBenefitMet: incrementalAdvantage != null && incrementalAdvantage >= config.cargo.minRerouteBenefitINR,
      freshness, saleableQuantitySupported: false,
      warnings: ['MARKET_ACCEPTANCE_UNKNOWN', 'RECEIVING_HOURS_UNKNOWN', 'MARKET_PRICE_NOT_GUARANTEED', 'HANDLING_COSTS_UNKNOWN', ...freshness.warnings],
    };
  }));
}

cargoRouter.post('/shipments/:shipmentId/receive', requireAuth, asyncHandler<AuthedRequest>(async (req, res) => {
  const body = z.object({ quantityKg: z.number().finite().positive().max(100_000), idempotencyKey: eventKey, location: pointSchema, condition: z.string().max(300).default('UNKNOWN'), ripenessStage: z.enum(['GREEN', 'TURNING', 'PINK', 'RED', 'UNKNOWN']).default('UNKNOWN'), storageCondition: z.enum(['SHADE', 'AMBIENT', 'COOL_STORAGE', 'UNKNOWN']).default('UNKNOWN'), storageTemperatureC: z.number().finite().min(-30).max(80).optional(), handlingCondition: z.enum(['GOOD', 'BRUISED', 'ROUGH_HANDLING', 'UNKNOWN']).default('UNKNOWN'), evidenceUrls: z.array(z.string().url()).max(5).default([]) }).parse(req.body);
  const { shipment, trip, request } = await parentContext(req.params.shipmentId);
  const isFarmer = req.role === 'FARMER' && String(shipment.farmerId) === req.userId;
  const isTransporter = req.role === 'TRANSPORTER' && await isCurrentTransporter(trip._id, req.userId);
  if (!isFarmer && !isTransporter) throw new ApiError('AUTH_FORBIDDEN', 'Only this shipment farmer or current transporter can record market receipt.');
  if (trip.state !== 'AT_DESTINATION') throw fail('Market receipt can be recorded only when the trip reaches its destination.');
  if (body.quantityKg > shipment.quantityKg) throw new ApiError('VALIDATION_ERROR', 'Received quantity cannot exceed the dispatched shipment quantity.');
  let ledger = await CargoLedger.findOne({ shipmentId: shipment._id });
  if (ledger?.events.some((e) => e.idempotencyKey === body.idempotencyKey)) return ok(res, { ledger, duplicate: true });
  if (ledger) throw fail('Initial market receipt has already been recorded. Use a cargo event for any later quantity change.');
  const snapshot = request.freshRecommendationId ? await FreshRecommendation.findById(request.freshRecommendationId).lean() as any : null;
  try {
    ledger = await CargoLedger.create({ shipmentId: shipment._id, farmerId: shipment.farmerId, tripId: trip._id, requestId: request._id, cropType: shipment.cropType, harvestedAt: snapshot?.input?.harvestedAt, initialDispatchedKg: shipment.quantityKg, receivedKg: body.quantityKg, remainingAvailableKg: body.quantityKg, dispatchReceiptVarianceKg: shipment.quantityKg - body.quantityKg, currentRipenessStage: body.ripenessStage, currentStorageCondition: body.storageCondition, currentStorageTemperatureC: body.storageTemperatureC, currentHandlingCondition: body.handlingCondition, currentLocation: body.location, events: [{ type: 'RECEIVED', idempotencyKey: body.idempotencyKey, quantityKg: body.quantityKg, at: new Date(), actorId: req.userId, source: isFarmer ? 'FARMER_REPORTED' : 'TRANSPORTER_REPORTED', location: body.location, condition: body.condition, evidenceUrls: body.evidenceUrls }] });
  } catch (err) {
    if ((err as { code?: number }).code === 11000) {
      ledger = await CargoLedger.findOne({ shipmentId: shipment._id });
      if (ledger?.events.some((e) => e.idempotencyKey === body.idempotencyKey)) return ok(res, { ledger, duplicate: true });
      throw new ApiError('CONCURRENT_BOOKING', 'Market receipt was recorded at the same time. Refresh the cargo ledger.');
    }
    throw err;
  }
  ok(res, { ledger, duplicate: false }, 201);
}));

cargoRouter.get('/shipments/:shipmentId/ledger', requireAuth, asyncHandler<AuthedRequest>(async (req, res) => {
  const { shipment, trip } = await parentContext(req.params.shipmentId);
  let ledger = await CargoLedger.findOne({ shipmentId: shipment._id });
  if (!ledger) {
    const authorized = req.role === 'FARMER' && String(shipment.farmerId) === req.userId || req.role === 'TRANSPORTER' && await isCurrentTransporter(trip._id, req.userId);
    if (!authorized) throw new ApiError('AUTH_FORBIDDEN', 'You are not a party to this cargo journey.');
    return ok(res, { shipmentId: String(shipment._id), initialDispatchedKg: shipment.quantityKg, status: 'AWAITING_MARKET_RECEIPT', receivedKg: 0, remainingAvailableKg: 0, events: [], plans: [] });
  }
  await assertCargoParty(ledger, req.userId, req.role);
  checkBalance(ledger);
  ok(res, ledger);
}));

cargoRouter.post('/shipments/:shipmentId/events', requireAuth, asyncHandler<AuthedRequest>(async (req, res) => {
  const body = z.object({ type: z.enum(['SALE', 'REJECTED', 'RETURNED', 'FINAL_DELIVERY']), quantityKg: z.number().finite().positive().max(100_000), idempotencyKey: eventKey, location: pointSchema, condition: z.string().max(300).default(''), evidenceUrls: z.array(z.string().url()).max(5).default([]), buyerOfferId: z.string().optional(), priceINRPerKg: z.number().finite().min(0).optional(), note: z.string().max(500).default('') }).parse(req.body);
  const ledger = await CargoLedger.findOne({ shipmentId: req.params.shipmentId });
  if (!ledger) throw new ApiError('RESOURCE_NOT_FOUND', 'Record market receipt before changing cargo disposition.');
  if (ledger.dispatchReceiptVarianceKg > 0 && !ledger.dispatchReceiptVarianceResolvedAt) throw fail('Dispatch and receipt quantities differ; operations must document the variance before disposition.');
  await assertCargoParty(ledger, req.userId, req.role);
  if (body.type === 'SALE') {
    if (req.role !== 'FARMER') throw new ApiError('AUTH_FORBIDDEN', 'The farmer records the commercial sale.');
    if (!body.evidenceUrls.length || body.priceINRPerKg == null) throw new ApiError('VALIDATION_ERROR', 'A sale needs a price and sale evidence.');
    if (body.buyerOfferId) {
      const offer = await FreshBuyerOffer.findOne({ _id: body.buyerOfferId, farmerId: req.userId, validUntil: { $gt: new Date() } });
      if (!offer || (offer.quantityKg != null && offer.quantityKg < body.quantityKg)) throw fail('Buyer offer is expired or does not cover this sale quantity.');
    }
  }
  if (['REJECTED', 'RETURNED', 'FINAL_DELIVERY'].includes(body.type) && req.role !== 'TRANSPORTER') throw new ApiError('AUTH_FORBIDDEN', 'Only the transporter can record this custody event.');
  const result = await appendEvent(ledger, { type: body.type, key: body.idempotencyKey, quantityKg: body.quantityKg, actorId: req.userId, source: req.role === 'FARMER' ? 'FARMER_REPORTED' : 'TRANSPORTER_REPORTED', location: body.location, condition: body.condition, evidenceUrls: body.evidenceUrls, buyerOfferId: body.buyerOfferId, priceINRPerKg: body.priceINRPerKg, note: body.note });
  ok(res, result);
}));

cargoRouter.post('/shipments/:shipmentId/variance', requireAdmin, asyncHandler<AuthedRequest>(async (req, res) => {
  const body = z.object({ quantityKg: z.number().finite().positive().max(100_000), idempotencyKey: eventKey, location: pointSchema, evidenceUrls: z.array(z.string().url()).min(1).max(5), note: z.string().min(5).max(500) }).parse(req.body);
  const ledger = await CargoLedger.findOne({ shipmentId: req.params.shipmentId });
  if (!ledger) throw new ApiError('RESOURCE_NOT_FOUND', 'Cargo ledger was not found.');
  const result = await appendEvent(ledger, { type: 'VARIANCE', key: body.idempotencyKey, quantityKg: body.quantityKg, actorId: req.userId, source: 'OPERATIONS_VERIFIED', location: body.location, evidenceUrls: body.evidenceUrls, note: body.note });
  ok(res, result);
}));

cargoRouter.patch('/shipments/:shipmentId/receipt-variance', requireAdmin, asyncHandler<AuthedRequest>(async (req, res) => {
  const body = z.object({ explanation: z.string().min(5).max(500), evidenceUrls: z.array(z.string().url()).min(1).max(5) }).parse(req.body);
  const ledger = await CargoLedger.findOne({ shipmentId: req.params.shipmentId });
  if (!ledger) throw new ApiError('RESOURCE_NOT_FOUND', 'Cargo ledger was not found.');
  if (ledger.dispatchReceiptVarianceKg <= 0) throw fail('There is no dispatch/receipt quantity discrepancy to review.');
  ledger.dispatchReceiptVarianceExplanation = `${body.explanation}; evidence=${body.evidenceUrls.join(',')}`;
  ledger.dispatchReceiptVarianceResolvedBy = req.userId;
  ledger.dispatchReceiptVarianceResolvedAt = new Date();
  ledger.revision += 1;
  await ledger.save();
  ok(res, ledger);
}));

cargoRouter.get('/shipments/:shipmentId/options', requireAuth, asyncHandler<AuthedRequest>(async (req, res) => {
  const { shipment } = await parentContext(req.params.shipmentId);
  const ledger = await CargoLedger.findOne({ shipmentId: shipment._id });
  if (!ledger) throw new ApiError('RESOURCE_NOT_FOUND', 'Record market receipt before comparing disposition options.');
  await assertCargoParty(ledger, req.userId, req.role);
  const { request, snapshot } = await freshContext(ledger);
  const currentMarket = ledger.currentLocation.name.trim().toLowerCase();
  const sellOffers = request?.freshRecommendationId ? await FreshBuyerOffer.find({ farmerId: ledger.farmerId, recommendationId: request.freshRecommendationId, validUntil: { $gt: new Date() } }).sort({ priceINRPerKg: -1 }).lean() : [];
  const sellHere = sellOffers.filter((offer) => offer.marketName.trim().toLowerCase() === currentMarket && (offer.quantityKg == null || offer.quantityKg > 0)).map((offer) => { const quantityKg = Math.min(ledger.remainingAvailableKg, offer.quantityKg ?? ledger.remainingAvailableKg); return { offerId: String(offer._id), marketName: offer.marketName, priceINRPerKg: offer.priceINRPerKg, quantityKg, evidenceStatus: offer.evidenceStatus, validUntil: offer.validUntil, expectedGrossINR: Math.round(offer.priceINRPerKg * quantityKg * 100) / 100 }; });
  const routes = await rerouteOptions(ledger);
  const rerouteAttempts = ledger.plans.filter((plan: any) => plan.option === 'REROUTE_TO_MARKET' && ['BOOKING_REQUESTED', 'DISPATCHED', 'RECEIVED'].includes(plan.status)).length;
  ok(res, { shipmentId: String(shipment._id), currentLocation: ledger.currentLocation, originalHarvestAt: ledger.harvestedAt ?? null, quantity: { receivedKg: ledger.receivedKg, soldKg: ledger.soldKg, rejectedKg: ledger.rejectedKg, remainingKg: ledger.remainingAvailableKg, inTransitKg: ledger.inTransitKg, documentedVarianceKg: ledger.documentedVarianceKg }, dispatchReceiptVarianceKg: ledger.dispatchReceiptVarianceKg, sellHere, reroutes: routes, rerouteAttempts, rerouteAttemptsRemaining: Math.max(0, config.cargo.maxRerouteAttempts - rerouteAttempts), sellHereHandlingCostsINR: null, rerouteAdditionalCostsINR: null, sunkTransportCostINR: shipment.finalPrice ?? shipment.allocatedPrice, sunkCostExcludedFromIncrementalComparison: true, decision: !sellHere.length && !routes.some((r) => r.marketAcceptance === 'OPERATIONS_VERIFIED') ? 'HOLD_OR_ESCALATE' : 'FARMER_CHOICE', warnings: [...(ledger.dispatchReceiptVarianceKg > 0 && !ledger.dispatchReceiptVarianceResolvedAt ? ['DISPATCH_RECEIPT_VARIANCE_PENDING_OPERATIONS'] : []), ...(!sellHere.length ? ['NO_CURRENT_BUYER_OFFER'] : []), ...(!snapshot ? ['NO_VERIFIED_FRESH_MARKET_SNAPSHOT'] : []), 'FARMER_REPORTED_BUYER_QUOTES_ARE_UNVERIFIED', 'UNKNOWN_MARKET_ACCEPTANCE_OR_RECEIVING_HOURS_BLOCK_EXECUTION'] });
}));

cargoRouter.post('/shipments/:shipmentId/decisions', requireAuth, requireRole('FARMER'), asyncHandler<AuthedRequest>(async (req, res) => {
  const body = z.object({ option: z.enum(['SELL_HERE', 'REROUTE_TO_MARKET', 'HOLD_OR_ESCALATE']), idempotencyKey: eventKey, buyerOfferId: z.string().optional(), marketId: z.string().optional() }).parse(req.body);
  const { shipment } = await parentContext(req.params.shipmentId);
  if (String(shipment.farmerId) !== req.userId) throw new ApiError('AUTH_FORBIDDEN', 'Only this cargo owner can choose a commercial option.');
  const ledger = await CargoLedger.findOne({ shipmentId: shipment._id });
  if (!ledger) throw new ApiError('RESOURCE_NOT_FOUND', 'Record market receipt first.');
  if (ledger.dispatchReceiptVarianceKg > 0 && !ledger.dispatchReceiptVarianceResolvedAt && body.option !== 'HOLD_OR_ESCALATE') throw fail('Operations must resolve the dispatch/receipt discrepancy before a commercial decision.');
  const duplicate = ledger.plans.find((p: any) => p.idempotencyKey === body.idempotencyKey);
  if (duplicate) return ok(res, { ledger, plan: duplicate, duplicate: true });
  if (ledger.plans.some((p: any) => ['PROPOSED', 'BOOKING_REQUESTED', 'DISPATCHED'].includes(p.status))) throw fail('Resolve or expire the existing cargo decision before creating another.');
  if (ledger.remainingAvailableKg <= 0) throw fail('There is no available cargo quantity to decide.');
  const version = ledger.revision + 1;
  let plan: any = { version, idempotencyKey: body.idempotencyKey, option: body.option, status: body.option === 'HOLD_OR_ESCALATE' ? 'ESCALATED' : 'PROPOSED', quantityKg: ledger.remainingAvailableKg, decisionAt: new Date() };
  if (body.option === 'SELL_HERE') {
    const offer = body.buyerOfferId ? await FreshBuyerOffer.findOne({ _id: body.buyerOfferId, farmerId: req.userId, validUntil: { $gt: new Date() } }) : null;
    if (!offer || offer.marketName.trim().toLowerCase() !== ledger.currentLocation.name.trim().toLowerCase()) throw fail('Choose a current buyer offer for this market.');
    plan.buyerOfferId = offer._id;
    plan.quantityKg = Math.min(ledger.remainingAvailableKg, offer.quantityKg ?? ledger.remainingAvailableKg);
    plan.targetPriceINRPerKg = offer.priceINRPerKg;
    plan.targetPriceSource = 'CONFIRMED_BUYER';
    plan.farmerApproval = { actorId: new Types.ObjectId(req.userId), option: body.option, version, at: new Date() };
  } else if (body.option === 'REROUTE_TO_MARKET') {
    const rerouteAttempts = ledger.plans.filter((p: any) => p.option === 'REROUTE_TO_MARKET' && ['BOOKING_REQUESTED', 'DISPATCHED', 'RECEIVED'].includes(p.status)).length;
    if (rerouteAttempts >= config.cargo.maxRerouteAttempts) throw fail('Configured reroute attempt limit reached; request operations assistance.');
    const routes = await rerouteOptions(ledger);
    const candidate = routes.find((option) => option.marketId === body.marketId);
    if (!candidate || !candidate.quote) throw new ApiError('NO_VEHICLE_AVAILABLE', 'No current verified transport quote is available for that market.');
    plan.marketId = candidate.marketId; plan.marketName = candidate.marketName; plan.marketLocation = candidate.marketLocation;
    plan.quoteINR = candidate.quote.amountINR; plan.vehicleId = new Types.ObjectId(candidate.quote.vehicleId); plan.transporterId = new Types.ObjectId(candidate.quote.transporterId);
    plan.routeDistanceKm = candidate.route.distanceKm; plan.routeDurationMinutes = candidate.route.durationMinutes; plan.quoteExpiresAt = new Date(Date.now() + 5 * 60_000);
    plan.targetPriceINRPerKg = candidate.marketPriceINRPerKg ?? undefined;
    plan.targetPriceSource = ['CONFIRMED_BUYER', 'INDICATIVE', 'OPERATOR_ESTIMATE', 'SIMULATED'].includes(candidate.priceSource) ? candidate.priceSource : undefined;
    plan.incrementalAdvantageINR = candidate.incrementalAdvantageINR;
    plan.marketAcceptance = candidate.marketAcceptance;
    plan.cropAcceptanceStatus = candidate.marketAcceptance;
    plan.receivingHoursStatus = candidate.receivingHoursStatus;
    plan.farmerApproval = { actorId: new Types.ObjectId(req.userId), option: body.option, version, at: new Date() };
    if (candidate.marketAcceptance !== 'OPERATIONS_VERIFIED') plan.marketAcceptance = 'UNKNOWN';
  }
  ledger.plans.push(plan);
  ledger.revision += 1;
  await ledger.save();
  ok(res, { ledger, plan: ledger.plans[ledger.plans.length - 1], duplicate: false }, 201);
}));

cargoRouter.post('/shipments/:shipmentId/decisions/:version/transporter', requireAuth, requireRole('TRANSPORTER'), asyncHandler<AuthedRequest>(async (req, res) => {
  const body = z.object({ accepted: z.boolean(), reason: z.string().max(500).default('') }).parse(req.body);
  const { shipment } = await parentContext(req.params.shipmentId);
  const ledger = await CargoLedger.findOne({ shipmentId: shipment._id });
  if (!ledger) throw new ApiError('RESOURCE_NOT_FOUND', 'Cargo ledger was not found.');
  if (!await isCurrentTransporter(ledger.tripId, req.userId)) throw new ApiError('AUTH_FORBIDDEN', 'Only the current transporter can confirm the logistics plan.');
  const plan = ledger.plans.find((p: any) => p.version === Number(req.params.version)) as any;
  if (!plan || plan.status !== 'PROPOSED') throw fail('Decision is no longer awaiting transporter confirmation.');
  plan.transporterApproval = { actorId: new Types.ObjectId(req.userId), option: plan.option, version: plan.version, accepted: body.accepted, reason: body.reason, at: new Date() };
  if (!body.accepted) plan.status = 'DECLINED';
  ledger.revision += 1;
  await ledger.save();
  ok(res, { plan, needsOperations: !body.accepted });
}));

cargoRouter.patch('/shipments/:shipmentId/decisions/:version/market-verification', requireAdmin, asyncHandler<AuthedRequest>(async (req, res) => {
  const body = z.object({ acceptedCrop: z.boolean(), receivingHoursVerified: z.boolean(), targetPriceINRPerKg: z.number().finite().min(0).optional(), targetPriceSource: z.enum(['CONFIRMED_BUYER', 'INDICATIVE', 'OPERATOR_ESTIMATE', 'SIMULATED']).optional(), targetHandlingCostsINR: z.number().finite().min(0).optional(), currentSellPriceINRPerKg: z.number().finite().min(0).optional(), currentHandlingCostsINR: z.number().finite().min(0).optional(), evidenceUrl: z.string().url(), note: z.string().min(5).max(500) }).parse(req.body);
  const ledger = await CargoLedger.findOne({ shipmentId: req.params.shipmentId });
  if (!ledger) throw new ApiError('RESOURCE_NOT_FOUND', 'Cargo ledger was not found.');
  const plan = ledger.plans.find((p: any) => p.version === Number(req.params.version)) as any;
  if (!plan || plan.option !== 'REROUTE_TO_MARKET' || plan.status !== 'PROPOSED') throw fail('Only an active reroute proposal can receive market verification.');
  const record = {
    marketId: plan.marketId, marketName: plan.marketName, acceptedCrop: body.acceptedCrop,
    receivingHoursVerified: body.receivingHoursVerified, targetPriceINRPerKg: body.targetPriceINRPerKg,
    targetPriceSource: body.targetPriceSource, targetHandlingCostsINR: body.targetHandlingCostsINR,
    currentSellPriceINRPerKg: body.currentSellPriceINRPerKg, currentHandlingCostsINR: body.currentHandlingCostsINR,
    evidenceUrl: body.evidenceUrl, note: body.note, verifiedBy: req.userId, verifiedAt: new Date(),
  };
  ledger.marketRecords.push(record as never);
  // Verification may change the commercial facts shown to both parties. Their earlier approvals must be repeated against the new version.
  plan.status = 'EXPIRED';
  plan.marketEvidenceUrl = body.evidenceUrl;
  plan.marketVerificationNote = body.note;
  plan.verifiedBy = req.userId;
  plan.verifiedAt = new Date();
  ledger.revision += 1;
  await ledger.save();
  ok(res, { verification: record, previousDecisionExpired: true, message: 'Create a fresh decision so both parties approve the verified market facts.' });
}));

cargoRouter.post('/shipments/:shipmentId/decisions/:version/execute', requireAuth, requireRole('FARMER'), asyncHandler<AuthedRequest>(async (req, res) => {
  const { shipment } = await parentContext(req.params.shipmentId);
  if (String(shipment.farmerId) !== req.userId) throw new ApiError('AUTH_FORBIDDEN', 'Only the cargo owner can execute a commercial decision.');
  const ledger = await CargoLedger.findOne({ shipmentId: shipment._id });
  if (!ledger) throw new ApiError('RESOURCE_NOT_FOUND', 'Cargo ledger was not found.');
  const plan = ledger.plans.find((p: any) => p.version === Number(req.params.version)) as any;
  if (!plan || plan.option !== 'REROUTE_TO_MARKET' || plan.status !== 'PROPOSED') throw fail('This reroute plan is not executable.');
  if (!hasSameOptionApprovals(plan)) throw fail('Farmer and transporter must approve the same option and version.');
  if (plan.marketAcceptance !== 'OPERATIONS_VERIFIED' || plan.cropAcceptanceStatus !== 'OPERATIONS_VERIFIED' || plan.receivingHoursStatus !== 'OPERATIONS_VERIFIED' || plan.targetPriceINRPerKg == null || ['SIMULATED'].includes(plan.targetPriceSource)) throw fail('Operations must verify market acceptance, receiving hours and a non-simulated price before rerouting.');
  if (plan.incrementalAdvantageINR == null || plan.incrementalAdvantageINR < config.cargo.minRerouteBenefitINR) throw fail('Reroute does not meet the configured minimum economic benefit using known current costs.');
  const completedAttempts = ledger.plans.filter((p: any) => p.option === 'REROUTE_TO_MARKET' && ['BOOKING_REQUESTED', 'DISPATCHED', 'RECEIVED'].includes(p.status)).length;
  if (completedAttempts >= config.cargo.maxRerouteAttempts) throw fail('Configured reroute attempt limit reached; request operations assistance.');
  if (!plan.quoteExpiresAt || new Date(plan.quoteExpiresAt).getTime() <= Date.now()) { plan.status = 'EXPIRED'; await ledger.save(); return ok(res, { reconfirmationRequired: true, reason: 'QUOTE_EXPIRED' }); }
  if (plan.quantityKg !== ledger.remainingAvailableKg) { plan.status = 'EXPIRED'; await ledger.save(); return ok(res, { reconfirmationRequired: true, reason: 'QUANTITY_CHANGED' }); }
  const { request } = await freshContext(ledger);
  if (!request) throw new ApiError('RESOURCE_NOT_FOUND', 'Original transport request was not found.');
  const freshOptions = await rerouteOptions(ledger);
  const refreshed = freshOptions.find((option) => option.marketId === plan.marketId);
  const candidate = refreshed?.quote;
  if (!candidate || candidate.vehicleId !== String(plan.vehicleId) || candidate.transporterId !== String(plan.transporterId) || Math.abs(candidate.amountINR - plan.quoteINR) > Math.max(50, plan.quoteINR * 0.03) || refreshed.incrementalAdvantageINR !== plan.incrementalAdvantageINR || refreshed.marketAcceptance !== plan.marketAcceptance || refreshed.receivingHoursStatus !== plan.receivingHoursStatus) { plan.status = 'EXPIRED'; await ledger.save(); return ok(res, { reconfirmationRequired: true, reason: 'QUOTE_MARKET_OR_ECONOMIC_FACTS_CHANGED' }); }
  if (!refreshed.minimumBenefitMet) throw fail('Reroute no longer meets the configured minimum economic benefit.');
  const requestId = createHash('sha256').update(`cargo-reroute:${String(ledger._id)}:${plan.version}`).digest('hex').slice(0, 24);
  let rerouteRequest = await TransportRequest.findOne({ cargoPlanId: ledger._id, cargoPlanVersion: plan.version });
  if (!rerouteRequest) {
    try {
      rerouteRequest = await createRequest(req.userId, { id: requestId, cropType: ledger.cropType, quantityKg: ledger.remainingAvailableKg, pickup: { name: ledger.currentLocation.name, lat: ledger.currentLocation.lat as number, lng: ledger.currentLocation.lng as number }, destination: { name: plan.marketName, lat: plan.marketLocation.lat as number, lng: plan.marketLocation.lng as number }, preferredDate: new Date(), notes: `Reroute for parent shipment ${String(shipment._id)}; approved plan ${plan.version}.`, cargoLink: { parentShipmentId: String(shipment._id), cargoPlanId: String(ledger._id), cargoPlanVersion: plan.version } });
    } catch (error) {
      if ((error as { code?: number }).code !== 11000) throw error;
      rerouteRequest = await TransportRequest.findOne({ cargoPlanId: ledger._id, cargoPlanVersion: plan.version });
      if (!rerouteRequest) throw new ApiError('CONCURRENT_BOOKING', 'The reroute request is being created. Refresh the cargo decision before retrying.');
    }
  }
  plan.status = 'BOOKING_REQUESTED'; plan.requestId = rerouteRequest._id;
  ledger.revision += 1;
  await ledger.save();
  ok(res, { request: rerouteRequest, linkedParentShipmentId: String(shipment._id), quantityKg: ledger.remainingAvailableKg, sunkFirstLegCostINR: shipment.finalPrice ?? shipment.allocatedPrice, incrementalRouteQuoteINR: plan.quoteINR, note: 'The existing transporter offer/booking flow now handles this linked cargo leg.' }, 201);
}));

cargoRouter.post('/shipments/:shipmentId/decisions/:version/cancel', requireAuth, asyncHandler<AuthedRequest>(async (req, res) => {
  const { reason } = z.object({ reason: z.string().min(3).max(300) }).parse(req.body);
  const { shipment } = await parentContext(req.params.shipmentId);
  const ledger = await CargoLedger.findOne({ shipmentId: shipment._id });
  if (!ledger) throw new ApiError('RESOURCE_NOT_FOUND', 'Cargo ledger was not found.');
  const farmer = req.role === 'FARMER' && String(shipment.farmerId) === req.userId;
  const transporter = req.role === 'TRANSPORTER' && await isCurrentTransporter(ledger.tripId, req.userId);
  if (!farmer && !transporter) throw new ApiError('AUTH_FORBIDDEN', 'Only a cargo party can cancel this reroute request.');
  const plan = ledger.plans.find((p: any) => p.version === Number(req.params.version)) as any;
  if (!plan || !['PROPOSED', 'BOOKING_REQUESTED'].includes(plan.status)) throw fail('This decision cannot be cancelled in its current state.');
  if (plan.requestId) {
    const request = await TransportRequest.findById(plan.requestId);
    if (request && request.tripId) throw fail('A transporter has already been selected; use the existing trip cancellation and operations process.');
    if (request && request.state !== 'CANCELLED') { request.state = 'CANCELLED'; request.cancelledAt = new Date(); request.cancelReason = reason; await request.save(); }
  }
  plan.status = 'DECLINED';
  plan.cancelledBy = req.userId;
  plan.cancelReason = reason;
  ledger.revision += 1; await ledger.save();
  ok(res, { ledger, plan });
}));

cargoRouter.post('/shipments/:shipmentId/decisions/:version/sell', requireAuth, requireRole('FARMER'), asyncHandler<AuthedRequest>(async (req, res) => {
  const body = z.object({ quantityKg: z.number().finite().positive(), priceINRPerKg: z.number().finite().min(0), evidenceUrls: z.array(z.string().url()).min(1).max(5), idempotencyKey: eventKey }).parse(req.body);
  const { shipment } = await parentContext(req.params.shipmentId);
  if (String(shipment.farmerId) !== req.userId) throw new ApiError('AUTH_FORBIDDEN', 'Only the cargo owner can accept a sale.');
  const ledger = await CargoLedger.findOne({ shipmentId: shipment._id });
  if (!ledger) throw new ApiError('RESOURCE_NOT_FOUND', 'Cargo ledger was not found.');
  const priorSale = ledger.events.find((event) => event.idempotencyKey === body.idempotencyKey);
  if (priorSale) {
    if (!cargoEventMatches(priorSale, { type: 'SALE', quantityKg: body.quantityKg, decisionPlanVersion: Number(req.params.version), priceINRPerKg: body.priceINRPerKg })) throw fail('This idempotency key was already used for a different cargo event.');
    return ok(res, { ledger, duplicate: true, saleEvidenceStatus: 'FARMER_REPORTED_UNVERIFIED' });
  }
  const plan = ledger.plans.find((p: any) => p.version === Number(req.params.version)) as any;
  if (!plan || plan.option !== 'SELL_HERE' || plan.status !== 'PROPOSED' || plan.quantityKg < body.quantityKg) throw fail('There is no matching current sell-here decision for this quantity.');
  if (!plan.transporterApproval?.accepted || plan.transporterApproval.version !== plan.version || plan.transporterApproval.option !== plan.option) throw fail('The current transporter must confirm the same sell-here handoff before the farmer accepts the sale.');
  const offer = await FreshBuyerOffer.findOne({ _id: plan.buyerOfferId, farmerId: req.userId, validUntil: { $gt: new Date() } });
  if (!offer || offer.priceINRPerKg !== body.priceINRPerKg || offer.marketName.trim().toLowerCase() !== ledger.currentLocation.name.trim().toLowerCase() || (offer.quantityKg != null && offer.quantityKg < body.quantityKg)) throw fail('Buyer offer expired or changed; request a new decision.');
  const planSoldKg = resultSaleKg(ledger.events, plan.version);
  if (planSoldKg + body.quantityKg > plan.quantityKg) throw new ApiError('CAPACITY_EXCEEDED', 'Sale quantity exceeds the farmer-approved buyer quantity.');
  const result = await appendEvent(ledger, { type: 'SALE', key: body.idempotencyKey, quantityKg: body.quantityKg, actorId: req.userId, source: 'FARMER_REPORTED', location: ledger.currentLocation, evidenceUrls: body.evidenceUrls, buyerOfferId: String(offer._id), decisionPlanVersion: plan.version, priceINRPerKg: body.priceINRPerKg, note: `Buyer quote ${offer.evidenceStatus}` });
  if (planSoldKg + body.quantityKg >= plan.quantityKg) plan.status = 'RECEIVED';
  result.ledger.revision += 1; await result.ledger.save();
  ok(res, { ledger: result.ledger, duplicate: result.duplicate, saleEvidenceStatus: offer.evidenceStatus });
}));
