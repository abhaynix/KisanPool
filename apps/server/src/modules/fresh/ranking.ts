import { money } from '../../lib/geo';
import { INDICATIVE_PRICE_WARNING, isRankablePriceSource } from './eligibility';
import type { FreshnessEstimate } from '../freshness/profiles';

export const RANKING_POLICY_VERSION = 'fresh-balanced-v1';

export interface FreshRankingCandidate {
  marketId: string;
  marketName: string;
  cropAccepted: boolean | 'UNKNOWN';
  receivingHoursPass: boolean | 'UNKNOWN';
  route: {
    available: boolean;
    distanceKm: number;
    durationMinutes: number;
    source: string;
    pickupBufferMinutes?: number;
    marketUnloadingBufferMinutes?: number;
  };
  transport: {
    available: boolean;
    farmerPayableINR: number | null;
    vehicleId?: string | null;
    quoteId?: string | null;
  };
  price: {
    observationId?: string | null;
    sourceType: string;
    status: string;
    minINRPerKg: number | null;
    modalINRPerKg: number | null;
    maxINRPerKg: number | null;
    observedAt?: string | Date | null;
  };
  quantityKg: number;
  /** Must come from an explicitly supported, reviewed crop scenario. */
  expectedSaleableKg: number | null;
  knownOtherCostsINR?: number;
  unknownCostItems?: string[];
  arrivalAt: string | Date;
  freshness?: FreshnessEstimate | null;
}

export interface FreshRankingPolicy {
  strictDeadline?: boolean;
  desiredArrivalBy?: string | Date | null;
  now?: Date;
  scoreNearTiePoints?: number;
}

export interface ScoredFreshOption extends FreshRankingCandidate {
  financials: null | {
    saleableKg: number;
    grossRevenueINR: { conservative: number; expected: number; upper: number };
    totalKnownCostsINR: number;
    netProceedsINR: { conservative: number; expected: number; upper: number };
    unknownCostItems: string[];
  };
  fullyEligible: boolean;
  transportFeasible: boolean;
  arrivalEligible: boolean;
  profitScore: number | null;
  timeScore: number | null;
  deliverySuitabilityScore: number | null;
  balancedScore: number | null;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  warnings: string[];
}

export interface FreshRankings {
  policyVersion: string;
  recommendations: {
    bestBalanced: ScoredFreshOption | null;
    highestNetProceeds: ScoredFreshOption | null;
    fastestFeasible: ScoredFreshOption | null;
    closestSuitable: ScoredFreshOption | null;
  };
  options: ScoredFreshOption[];
  warnings: string[];
  financialNearTie: boolean;
  scoreNearTie: boolean;
  status: 'READY' | 'NO_FEASIBLE_MARKET';
}

const roundScore = (value: number): number => Math.round(Math.max(0, Math.min(100, value)) * 100) / 100;
const asTime = (value: string | Date): number => new Date(value).getTime();
const endToEndMinutes = (option: FreshRankingCandidate): number =>
  option.route.durationMinutes +
  (option.route.pickupBufferMinutes ?? 0) +
  (option.route.marketUnloadingBufferMinutes ?? 0);
const isPriceEligible = (candidate: FreshRankingCandidate): boolean =>
  candidate.price.status === 'VALID' &&
  isRankablePriceSource(candidate.price.sourceType) &&
  candidate.price.modalINRPerKg != null &&
  candidate.price.minINRPerKg != null &&
  candidate.price.maxINRPerKg != null;

function calculateFinancials(candidate: FreshRankingCandidate): ScoredFreshOption['financials'] {
  const saleableKg = candidate.expectedSaleableKg;
  const { minINRPerKg, modalINRPerKg, maxINRPerKg } = candidate.price;
  if (
    saleableKg == null || saleableKg < 0 ||
    minINRPerKg == null || modalINRPerKg == null || maxINRPerKg == null ||
    candidate.transport.farmerPayableINR == null
  ) return null;

  const cost = money(candidate.transport.farmerPayableINR + (candidate.knownOtherCostsINR ?? 0));
  const conservative = money(saleableKg * minINRPerKg);
  const expected = money(saleableKg * modalINRPerKg);
  const upper = money(saleableKg * maxINRPerKg);
  return {
    saleableKg,
    grossRevenueINR: { conservative, expected, upper },
    totalKnownCostsINR: cost,
    netProceedsINR: {
      conservative: money(conservative - cost),
      expected: money(expected - cost),
      upper: money(upper - cost),
    },
    unknownCostItems: candidate.unknownCostItems ?? [],
  };
}

