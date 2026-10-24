import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

const custodySchema = new Schema({
  transporterId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  at: { type: Date, required: true },
  completedDistanceKm: { type: Number, required: true, min: 0 },
  location: { name: { type: String, default: '' }, lat: Number, lng: Number },
  shipments: [{ shipmentId: { type: Schema.Types.ObjectId, required: true }, quantityKg: Number, condition: { type: String, required: true } }],
  evidenceUrls: [{ type: String }],
}, { _id: false });

/** Immutable parent trip plus sequential recovery leg and handover audit trail (ADR-047). */
const schema = new Schema({
  tripId: { type: Schema.Types.ObjectId, ref: 'Trip', required: true, index: true },
  reportedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  originalTransporterId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  originalVehicleId: { type: Schema.Types.ObjectId, ref: 'Vehicle', required: true },
  status: { type: String, enum: ['REPORTED', 'SAFETY_CHECK', 'RECOVERY_REQUIRED', 'SEARCHING_REPLACEMENT', 'AWAITING_CONFIRMATION', 'HANDOVER_IN_PROGRESS', 'RECOVERED', 'ESCALATED_TO_OPERATIONS', 'NO_REPLACEMENT_AVAILABLE', 'CLOSED'], default: 'REPORTED', index: true },
  category: { type: String, enum: ['BREAKDOWN', 'ACCIDENT', 'WEATHER', 'ROAD_BLOCK', 'OTHER'], required: true },
  description: { type: String, required: true, maxlength: 1000 },
  location: { name: { type: String, default: '' }, lat: { type: Number, required: true }, lng: { type: Number, required: true }, source: { type: String, enum: ['GPS', 'DRIVER', 'OTHER'], required: true } },
  safetyNote: { type: String, default: '' },
  affectedShipments: [{ shipmentId: { type: Schema.Types.ObjectId, required: true }, farmerId: { type: Schema.Types.ObjectId, ref: 'User', required: true }, quantityKg: { type: Number, required: true }, condition: { type: String, default: 'UNKNOWN' } }],
  replacement: { transporterId: { type: Schema.Types.ObjectId, ref: 'User' }, vehicleId: { type: Schema.Types.ObjectId, ref: 'Vehicle' }, distanceKm: Number, quoteTotal: Number, quoteShares: [{ shipmentId: Schema.Types.ObjectId, farmerId: Schema.Types.ObjectId, amount: Number }], proposedAt: Date, replacementAcceptedAt: Date, originalDriverAcceptedAt: Date },
  custodyAcks: { type: [custodySchema], default: [] },
  legs: [{ sequence: Number, transporterId: Schema.Types.ObjectId, vehicleId: Schema.Types.ObjectId, from: { name: String, lat: Number, lng: Number }, to: { name: String, lat: Number, lng: Number }, distanceKm: Number, quotedCost: Number, compensation: Number, state: { type: String, enum: ['ACTIVE', 'COMPLETED'], default: 'ACTIVE' }, startedAt: Date, completedAt: Date }],
  settlement: { status: { type: String, enum: ['PENDING_OPERATIONS_REVIEW', 'BLOCKED_PAYOUT_CAPABILITY'], default: 'PENDING_OPERATIONS_REVIEW' }, ledger: [{ legSequence: Number, transporterId: Schema.Types.ObjectId, quotedCost: Number, earnedCompensation: Number, farmerChargeAdjustment: { type: Number, default: 0 }, paymentIds: [Schema.Types.ObjectId], recordedAt: Date }] },
  escalationReason: { type: String, default: '' },
}, { timestamps: true });

schema.index({ tripId: 1, status: 1 });
export type RecoveryIncidentDoc = HydratedDocument<InferSchemaType<typeof schema>>;
export const RecoveryIncident = model('RecoveryIncident', schema);
