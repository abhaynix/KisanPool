import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';
import { ACCEPTED_CROPS, type AcceptedCrop } from './FreshMarket';

export const PRICE_UNITS = ['kg', 'quintal', 'tonne'] as const;
export type PriceUnit = (typeof PRICE_UNITS)[number];

export const SOURCE_TYPES = ['OFFICIAL', 'OPERATOR', 'DEMO'] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

const freshPriceSchema = new Schema(
  {
    marketId: {
      type: Schema.Types.ObjectId,
      ref: 'FreshMarket',
      required: [true, 'Market ID zaroori hai'],
      index: true,
    },
    crop: {
      type: String,
      enum: {
        values: ACCEPTED_CROPS,
        message: 'Valid crop select karein (tomato, onion, grapes)',
      },
      required: [true, 'Crop zaroori hai'],
      index: true,
    },
    price: {
      type: Number,
      required: [true, 'Price zaroori hai'],
      min: [0.0001, 'Price 0 se zyada honi chahiye'],
    },
    unit: {
      type: String,
      enum: {
        values: PRICE_UNITS,
        message: 'Unit kg, quintal, ya tonne hona chahiye',
      },
      required: [true, 'Price unit zaroori hai'],
      default: 'quintal',
    },
    sourceType: {
      type: String,
      enum: {
        values: SOURCE_TYPES,
        message: 'Source type OFFICIAL, OPERATOR, ya DEMO hona chahiye',
      },
      required: [true, 'Source type zaroori hai'],
      default: 'OPERATOR',
    },
    observedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    fetchedAt: {
      type: Date,
      default: Date.now,
    },
    createdBy: {
      type: String,
      default: 'operator',
    },
  },
  { timestamps: true },
);

freshPriceSchema.index({ marketId: 1, crop: 1, observedAt: -1 });

export type FreshPriceAttrs = InferSchemaType<typeof freshPriceSchema>;
export type FreshPriceDoc = HydratedDocument<FreshPriceAttrs>;
export const FreshPrice = model('FreshPrice', freshPriceSchema);
