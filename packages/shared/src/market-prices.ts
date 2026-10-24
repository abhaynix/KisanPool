/** Provenance and normalized units for market price observations (T02). */

export const MARKET_PRICE_SOURCE_TYPES = [
  'OFFICIAL',
  'CONFIRMED_BUYER',
  'OPERATOR_INDICATIVE',
  'SIMULATED',
] as const;
export type MarketPriceSourceType = (typeof MARKET_PRICE_SOURCE_TYPES)[number];

export const MARKET_PRICE_UNITS = ['INR_PER_KG', 'INR_PER_QUINTAL', 'INR_PER_TONNE'] as const;
export type MarketPriceUnit = (typeof MARKET_PRICE_UNITS)[number];

export const MARKET_PRICE_STATUSES = ['VALID', 'STALE', 'EXPIRED', 'INVALID', 'SIMULATED'] as const;
export type MarketPriceStatus = (typeof MARKET_PRICE_STATUSES)[number];

export interface MarketPriceObservationInput {
  sourceMinPrice: number;
  sourceModalPrice: number;
  sourceMaxPrice: number;
  sourcePriceUnit: MarketPriceUnit | string;
  sourceType: MarketPriceSourceType;
  sourceName: string;
  sourceUrl?: string | null;
  sourceRecordId?: string | null;
  observedAt?: string | Date | null;
  fetchedAt?: string | Date | null;
}

export interface NormalizedMarketPrice {
  sourceMinPrice: number;
  sourceModalPrice: number;
  sourceMaxPrice: number;
  sourcePriceUnit: string;
  minPriceINRPerKg: number | null;
  modalPriceINRPerKg: number | null;
  maxPriceINRPerKg: number | null;
  currency: 'INR';
  sourceType: MarketPriceSourceType;
  sourceName: string;
  sourceUrl: string | null;
  sourceRecordId: string | null;
  observedAt: Date | null;
  fetchedAt: Date | null;
  dataStatus: MarketPriceStatus;
  validationErrors: string[];
}

const KG_PER_UNIT: Record<MarketPriceUnit, number> = {
  INR_PER_KG: 1,
  INR_PER_QUINTAL: 100,
  INR_PER_TONNE: 1000,
};

const asDate = (value: string | Date | null | undefined): Date | null => {
  if (value == null) return null;
  const date = value instanceof Date ? new Date(value) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

/**
 * Preserve raw source values and provenance while deriving INR/kg. Simulated
 * observations stay explicitly SIMULATED and can never be mistaken for live data.
 */
export function normalizeMarketPrice(
  input: MarketPriceObservationInput,
  options: { now?: Date; staleAfterMs?: number; expiresAfterMs?: number } = {},
): NormalizedMarketPrice {
  const observedAt = asDate(input.observedAt);
  const fetchedAt = asDate(input.fetchedAt);
  const unit = input.sourcePriceUnit as MarketPriceUnit;
  const errors: string[] = [];
  const values = [input.sourceMinPrice, input.sourceModalPrice, input.sourceMaxPrice];

  if (!MARKET_PRICE_UNITS.includes(unit)) errors.push('UNKNOWN_PRICE_UNIT');
  if (!MARKET_PRICE_SOURCE_TYPES.includes(input.sourceType)) errors.push('UNKNOWN_SOURCE_TYPE');
  if (values.some((value) => !Number.isFinite(value) || value < 0)) {
    errors.push('PRICE_VALUES_MUST_BE_FINITE_AND_NON_NEGATIVE');
  }
  if (values.every((value) => Number.isFinite(value) && value >= 0)) {
    if (input.sourceMinPrice > input.sourceModalPrice) errors.push('MIN_EXCEEDS_MODAL');
    if (input.sourceModalPrice > input.sourceMaxPrice) errors.push('MODAL_EXCEEDS_MAX');
  }
  const sourceName = typeof input.sourceName === 'string' ? input.sourceName.trim() : '';
  if (!sourceName) errors.push('SOURCE_NAME_REQUIRED');
  if (input.observedAt != null && !observedAt) errors.push('INVALID_OBSERVED_AT');
  if (input.fetchedAt != null && !fetchedAt) errors.push('INVALID_FETCHED_AT');
  if (input.sourceType !== 'SIMULATED' && !observedAt) errors.push('OBSERVED_AT_REQUIRED');
  if (input.sourceType !== 'SIMULATED' && !fetchedAt) errors.push('FETCHED_AT_REQUIRED');
  if (observedAt && fetchedAt && observedAt.getTime() > fetchedAt.getTime()) {
    errors.push('OBSERVED_AT_AFTER_FETCHED_AT');
  }

  const validNumbers = values.every((value) => Number.isFinite(value) && value >= 0);
  const factor = MARKET_PRICE_UNITS.includes(unit) ? KG_PER_UNIT[unit] : null;
  const normalized = factor != null && validNumbers
    ? values.map((value) => Number((value / factor).toFixed(6)))
    : [null, null, null];

  let dataStatus: MarketPriceStatus;
  if (errors.length) dataStatus = 'INVALID';
  else if (input.sourceType === 'SIMULATED') dataStatus = 'SIMULATED';
  else {
    const now = (options.now ?? new Date()).getTime();
    const ageMs = now - (observedAt as Date).getTime();
    const expiresAfterMs = options.expiresAfterMs ?? 72 * 60 * 60 * 1000;
    const staleAfterMs = options.staleAfterMs ?? 24 * 60 * 60 * 1000;
    dataStatus = ageMs > expiresAfterMs ? 'EXPIRED' : ageMs > staleAfterMs ? 'STALE' : 'VALID';
  }

  return {
    sourceMinPrice: input.sourceMinPrice,
    sourceModalPrice: input.sourceModalPrice,
    sourceMaxPrice: input.sourceMaxPrice,
    sourcePriceUnit: input.sourcePriceUnit,
    minPriceINRPerKg: normalized[0],
    modalPriceINRPerKg: normalized[1],
    maxPriceINRPerKg: normalized[2],
    currency: 'INR',
    sourceType: input.sourceType,
    sourceName,
    sourceUrl: input.sourceUrl ?? null,
    sourceRecordId: input.sourceRecordId ?? null,
    observedAt,
    fetchedAt,
    dataStatus,
    validationErrors: errors,
  };
}

/** Only fresh, verified live observations may feed a live recommendation. */
export const isEligibleForLiveRecommendation = (price: NormalizedMarketPrice): boolean =>
  price.dataStatus === 'VALID' &&
  price.sourceType !== 'SIMULATED' &&
  price.minPriceINRPerKg != null &&
  price.modalPriceINRPerKg != null &&
  price.maxPriceINRPerKg != null;