/** Deterministic ranking engine. Inputs are snapshots; this function has no I/O. */
export function rankFreshOptions(
  candidates: FreshRankingCandidate[],
  policy: FreshRankingPolicy = {},
): FreshRankings {
  const now = (policy.now ?? new Date()).getTime();
  const strict = policy.strictDeadline ?? Boolean(policy.desiredArrivalBy);
  const deadline = policy.desiredArrivalBy ? asTime(policy.desiredArrivalBy) : null;

  const options: ScoredFreshOption[] = candidates.map((candidate) => {
    const transportFeasible = candidate.transport.available &&
      candidate.transport.farmerPayableINR != null &&
      candidate.transport.farmerPayableINR >= 0;
    const arrivalTime = asTime(candidate.arrivalAt);
    const arrivalEligible = Number.isFinite(arrivalTime) &&
      (!strict || (deadline != null && deadline > now && arrivalTime <= deadline));
    const priceEligible = isPriceEligible(candidate);
    const noUnknownCosts = (candidate.unknownCostItems?.length ?? 0) === 0;
    const fullyEligible = candidate.cropAccepted === true &&
      candidate.receivingHoursPass === true &&
      candidate.route.available &&
      transportFeasible &&
      arrivalEligible &&
      priceEligible &&
      noUnknownCosts &&
      candidate.expectedSaleableKg != null;
    const warnings: string[] = [];
    if (candidate.cropAccepted === 'UNKNOWN') warnings.push('CROP_ACCEPTANCE_UNVERIFIED');
    if (candidate.receivingHoursPass === 'UNKNOWN') warnings.push('RECEIVING_HOURS_UNVERIFIED');
    if (candidate.route.source !== 'GOOGLE') warnings.push('ROUTE_IS_AN_ESTIMATE');
    if (!priceEligible) warnings.push(candidate.price.status === 'STALE' ? 'PRICE_STALE' : 'PRICE_NOT_ELIGIBLE');
    if (candidate.price.sourceType === 'OPERATOR_INDICATIVE') warnings.push(INDICATIVE_PRICE_WARNING);
    if (candidate.expectedSaleableKg == null) warnings.push('SALEABLE_QUANTITY_UNSUPPORTED');
    if (candidate.unknownCostItems?.length) warnings.push('COSTS_INCOMPLETE');
    if (!transportFeasible) warnings.push('NO_FEASIBLE_TRANSPORT_QUOTE');
    if (!arrivalEligible) warnings.push('DELIVERY_DEADLINE_MISSED');

    const financials = calculateFinancials(candidate);
    const freshnessRisk = candidate.freshness?.status === 'ESTIMATED'
      ? candidate.freshness.score
      : null;
    return {
      ...candidate,
      financials,
      fullyEligible,
      transportFeasible,
      arrivalEligible,
      profitScore: null,
      timeScore: null,
      deliverySuitabilityScore: null,
      balancedScore: null,
      confidence: candidate.route.source === 'GOOGLE' && priceEligible && noUnknownCosts &&
          candidate.freshness?.sourceLabel !== 'SIMULATED_MODEL_ASSUMPTIONS'
        ? candidate.price.sourceType === 'CONFIRMED_BUYER' && freshnessRisk != null ? 'HIGH' : 'MEDIUM'
        : 'LOW',
      warnings,
    };
  });

  const balancedCandidates = options.filter((option) => option.fullyEligible && option.financials);
  const maxPositiveNet = Math.max(0, ...balancedCandidates.map((option) => option.financials!.netProceedsINR.expected));
  const allFreshnessComparable = balancedCandidates.length > 0 && balancedCandidates.every((option) =>
    option.freshness?.status === 'ESTIMATED' && option.freshness.score != null &&
    option.freshness.modelVersion != null && option.freshness.profileVersion != null,
  ) && new Set(balancedCandidates.map((option) =>
    `${option.freshness!.profileVersion}:${option.freshness!.modelVersion}`,
  )).size === 1;
  const flexibleOptions = options.filter((option) =>
    option.transportFeasible && option.route.available &&
    option.cropAccepted === true && option.receivingHoursPass === true && option.arrivalEligible,
  );
  const minDuration = Math.min(...flexibleOptions.map(endToEndMinutes));
  const availableHours = deadline == null ? null : (deadline - now) / 3_600_000;

  for (const option of options) {
    if (!option.fullyEligible || !option.financials) continue;
    option.profitScore = maxPositiveNet > 0
      ? roundScore(100 * Math.max(0, option.financials.netProceedsINR.expected) / maxPositiveNet)
      : 0;
    const durationMinutes = endToEndMinutes(option);
    const durationHours = durationMinutes / 60;
    option.timeScore = strict
      ? availableHours != null && availableHours > 0
        ? roundScore(100 * (1 - durationHours / availableHours))
        : 0
      : durationHours <= 0 || minDuration <= 0
        ? 100
        : roundScore(100 * (minDuration / durationMinutes));
    option.deliverySuitabilityScore = allFreshnessComparable
      ? roundScore(0.7 * option.timeScore + 0.3 * (100 - option.freshness!.score!))
      : option.timeScore;
    option.balancedScore = roundScore(0.5 * option.profitScore + 0.5 * option.deliverySuitabilityScore);
    if (!allFreshnessComparable) option.warnings.push('FRESHNESS_RISK_NOT_COMPARABLE');
  }

  const highestNetCandidates = options.filter((option) =>
    option.financials && option.transportFeasible && option.arrivalEligible &&
    option.cropAccepted === true && option.receivingHoursPass === true && isPriceEligible(option) &&
    (option.unknownCostItems?.length ?? 0) === 0,
  );
  const feasibleOptions = options.filter((option) =>
    option.transportFeasible && option.arrivalEligible && option.cropAccepted === true &&
    option.receivingHoursPass === true && option.route.available,
  );
  const bestBalanced = [...balancedCandidates].sort((a, b) =>
    (b.balancedScore ?? -1) - (a.balancedScore ?? -1) ||
    (b.financials?.netProceedsINR.expected ?? -Infinity) - (a.financials?.netProceedsINR.expected ?? -Infinity),
  )[0] ?? null;
  const highestNetProceeds = [...highestNetCandidates].sort((a, b) =>
    (b.financials?.netProceedsINR.expected ?? -Infinity) - (a.financials?.netProceedsINR.expected ?? -Infinity),
  )[0] ?? null;
  const fastestFeasible = [...feasibleOptions].sort((a, b) =>
    endToEndMinutes(a) - endToEndMinutes(b),
  )[0] ?? null;
  const closestSuitable = [...feasibleOptions].sort((a, b) =>
    a.route.distanceKm - b.route.distanceKm,
  )[0] ?? null;

  const warnings: string[] = [];
  if (!feasibleOptions.length) warnings.push('NO_FEASIBLE_MARKET');
  if (balancedCandidates.length && maxPositiveNet <= 0) warnings.push('NO_POSITIVE_RETURN_ESTIMATE');
  if (!allFreshnessComparable && balancedCandidates.length) warnings.push('FRESHNESS_RISK_NOT_COMPARABLE');
  if (bestBalanced && bestBalanced.confidence === 'LOW') warnings.push('RECOMMENDATION_UNCERTAIN');
  if (options.some((option) => option.warnings.includes('PRICE_STALE'))) warnings.push('STALE_PRICE_DATA');
  if (options.some((option) => option.warnings.includes('COSTS_INCOMPLETE'))) warnings.push('COSTS_INCOMPLETE');
  if (options.some((option) => option.warnings.includes('PRICE_NOT_ELIGIBLE'))) {
    warnings.push('PRICE_DATA_NOT_ELIGIBLE');
  }

  const financialTopTwo = [...highestNetCandidates].sort((a, b) =>
    (b.financials?.netProceedsINR.expected ?? -Infinity) - (a.financials?.netProceedsINR.expected ?? -Infinity),
  ).slice(0, 2);
  const bestNet = financialTopTwo[0]?.financials?.netProceedsINR.expected;
  const secondNet = financialTopTwo[1]?.financials?.netProceedsINR.expected;
  const financialNearTie = bestNet != null && secondNet != null &&
    bestNet - secondNet <= Math.max(100, Math.abs(bestNet) * 0.03);
  const scoreNearTie = bestBalanced != null && balancedCandidates.some((option) =>
    option !== bestBalanced && Math.abs((option.balancedScore ?? 0) - (bestBalanced.balancedScore ?? 0)) <=
      (policy.scoreNearTiePoints ?? 3),
  );
  if (financialNearTie) warnings.push('NET_PROCEEDS_NEAR_TIE');
  if (scoreNearTie) warnings.push('BALANCED_SCORE_NEAR_TIE');

  return {
    policyVersion: RANKING_POLICY_VERSION,
    recommendations: { bestBalanced, highestNetProceeds, fastestFeasible, closestSuitable },
    options,
    warnings: [...new Set(warnings)],
    financialNearTie,
    scoreNearTie,
    status: feasibleOptions.length ? 'READY' : 'NO_FEASIBLE_MARKET',
  };
}
