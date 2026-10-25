/**
 * Crop configuration constants and loss formulas for KisanPool Fresh.
 *
 * NOTE: Loss rates below are demo assumptions for prototype estimation
 * and do not represent laboratory-verified post-harvest shelf life guarantees.
 */

export const CROPS = ['tomato', 'onion', 'grapes'] as const;
export type CropType = (typeof CROPS)[number];

export const CROP_CONDITIONS = ['Green', 'Turning', 'Ripe', 'Fully ripe', 'Unknown'] as const;
export type CropCondition = (typeof CROP_CONDITIONS)[number];

/**
 * Base transit loss (%) by harvest ripeness/condition.
 * Demo assumption: Green produce has lowest initial loss (2%),
 * while Fully Ripe produce begins with 12% baseline handling loss.
 */
export const BASE_LOSS_BY_CONDITION: Record<CropCondition, number> = {
  Green: 2,
  Turning: 4,
  Ripe: 7,
  'Fully ripe': 12,
  Unknown: 6,
};

/**
 * Hourly transit degradation rate (% loss per hour of transit/waiting).
 * Demo assumptions:
 * - tomato: 0.25% per hour (moderately perishable)
 * - onion: 0.05% per hour (durable storage bulb)
 * - grapes: 0.30% per hour (highly perishable soft berry)
 */
export const PER_HOUR_LOSS_BY_CROP: Record<CropType, number> = {
  tomato: 0.25,
  onion: 0.05,
  grapes: 0.30,
};

export const WEIGHT_UNITS = ['kg', 'quintal', 'tonne'] as const;
export type WeightUnit = (typeof WEIGHT_UNITS)[number];

/**
 * Convert quantity in any supported unit to kilograms (kg).
 */
export function convertQuantityToKg(quantity: number, unit: string = 'kg'): number {
  const normUnit = unit.trim().toLowerCase();
  switch (normUnit) {
    case 'quintal':
      return quantity * 100;
    case 'tonne':
      return quantity * 1000;
    case 'kg':
    default:
      return quantity;
  }
}

/**
 * Convert price in any supported unit to price in ₹/kg.
 */
export function convertPriceToPerKg(price: number, unit: string = 'kg'): number {
  const normUnit = unit.trim().toLowerCase();
  switch (normUnit) {
    case 'quintal':
      return price / 100;
    case 'tonne':
      return price / 1000;
    case 'kg':
    default:
      return price;
  }
}

/**
 * Normalize condition string to valid CropCondition key.
 */
export function normalizeCondition(condition?: string): CropCondition {
  if (!condition) return 'Unknown';
  const c = condition.trim().toLowerCase();
  if (c === 'green') return 'Green';
  if (c === 'turning') return 'Turning';
  if (c === 'ripe') return 'Ripe';
  if (c === 'fully ripe' || c === 'fully_ripe' || c === 'fullyripe') return 'Fully ripe';
  return 'Unknown';
}

/**
 * Calculate expected transit loss percentage clamped to [0, 40]%.
 * lossPct = clamp(baseLoss[condition] + perHourLoss[crop]*hours, 0, 40)
 */
export function calculateLossPct(
  condition: CropCondition | string,
  crop: CropType | string,
  hours: number,
): number {
  const normCond = normalizeCondition(condition);
  const normCrop = (crop.trim().toLowerCase() as CropType);
  const base = BASE_LOSS_BY_CONDITION[normCond] ?? BASE_LOSS_BY_CONDITION.Unknown;
  const perHour = PER_HOUR_LOSS_BY_CROP[normCrop] ?? 0.20;
  const safeHours = Math.max(0, hours);
  const rawLoss = base + perHour * safeHours;
  return Math.min(40, Math.max(0, Math.round(rawLoss * 10) / 10));
}

/**
 * Calculate saleable kg from total kg and loss percentage.
 */
export function calculateSaleableKg(quantityKg: number, lossPct: number): number {
  const saleable = quantityKg * (1 - lossPct / 100);
  return Math.max(0, Math.round(saleable * 10) / 10);
}

/**
 * Calculate net proceeds in Rupees:
 * net = saleableKg * pricePerKg - transportCost - commission - handlingCost
 */
export function calculateNetProceeds(input: {
  saleableKg: number;
  pricePerKg: number;
  transportCostINR: number;
  commissionPct: number;
  handlingINRPerKg: number;
}): {
  grossINR: number;
  commissionINR: number;
  handlingINR: number;
  transportINR: number;
  netINR: number;
} {
  const gross = Math.round(input.saleableKg * input.pricePerKg * 100) / 100;
  const commission = Math.round((gross * (input.commissionPct / 100)) * 100) / 100;
  const handling = Math.round((input.handlingINRPerKg * input.saleableKg) * 100) / 100;
  const transport = Math.round(input.transportCostINR * 100) / 100;
  const net = Math.round((gross - transport - commission - handling) * 100) / 100;
  return {
    grossINR: gross,
    commissionINR: commission,
    handlingINR: handling,
    transportINR: transport,
    netINR: net,
  };
}
