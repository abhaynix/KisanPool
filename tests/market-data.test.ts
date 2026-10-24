import assert from 'node:assert/strict';
import test from 'node:test';
import { Market, MarketAcceptanceObservation, MarketPriceObservation } from '../apps/server/src/models';
import { marketPriceView } from '../apps/server/src/modules/fresh/market-data';

test('market reference resolves to a registered canonical market model', () => {
  assert.ok(Market);
  assert.ok(MarketAcceptanceObservation);
  assert.equal(MarketPriceObservation.schema.path('marketId')?.options.ref, 'Market');
  assert.equal(Market.modelName, 'Market');
});

test('persisted price view preserves provenance and recalculates age and units at read time', () => {
  const observation = {
    sourceMinPrice: 1000, sourceModalPrice: 1500, sourceMaxPrice: 2000,
    sourcePriceUnit: 'INR_PER_QUINTAL', sourceType: 'OFFICIAL', sourceName: 'AGMARKNET import',
    sourceUrl: 'https://data.gov.in/catalog/current-daily-price-various-commodities-various-markets-mandi',
    observedAt: new Date('2026-10-25T08:00:00Z'), fetchedAt: new Date('2026-10-25T08:05:00Z'),
  };
  const fresh = marketPriceView(observation, new Date('2026-10-25T09:00:00Z'));
  assert.equal(fresh.modalPriceINRPerKg, 15);
  assert.equal(fresh.sourceName, 'AGMARKNET import');
  assert.equal(fresh.dataStatus, 'VALID');
  assert.equal(fresh.eligibleForLiveRecommendation, true);
  const stale = marketPriceView(observation, new Date('2026-10-27T10:00:00Z'));
  assert.equal(stale.dataStatus, 'STALE');
  assert.equal(stale.eligibleForLiveRecommendation, false);
  const absent = marketPriceView({ ...observation, sourceType: 'SIMULATED' }, new Date('2026-10-25T09:00:00Z'));
  assert.equal(absent.dataStatus, 'SIMULATED');
  assert.equal(absent.eligibleForLiveRecommendation, false);
});
