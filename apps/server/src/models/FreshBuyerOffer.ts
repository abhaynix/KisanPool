import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

const freshBuyerOfferSchema = new Schema({
  farmerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  recommendationId: { type: Schema.Types.ObjectId, ref: 'FreshRecommendation', required: true, index: true },
  marketName: { type: String, required: true, trim: true, maxlength: 120 },
  buyerLabel: { type: String, trim: true, maxlength: 120, default: '' },
  priceINRPerKg: { type: Number, required: true, min: 0 },
  quantityKg: { type: Number, min: 0, default: undefined },
  validUntil: { type: Date, required: true },
  evidenceStatus: { type: String, enum: ['FARMER_REPORTED_UNVERIFIED'], required: true, default: 'FARMER_REPORTED_UNVERIFIED' },
}, { timestamps: true });

export type FreshBuyerOfferAttrs = InferSchemaType<typeof freshBuyerOfferSchema>;
export type FreshBuyerOfferDoc = HydratedDocument<FreshBuyerOfferAttrs>;
export const FreshBuyerOffer = model('FreshBuyerOffer', freshBuyerOfferSchema);
