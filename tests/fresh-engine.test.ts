import assert from 'node:assert/strict';
import test from 'node:test';
import { estimateFreshness, getCropProfile } from '../apps/server/src/modules/freshness/profiles';
import { previewFreshMarketTransport } from '../apps/server/src/modules/fresh/preview';
import {
  rankFreshOptions,
  type FreshRankingCandidate,
} from '../apps/server/src/modules/fresh/ranking';

const now = new Date('2026-10-24T12:00:00.000Z');

test('route and transport preview composes read-only estimators without booking side effects', async () => {
  let routeReads = 0;
  let quoteReads = 0;
  const result = await previewFreshMarketTransport({
    farmerId: 'farmer-1', quantityKg: 100,
    pickup: { lat: 19, lng: 74 },
    earliestPickupAt: '2026-10-24T12:00:00.000Z',
    pickupBufferMinutes: 20, marketUnloadingBufferMinutes: 15,
    markets: [{ marketId: 'market-1', name: 'Market 1', location: { lat: 20, lng: 75 } }],
  }, {
    getDirections: async () => {
      routeReads += 1;
      return { distanceKm: 42, durationMinutes: 80, polyline: null, source: 'STRAIGHT_LINE_ESTIMATE' };
    },
    previewLoadQuote: async () => {
      quoteReads += 1;
      return { available: false, candidates: [], reason: 'NO_VEHICLE_AVAILABLE' };
    },
  });
  assert.equal(result.sideEffectFree, true);
  assert.equal(routeReads, 1);
  assert.equal(quoteReads, 1);
  assert.equal(result.options[0].route.endToEndDurationMinutes, 115);
  assert.equal(result.options[0].transport.available, false);
  assert.equal(result.options[0].route.estimateSource, 'STRAIGHT_LINE_ESTIMATE');
});

test('tomato profile aliases resolve to a versioned demo profile with no shelf window', () => {
  const profile = getCropProfile('Tomatoes');
  assert.equal(profile?.cropKey, 'tomato');
  assert.equal(profile?.profileVersion, 'tomato-profile-v1');
  assert.equal(profile?.estimatedLatestArrivalSupported, false);
  assert.equal(getCropProfile('potato'), null);
});

test('freshness risk requires inputs, labels assumptions and never invents a latest-arrival time', () => {
  const missing = estimateFreshness({
    cropKey: 'tomato', harvestedAt: '2026-10-24T08:00:00Z', now,
    ripenessStage: 'UNKNOWN', storageCondition: 'UNKNOWN',
    routeDurationMinutes: 90, handlingCondition: 'UNKNOWN',
  });
  assert.equal(missing.status, 'INSUFFICIENT_DATA');
  assert.equal(missing.score, null);
  assert.ok(missing.missingInputs.includes('ripenessStage'));

  const estimate = estimateFreshness({
    cropKey: 'tomato', harvestedAt: '2026-10-24T08:00:00Z', now,
    ripenessStage: 'TURNING', storageCondition: 'SHADE',
    routeDurationMinutes: 90, handlingCondition: 'GOOD',
  });
  assert.equal(estimate.status, 'ESTIMATED');
  assert.ok(estimate.score != null && estimate.score >= 0 && estimate.score <= 100);
  assert.equal(estimate.estimatedLatestArrivalAt, null);
  assert.equal(estimate.confidence, 'LOW');
  assert.ok(estimate.warnings.includes('SIMULATED_MODEL_ASSUMPTIONS'));
});

function candidate(overrides: Partial<FreshRankingCandidate> = {}): FreshRankingCandidate {
  return {
    marketId: 'market-a', marketName: 'Market A', cropAccepted: true,
    receivingHoursPass: true,
    route: { available: true, distanceKm: 10, durationMinutes: 60, source: 'GOOGLE' },
    transport: { available: true, farmerPayableINR: 300, vehicleId: 'vehicle-a' },
    price: {
      sourceType: 'OFFICIAL', status: 'VALID', minINRPerKg: 35,
      modalINRPerKg: 40, maxINRPerKg: 45,
    },
    quantityKg: 100, expectedSaleableKg: 100,
    knownOtherCostsINR: 100, unknownCostItems: [],
    arrivalAt: new Date(now.getTime() + 60 * 60 * 1000),
    ...overrides,
  };
}

test('ranking balances net proceeds and delivery time, while retaining separate winners', () => {
  const a = candidate();
  const b = candidate({
    marketId: 'market-b', marketName: 'Market B',
    route: { available: true, distanceKm: 60, durationMinutes: 180, source: 'GOOGLE' },
    transport: { available: true, farmerPayableINR: 900, vehicleId: 'vehicle-b' },
    price: { sourceType: 'CONFIRMED_BUYER', status: 'VALID', minINRPerKg: 55, modalINRPerKg: 60, maxINRPerKg: 65 },
    quantityKg: 100, expectedSaleableKg: 95,
    arrivalAt: new Date(now.getTime() + 3 * 60 * 60 * 1000),
  });
  const result = rankFreshOptions([a, b], {
    now, strictDeadline: true, desiredArrivalBy: new Date(now.getTime() + 4 * 60 * 60 * 1000),
  });
  assert.equal(result.recommendations.bestBalanced?.marketId, 'market-a');
  assert.equal(result.recommendations.highestNetProceeds?.marketId, 'market-b');
  assert.equal(result.recommendations.fastestFeasible?.marketId, 'market-a');
  assert.equal(result.recommendations.closestSuitable?.marketId, 'market-a');
  assert.ok(result.options.every((option) => option.fullyEligible));
});

test('strict deadline, stale prices and unknown costs prevent definitive ranking', () => {
  const late = candidate({
    marketId: 'late',
    arrivalAt: new Date(now.getTime() + 5 * 60 * 60 * 1000),
  });
  const stale = candidate({
    marketId: 'stale', price: { sourceType: 'OFFICIAL', status: 'STALE', minINRPerKg: 35, modalINRPerKg: 40, maxINRPerKg: 45 },
  });
  const unknownCosts = candidate({ marketId: 'unknown-costs', unknownCostItems: ['market handling fee'] });
  const result = rankFreshOptions([late, stale, unknownCosts], {
    now, strictDeadline: true, desiredArrivalBy: new Date(now.getTime() + 4 * 60 * 60 * 1000),
  });
  assert.equal(result.recommendations.bestBalanced, null);
  assert.equal(result.recommendations.highestNetProceeds, null);
  assert.equal(result.options[0].arrivalEligible, false);
  assert.ok(result.options[1].warnings.includes('PRICE_STALE'));
  assert.ok(result.options[2].warnings.includes('COSTS_INCOMPLETE'));
});

test('non-positive net return is disclosed and unknown saleable quantity is not assumed', () => {
  const loss = candidate({
    transport: { available: true, farmerPayableINR: 6000 },
  });
  const unknownYield = candidate({ marketId: 'yield-unknown', expectedSaleableKg: null });
  const result = rankFreshOptions([loss, unknownYield], { now });
  assert.ok(result.warnings.includes('NO_POSITIVE_RETURN_ESTIMATE'));
  assert.equal(result.options[1].financials, null);
  assert.ok(result.options[1].warnings.includes('SALEABLE_QUANTITY_UNSUPPORTED'));
});
