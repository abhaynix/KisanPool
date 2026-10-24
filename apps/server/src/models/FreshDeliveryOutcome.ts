import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

const freshDeliveryOutcomeSchema = new Schema({
  farmerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  requestId: { type: Schema.Types.ObjectId, ref: 'TransportRequest', required: true, unique: true },
  tripId: { type: Schema.Types.ObjectId, ref: 'Trip', required: true, index: true },
  shipmentId: { type: Schema.Types.ObjectId, ref: 'TripShipment', required: true, unique: true },
  recommendationId: { type: Schema.Types.ObjectId, ref: 'FreshRecommendation', default: undefined },
  expectedSoldPriceINRPerKg: { type: Number, min: 0, default: undefined },
  expectedSaleableKg: { type: Number, min: 0, default: undefined },
  expectedArrivalAt: { type: Date, default: undefined },
  expectedTransportCostINR: { type: Number, min: 0, default: undefined },
  actualPickupAt: { type: Date, required: true },
  actualDeliveredAt: { type: Date, required: true },
  actualSoldPriceINRPerKg: { type: Number, min: 0, default: undefined },
  acceptedKg: { type: Number, required: true, min: 0 },
  rejectedKg: { type: Number, required: true, min: 0 },
  additionalCostsINR: { type: Number, min: 0, default: undefined },
  qualityOutcome: { type: String, enum: ['ACCEPTED', 'PARTIAL_REJECTION', 'REJECTED', 'NOT_REPORTED'], required: true },
  evidenceSource: { type: String, enum: ['FARMER_REPORTED'], required: true, default: 'FARMER_REPORTED' },
}, { timestamps: true });

export type FreshDeliveryOutcomeAttrs = InferSchemaType<typeof freshDeliveryOutcomeSchema>;
export type FreshDeliveryOutcomeDoc = HydratedDocument<FreshDeliveryOutcomeAttrs>;
export const FreshDeliveryOutcome = model('FreshDeliveryOutcome', freshDeliveryOutcomeSchema);
