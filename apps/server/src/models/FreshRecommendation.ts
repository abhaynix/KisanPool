import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

const freshRecommendationSchema = new Schema(
  {
    farmerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    input: { type: Schema.Types.Mixed, required: true, immutable: true },
    generatedAt: { type: Date, required: true, immutable: true },
    expiresAt: { type: Date, required: true, immutable: true },
    cropProfileVersion: { type: String, required: true, immutable: true },
    freshnessModelVersion: { type: String, required: true, immutable: true },
    pricePolicyVersion: { type: String, required: true, immutable: true },
    rankingPolicyVersion: { type: String, required: true, immutable: true },
    options: { type: [Schema.Types.Mixed], required: true, immutable: true },
    recommendations: { type: Schema.Types.Mixed, required: true, immutable: true },
    warnings: { type: [String], default: [], immutable: true },
    missingData: { type: [String], default: [], immutable: true },
    status: { type: String, enum: ['READY', 'NO_FEASIBLE_MARKET'], required: true, immutable: true },
  },
  { timestamps: true },
);

freshRecommendationSchema.index({ farmerId: 1, generatedAt: -1 });

export type FreshRecommendationAttrs = InferSchemaType<typeof freshRecommendationSchema>;
export type FreshRecommendationDoc = HydratedDocument<FreshRecommendationAttrs>;
export const FreshRecommendation = model('FreshRecommendation', freshRecommendationSchema);
