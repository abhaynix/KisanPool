import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

const schema = new Schema({
  code: { type: String, required: true, lowercase: true, trim: true, unique: true },
  name: { type: String, required: true, trim: true },
  location: { name: { type: String, default: '' }, lat: { type: Number, required: true, min: -90, max: 90 }, lng: { type: Number, required: true, min: -180, max: 180 } },
  sourceName: { type: String, required: true, trim: true },
  sourceUrl: { type: String, default: null },
  verifiedAt: { type: Date, default: null },
  verifiedBy: { type: String, default: null },
  active: { type: Boolean, default: true },
  /** Market-side selling costs. Unverified costs keep a market out of definitive ranking. */
  costs: {
    commissionPct: { type: Number, min: 0, max: 30, default: null },
    handlingINRPerKg: { type: Number, min: 0, max: 100, default: null },
    costsVerified: { type: Boolean, default: false },
    costsSourceName: { type: String, default: null },
  },
}, { timestamps: true });

schema.index({ active: 1, code: 1 });
export type MarketAttrs = InferSchemaType<typeof schema>;
export type MarketDoc = HydratedDocument<MarketAttrs>;
export const Market = model('Market', schema);
