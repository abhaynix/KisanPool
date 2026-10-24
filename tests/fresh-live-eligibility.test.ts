import assert from 'node:assert/strict';
import test from 'node:test';
import {
  baselineSaleableKg,
  INDICATIVE_PRICE_WARNING,
  isRankablePriceSource,
  marketCostTerms,
  receivingHoursPassForArrival,
  SALEABLE_BASELINE_WARNING,
} from '../apps/server/src/modules/fresh/eligibility';
import { rankFreshOptions, type FreshRankingCandidate } from '../apps/server/src/modules/fresh/ranking';

const now = new Date('2026-10-25T04:00:00.000Z'); // 09:30 IST

test('receiving hours are checked in IST at the arrival time and never assumed', () => {
  const verified = { receivingHoursVerified: true, receivingOpenHourIST: 6, receivingCloseHourIST: 14 };
  assert.equal(receivingHoursPassForArrival(verified, '2026-10-25T06:30:00.000Z'), true); // 12:00 IST
  assert.equal(receivingHoursPassForArrival(verified, '2026-10-25T09:00:00.000Z'), false); // 14:30 IST
  assert.equal(receivingHoursPassForArrival(verified, '2026-10-25T08:30:00.000Z'), false); // 14:00 IST: close hour is exclusive
  assert.equal(receivingHoursPassForArrival({ ...verified, receivingHoursVerified: false }, '2026-10-25T06:30:00.000Z'), 'UNKNOWN');
  assert.equal(receivingHoursPassForArrival({ receivingHoursVerified: true }, '2026-10-25T06:30:00.000Z'), 'UNKNOWN');
  assert.equal(receivingHoursPassForArrival(verified, null), 'UNKNOWN');
});

test('only operator-verified costs produce a known cost amount; unverified costs stay unknown', () => {
  const unverified = marketCostTerms({ commissionPct: 6, handlingINRPerKg: 1.5, costsVerified: false }, { expectedGrossINR: 1000, saleableKg: 100 });
  assert.equal(unverified.unknownCostItems.length, 1);
  const verified = marketCostTerms({ commissionPct: 6, handlingINRPerKg: 1.5, costsVerified: true }, { expectedGrossINR: 1000, saleableKg: 100 });
  assert.deepEqual(verified.unknownCostItems, []);
  assert.equal(verified.knownOtherCostsINR, 210); // 6% of 1000 + 1.5 per kg for 100 kg
  assert.equal(marketCostTerms(null, { expectedGrossINR: 1000, saleableKg: 100 }).unknownCostItems.length, 1);
});

test('operator-indicative prices are rankable; simulated and missing sources are not', () => {
  assert.equal(isRankablePriceSource('OPERATOR_INDICATIVE'), true);
  assert.equal(isRankablePriceSource('OFFICIAL'), true);
  assert.equal(isRankablePriceSource('CONFIRMED_BUYER'), true);
  assert.equal(isRankablePriceSource('SIMULATED'), false);
  assert.equal(isRankablePriceSource('NONE'), false);
});

test('saleable quantity baseline keeps the whole batch with no invented loss', () => {
  assert.equal(baselineSaleableKg(500), 500);
  assert.equal(SALEABLE_BASELINE_WARNING.includes('NO_MODELLED_LOSS'), true);
});

/** Mirrors the candidate the service builds from verified evidence, without the database. */
function verifiedCandidate(overrides: Partial<FreshRankingCandidate> & { id: string; farmerPayableINR: number; distanceKm: number; minutes: number; modal: number; hoursVerified?: boolean; costsVerified?: boolean }): FreshRankingCandidate {
  const saleableKg = baselineSaleableKg(500);
  const arrivalAt = new Date(now.getTime() + overrides.minutes * 60_000);
  const hours = receivingHoursPassForArrival(
    { receivingHoursVerified: overrides.hoursVerified ?? true, receivingOpenHourIST: 0, receivingCloseHourIST: 24 },
    arrivalAt,
  );
  const costs = marketCostTerms(
    { commissionPct: 6, handlingINRPerKg: 1, costsVerified: overrides.costsVerified ?? true },
    { expectedGrossINR: overrides.modal * saleableKg, saleableKg },
  );
  return {
    marketId: overrides.id, marketName: overrides.id, cropAccepted: true,
    receivingHoursPass: hours,
    route: { available: true, distanceKm: overrides.distanceKm, durationMinutes: overrides.minutes, source: 'GOOGLE' },
    transport: { available: true, farmerPayableINR: overrides.farmerPayableINR, vehicleId: `${overrides.id}-vehicle` },
    price: { sourceType: 'OPERATOR_INDICATIVE', status: 'VALID', minINRPerKg: overrides.modal - 2, modalINRPerKg: overrides.modal, maxINRPerKg: overrides.modal + 2 },
    quantityKg: 500, expectedSaleableKg: saleableKg,
    knownOtherCostsINR: costs.knownOtherCostsINR, unknownCostItems: costs.unknownCostItems,
    arrivalAt,
  };
}

test('verified evidence makes markets bookable and produces the four recommendation views', () => {
  const result = rankFreshOptions([
    verifiedCandidate({ id: 'pune-market-yard', farmerPayableINR: 300, distanceKm: 20, minutes: 60, modal: 22 }),
    verifiedCandidate({ id: 'vashi-apmc', farmerPayableINR: 900, distanceKm: 130, minutes: 200, modal: 30 }),
  ], { now });
  assert.equal(result.status, 'READY');
  assert.ok(result.options.every((option) => option.fullyEligible));
  assert.ok(result.recommendations.bestBalanced);
  assert.ok(result.recommendations.highestNetProceeds);
  assert.ok(result.recommendations.fastestFeasible);
  assert.equal(result.recommendations.closestSuitable?.marketId, 'pune-market-yard');
  assert.ok(result.options[0].warnings.includes(INDICATIVE_PRICE_WARNING));
});

test('missing receiving-hours or unverified costs keep a market out of definitive ranking', () => {
  const noHours = rankFreshOptions([verifiedCandidate({ id: 'no-hours', farmerPayableINR: 300, distanceKm: 20, minutes: 60, modal: 22, hoursVerified: false })], { now });
  assert.equal(noHours.status, 'NO_FEASIBLE_MARKET');
  assert.equal(noHours.options[0].fullyEligible, false);

  const noCosts = rankFreshOptions([verifiedCandidate({ id: 'no-costs', farmerPayableINR: 300, distanceKm: 20, minutes: 60, modal: 22, costsVerified: false })], { now });
  assert.equal(noCosts.recommendations.bestBalanced, null);
  assert.ok(noCosts.options[0].warnings.includes('COSTS_INCOMPLETE'));
});
