import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';
import {
  MARKET_PRICE_SOURCE_TYPES,
  MARKET_PRICE_STATUSES,
  MARKET_PRICE_UNITS,
  normalizeMarketPrice,
} from '@kisanpool/shared';

const marketPriceObservationSchema = new Schema(
  {
    marketId: { type: Schema.Types.ObjectId, ref: 'Market', required: true },
    cropKey: { type: String, required: true, trim: true, lowercase: true },
    sourceCommodityName: { type: String, required: true, trim: true },
    grade: { type: String, default: undefined },
    variety: { type: String, default: undefined },
    sourceMinPrice: { type: Number, required: true, min: 0 },
    sourceModalPrice: { type: Number, required: true, min: 0 },
    sourceMaxPrice: { type: Number, required: true, min: 0 },
    sourcePriceUnit: { type: String, enum: MARKET_PRICE_UNITS, required: true },
    minPriceINRPerKg: { type: Number, min: 0, default: null },
    modalPriceINRPerKg: { type: Number, min: 0, default: null },
    maxPriceINRPerKg: { type: Number, min: 0, default: null },
    currency: { type: String, enum: ['INR'], default: 'INR', required: true },
    sourceType: { type: String, enum: MARKET_PRICE_SOURCE_TYPES, required: true },
    sourceName: { type: String, required: true, trim: true },
    sourceUrl: { type: String, default: null },
    sourceRecordId: { type: String, default: null },
    observedAt: { type: Date, default: null },
    fetchedAt: { type: Date, default: null },
    dataStatus: { type: String, enum: MARKET_PRICE_STATUSES, required: true },
    validationErrors: { type: [String], default: [] },
  },
  { timestamps: true },
);

marketPriceObservationSchema.index({ marketId: 1, cropKey: 1, observedAt: -1 });
marketPriceObservationSchema.index(
  { sourceType: 1, sourceRecordId: 1 },
  { unique: true, partialFilterExpression: { sourceRecordId: { $type: 'string' } } },
);

marketPriceObservationSchema.pre('validate', function validatePrice(next) {
  const normalized = normalizeMarketPrice({
    sourceMinPrice: this.sourceMinPrice,
    sourceModalPrice: this.sourceModalPrice,
    sourceMaxPrice: this.sourceMaxPrice,
    sourcePriceUnit: this.sourcePriceUnit,
    sourceType: this.sourceType,
    sourceName: this.sourceName,
    sourceUrl: this.sourceUrl,
    sourceRecordId: this.sourceRecordId,
    observedAt: this.observedAt,
    fetchedAt: this.fetchedAt,
  });
  this.minPriceINRPerKg = normalized.minPriceINRPerKg ?? undefined;
  this.modalPriceINRPerKg = normalized.modalPriceINRPerKg ?? undefined;
  this.maxPriceINRPerKg = normalized.maxPriceINRPerKg ?? undefined;
  this.currency = normalized.currency;
  this.dataStatus = normalized.dataStatus;
  this.validationErrors = normalized.validationErrors;

  if (this.sourceMinPrice > this.sourceModalPrice) {
    this.invalidate('sourceModalPrice', 'Source modal price cannot be below the minimum.');
  }
  if (this.sourceModalPrice > this.sourceMaxPrice) {
    this.invalidate('sourceModalPrice', 'Source modal price cannot exceed the maximum.');
  }
  if (this.dataStatus === 'VALID' && (!this.observedAt || !this.fetchedAt)) {
    this.invalidate('dataStatus', 'A valid live observation requires observedAt and fetchedAt.');
  }
  if (this.dataStatus === 'VALID' && this.sourceType === 'SIMULATED') {
    this.invalidate('dataStatus', 'Simulated observations cannot have VALID status.');
  }
  if (this.dataStatus === 'SIMULATED' && this.sourceType !== 'SIMULATED') {
    this.invalidate('dataStatus', 'SIMULATED status requires a simulated source.');
  }
  if (this.sourceType === 'SIMULATED' && !['SIMULATED', 'INVALID'].includes(this.dataStatus)) {
    this.invalidate('dataStatus', 'Simulated sources cannot be marked as live observations.');
  }
  if (this.dataStatus === 'INVALID' && this.validationErrors.length === 0) {
    this.invalidate('validationErrors', 'Invalid observations must explain why validation failed.');
  }
  if (this.dataStatus === 'VALID') {
    const divisor = this.sourcePriceUnit === 'INR_PER_KG'
      ? 1
      : this.sourcePriceUnit === 'INR_PER_QUINTAL'
        ? 100
        : 1000;
    const normalizedPrices = [
      this.minPriceINRPerKg,
      this.modalPriceINRPerKg,
      this.maxPriceINRPerKg,
    ];
    const sourcePrices = [this.sourceMinPrice, this.sourceModalPrice, this.sourceMaxPrice];
    if (normalizedPrices.some((price, index) =>
      price == null || Math.abs(price - Number((sourcePrices[index] / divisor).toFixed(6))) > 0.000001,
    )) {
      this.invalidate('dataStatus', 'VALID observations must contain matching INR/kg values.');
    }
  }
  if (this.observedAt && this.fetchedAt && this.observedAt > this.fetchedAt) {
    this.invalidate('observedAt', 'observedAt cannot be later than fetchedAt.');
  }
  next();
});

export type MarketPriceObservationAttrs = InferSchemaType<typeof marketPriceObservationSchema>;
export type MarketPriceObservationDoc = HydratedDocument<MarketPriceObservationAttrs>;
export const MarketPriceObservation = model('MarketPriceObservation', marketPriceObservationSchema);
