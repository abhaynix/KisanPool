import { Types } from 'mongoose';
import { ApiError } from '../../lib/envelope';
import { CargoLedger, Trip } from '../../models';

/** Move the already-counted remainder only when the existing child shipment picks up or delivers. */
export async function recordLinkedCargoTransition(input: {
  shipment: { _id: Types.ObjectId; cargoParentShipmentId?: Types.ObjectId | null; cargoPlanId?: Types.ObjectId | null; cargoPlanVersion?: number | null; quantityKg: number };
  state: 'PICKED_UP' | 'DELIVERED';
  actorId: string;
  tripId: Types.ObjectId;
}): Promise<void> {
  const shipment = input.shipment;
  if (!shipment.cargoParentShipmentId || !shipment.cargoPlanId || shipment.cargoPlanVersion == null) return;
  const ledger = await CargoLedger.findById(shipment.cargoPlanId);
  if (!ledger || String(ledger.shipmentId) !== String(shipment.cargoParentShipmentId)) {
    throw new ApiError('RESOURCE_NOT_FOUND', 'The parent cargo ledger for this reroute is missing.');
  }
  const plan = ledger.plans.find((row) => row.version === shipment.cargoPlanVersion);
  const eventType = input.state === 'PICKED_UP' ? 'REROUTE_DISPATCHED' : 'REROUTE_RECEIVED';
  const key = `${eventType.toLowerCase()}:${String(shipment._id)}`;
  if (ledger.events.some((event) => event.idempotencyKey === key)) return;
  if (!plan || (input.state === 'PICKED_UP' && plan.status !== 'BOOKING_REQUESTED') || (input.state === 'DELIVERED' && plan.status !== 'DISPATCHED')) {
    throw new ApiError('BOOKING_STATE_INVALID', 'The linked cargo leg is not in a state for this transition.');
  }
  if (input.state === 'PICKED_UP') {
    if (shipment.quantityKg !== plan.quantityKg || shipment.quantityKg > ledger.remainingAvailableKg) {
      throw new ApiError('CAPACITY_EXCEEDED', 'Linked cargo quantity no longer matches the approved remaining balance.');
    }
    ledger.remainingAvailableKg -= shipment.quantityKg;
    ledger.inTransitKg += shipment.quantityKg;
    plan.status = 'DISPATCHED';
  } else {
    if (shipment.quantityKg > ledger.inTransitKg) throw new ApiError('CAPACITY_EXCEEDED', 'Received reroute quantity exceeds cargo in transit.');
    ledger.inTransitKg -= shipment.quantityKg;
    ledger.remainingAvailableKg += shipment.quantityKg;
    const trip = await Trip.findById(input.tripId);
    if (!trip) throw new ApiError('RESOURCE_NOT_FOUND', 'The reroute trip was not found.');
    ledger.currentLocation = { name: trip.destination.name ?? plan.marketName, lat: trip.destination.lat as number, lng: trip.destination.lng as number } as never;
    plan.status = 'RECEIVED';
  }
  ledger.events.push({ type: eventType, idempotencyKey: key, quantityKg: shipment.quantityKg, at: new Date(), actorId: input.actorId, source: 'TRANSPORTER_REPORTED', location: ledger.currentLocation, note: `Linked cargo plan ${plan.version}` } as never);
  ledger.revision += 1;
  try { await ledger.save(); }
  catch (error) {
    if ((error as { name?: string }).name === 'VersionError') throw new ApiError('CONCURRENT_BOOKING', 'Cargo quantity changed; refresh before retrying.');
    throw error;
  }
}
