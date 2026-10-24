import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isEligibleForLiveRecommendation,
  normalizeMarketPrice,
} from '../packages/shared/src/market-prices';

const now = new Date('2026-10-24T12:00:00.000Z');
const liveObservation = {
  sourceMinPrice: 1000,
  sourceModalPrice: 1500,
  sourceMaxPrice: 2000,
  sourcePriceUnit: 'INR_PER_QUINTAL',
  sourceType: 'OFFICIAL' as const,
  sourceName: 'Test market source',
  observedAt: new Date('2026-10-24T10:00:00.000Z'),
  fetchedAt: new Date('2026-10-24T10:05:00.000Z'),
};

test('normalizes INR/quintal into INR/kg and retains raw values', () => {
  const result = normalizeMarketPrice(liveObservation, { now });
  assert.equal(result.dataStatus, 'VALID');
  assert.equal(result.minPriceINRPerKg, 10);
  assert.equal(result.modalPriceINRPerKg, 15);
  assert.equal(result.maxPriceINRPerKg, 20);
  assert.equal(result.sourceModalPrice, 1500);
  assert.equal(isEligibleForLiveRecommendation(result), true);
});

test('supports INR/kg and INR/tonne conversion', () => {
  const perKg = normalizeMarketPrice({ ...liveObservation, sourcePriceUnit: 'INR_PER_KG' }, { now });
  const perTonne = normalizeMarketPrice({
    ...liveObservation,
    sourcePriceUnit: 'INR_PER_TONNE',
  }, { now });
  assert.equal(perKg.modalPriceINRPerKg, 1500);
  assert.equal(perTonne.modalPriceINRPerKg, 1.5);
});

test('unknown units, invalid ranges and missing live timestamps are invalid', () => {
  const unknownUnit = normalizeMarketPrice({ ...liveObservation, sourcePriceUnit: 'BAG' }, { now });
  const invalidRange = normalizeMarketPrice({
    ...liveObservation,
    sourceMinPrice: 1600,
  }, { now });
  const noObservationTime = normalizeMarketPrice({
    ...liveObservation,
    observedAt: null,
  }, { now });
  assert.equal(unknownUnit.dataStatus, 'INVALID');
  assert.equal(unknownUnit.modalPriceINRPerKg, null);
  assert.ok(unknownUnit.validationErrors.includes('UNKNOWN_PRICE_UNIT'));
  assert.equal(invalidRange.dataStatus, 'INVALID');
  assert.ok(invalidRange.validationErrors.includes('MIN_EXCEEDS_MODAL'));
  assert.equal(noObservationTime.dataStatus, 'INVALID');
  assert.ok(noObservationTime.validationErrors.includes('OBSERVED_AT_REQUIRED'));
});

test('live price age is classified stale or expired; simulations stay simulated', () => {
  const stale = normalizeMarketPrice({
    ...liveObservation,
    observedAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
  }, { now });
  const expired = normalizeMarketPrice({
    ...liveObservation,
    observedAt: new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000),
  }, { now });
  const simulated = normalizeMarketPrice({
    ...liveObservation,
    sourceType: 'SIMULATED',
    observedAt: null,
    fetchedAt: null,
  }, { now });
  assert.equal(stale.dataStatus, 'STALE');
  assert.equal(expired.dataStatus, 'EXPIRED');
  assert.equal(simulated.dataStatus, 'SIMULATED');
  assert.equal(simulated.observedAt, null);
  assert.equal(isEligibleForLiveRecommendation(simulated), false);
});
