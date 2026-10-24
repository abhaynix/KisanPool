import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

const schema = new Schema({
  marketId: { type: Schema.Types.ObjectId, ref: 'Market', required: true, index: true },
  cropKey: { type: String, required: true, lowercase: true, trim: true },
  accepted: { type: Boolean, required: true },
  receivingHours: { type: String, required: true, trim: true },
  receivingHoursVerified: { type: Boolean, required: true },
  /** Machine-checkable receiving window in IST hours (e.g. 6 and 14 for 06:00–14:00). */
  receivingOpenHourIST: { type: Number, min: 0, max: 23, default: null },
  receivingCloseHourIST: { type: Number, min: 1, max: 24, default: null },
  sourceName: { type: String, required: true, trim: true },
  sourceUrl: { type: String, default: null },
  observedAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true },
  verificationStatus: { type: String, enum: ['OPERATIONS_VERIFIED'], default: 'OPERATIONS_VERIFIED', required: true },
  verifiedBy: { type: String, required: true },
}, { timestamps: true });

schema.index({ marketId: 1, cropKey: 1, observedAt: -1 });
export type MarketAcceptanceAttrs = InferSchemaType<typeof schema>;
export type MarketAcceptanceDoc = HydratedDocument<MarketAcceptanceAttrs>;
export const MarketAcceptanceObservation = model('MarketAcceptanceObservation', schema);
