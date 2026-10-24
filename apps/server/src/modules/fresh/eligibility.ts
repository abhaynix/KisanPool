/**
 * Pure Fresh eligibility helpers. No I/O and no Mongoose imports, so every rule
 * here is unit-testable offline and the service and tests share one definition.
 */

/** Sources that may feed definitive ranking. SIMULATED never does; OPERATOR_INDICATIVE is labelled. */
export const RANKABLE_PRICE_SOURCES = ['OFFICIAL', 'CONFIRMED_BUYER', 'OPERATOR_INDICATIVE'] as const;

export function isRankablePriceSource(sourceType: string): boolean {
  return (RANKABLE_PRICE_SOURCES as readonly string[]).includes(sourceType);
}

export const INDICATIVE_PRICE_WARNING = 'INDICATIVE_PRICE_NOT_BUYER_GUARANTEE';
export const SALEABLE_BASELINE_WARNING = 'SALEABLE_QUANTITY_ASSUMES_NO_MODELLED_LOSS';
export const COST_UNVERIFIED_ITEM = 'Market commission and handling costs are not verified by operations.';

const IST_OFFSET_MS = 330 * 60_000;

/**
 * Receiving-hours check at the arrival time, in IST. Returns UNKNOWN unless
 * operations verified an explicit IST window, so a missing window never passes.
 */
export function receivingHoursPassForArrival(
  acceptance: {
    receivingHoursVerified: boolean;
    receivingOpenHourIST?: number | null;
    receivingCloseHourIST?: number | null;
  },
  arrivalAt: Date | string | null | undefined,
): boolean | 'UNKNOWN' {
  const { receivingOpenHourIST: open, receivingCloseHourIST: close } = acceptance;
  if (!acceptance.receivingHoursVerified || open == null || close == null || arrivalAt == null) return 'UNKNOWN';
  const arrival = new Date(arrivalAt).getTime();
  if (!Number.isFinite(arrival)) return 'UNKNOWN';
  const ist = new Date(arrival + IST_OFFSET_MS);
  const hour = ist.getUTCHours() + ist.getUTCMinutes() / 60;
  return hour >= open && hour < close;
}

/**
 * Financial comparison baseline: the whole batch is treated as saleable, with no
 * modelled loss. The spec forbids inventing a loss rate, so this is always labelled.
 */
export function baselineSaleableKg(quantityKg: number): number {
  return quantityKg;
}

export interface MarketCostConfig {
  commissionPct?: number | null;
  handlingINRPerKg?: number | null;
  costsVerified?: boolean;
}

/**
 * Converts operator-verified market costs into a flat amount for the ranking.
 * Unverified or incomplete costs are reported as unknown, which blocks definitive ranking.
 */
export function marketCostTerms(
  costs: MarketCostConfig | null | undefined,
  input: { expectedGrossINR: number; saleableKg: number },
): { knownOtherCostsINR: number; unknownCostItems: string[] } {
  if (!costs || !costs.costsVerified || costs.commissionPct == null || costs.handlingINRPerKg == null) {
    return { knownOtherCostsINR: 0, unknownCostItems: [COST_UNVERIFIED_ITEM] };
  }
  const commission = (input.expectedGrossINR * costs.commissionPct) / 100;
  const handling = input.saleableKg * costs.handlingINRPerKg;
  return { knownOtherCostsINR: Math.round((commission + handling) * 100) / 100, unknownCostItems: [] };
}
