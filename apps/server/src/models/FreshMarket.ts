import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

export const ACCEPTED_CROPS = ['tomato', 'onion', 'grapes'] as const;
export type AcceptedCrop = (typeof ACCEPTED_CROPS)[number];

const freshMarketSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, 'Market ka naam zaroori hai'],
      trim: true,
      maxlength: 120,
    },
    code: {
      type: String,
      required: [true, 'Market ka code zaroori hai'],
      trim: true,
      lowercase: true,
      unique: true,
      set: (val: string) => val?.trim().toLowerCase(),
    },
    location: {
      lat: {
        type: Number,
        required: [true, 'Latitude zaroori hai'],
        min: [8, 'Latitude 8 se 37 ke beech honi chahiye'],
        max: [37, 'Latitude 8 se 37 ke beech honi chahiye'],
      },
      lng: {
        type: Number,
        required: [true, 'Longitude zaroori hai'],
        min: [68, 'Longitude 68 se 98 ke beech honi chahiye'],
        max: [98, 'Longitude 68 se 98 ke beech honi chahiye'],
      },
    },
    active: {
      type: Boolean,
      default: true,
    },
    commissionPct: {
      type: Number,
      default: 0,
      min: [0, 'Commission 0 se 30% ke beech honi chahiye'],
      max: [30, 'Commission 0 se 30% ke beech honi chahiye'],
    },
    handlingINRPerKg: {
      type: Number,
      default: 0,
      min: [0, 'Handling charge 0 ya usse zyada hona chahiye'],
    },
    acceptedCrops: {
      type: [String],
      default: ['tomato', 'onion', 'grapes'],
      set: (crops: string[]) =>
        Array.isArray(crops)
          ? crops.map((c) => String(c).trim().toLowerCase()).filter(Boolean)
          : ['tomato', 'onion', 'grapes'],
    },
    demands: [
      {
        crop: { type: String, required: true, trim: true, lowercase: true },
        quantityNeededKg: { type: Number, default: 0 },
        targetPriceINRPerKg: { type: Number, default: 0 },
        notes: { type: String, trim: true },
      },
    ],
  },
  { timestamps: true },
);

export type FreshMarketAttrs = InferSchemaType<typeof freshMarketSchema>;
export type FreshMarketDoc = HydratedDocument<FreshMarketAttrs>;
export const FreshMarket = model('FreshMarket', freshMarketSchema);
