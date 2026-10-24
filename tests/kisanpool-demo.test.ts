import assert from 'node:assert/strict';
import test from 'node:test';
import { rankFreshOptions, type FreshRankingCandidate } from '../apps/server/src/modules/fresh/ranking';
import { applyCargoQuantityEvent, type CargoQuantityState } from '../apps/server/src/modules/cargo/ledger-math';

const runAt = new Date('2026-10-24T12:00:00.000Z');

function demoCandidate(overrides: Partial<FreshRankingCandidate>): FreshRankingCandidate {
  return {
    marketId: 'simulated-near', marketName: 'SIMULATED Market A', cropAccepted: true,
    receivingHoursPass: true,
    route: { available: true, distanceKm: 12, durationMinutes: 60, source: 'GOOGLE' },
    transport: { available: true, farmerPayableINR: 300, vehicleId: 'simulated-vehicle-a' },
    price: { sourceType: 'OFFICIAL', status: 'VALID', minINRPerKg: 35, modalINRPerKg: 40, maxINRPerKg: 45 },
    quantityKg: 100, expectedSaleableKg: 100, knownOtherCostsINR: 100, unknownCostItems: [],
    arrivalAt: new Date(runAt.getTime() + 60 * 60_000), ...overrides,
  };
}

test('simulated final demo compares balanced recommendation against price-only and nearest baselines', () => {
  // Every value in this fixture is synthetic and is not a market quote or savings claim.
  const nearer = demoCandidate({});
  const higherPriceFarther = demoCandidate({
    marketId: 'simulated-far', marketName: 'SIMULATED Market B',
    route: { available: true, distanceKm: 60, durationMinutes: 180, source: 'GOOGLE' },
    transport: { available: true, farmerPayableINR: 900, vehicleId: 'simulated-vehicle-b' },
    price: { sourceType: 'CONFIRMED_BUYER', status: 'VALID', minINRPerKg: 55, modalINRPerKg: 60, maxINRPerKg: 65 },
    expectedSaleableKg: 95, arrivalAt: new Date(runAt.getTime() + 3 * 60 * 60_000),
  });
  const ranked = rankFreshOptions([nearer, higherPriceFarther], { now: runAt, desiredArrivalBy: new Date(runAt.getTime() + 4 * 60 * 60_000) });
  assert.equal(ranked.recommendations.bestBalanced?.marketId, 'simulated-near');
  assert.equal(ranked.recommendations.highestNetProceeds?.marketId, 'simulated-far');
  assert.equal(ranked.recommendations.fastestFeasible?.marketId, 'simulated-near');
  assert.equal(ranked.recommendations.closestSuitable?.marketId, 'simulated-near');
  assert.equal(ranked.recommendations.bestBalanced?.balancedScore, (ranked.recommendations.bestBalanced!.profitScore! + ranked.recommendations.bestBalanced!.deliverySuitabilityScore!) / 2);
});

test('simulated recovery and partial sale keep trip quantity and payment ledger scope explicit', () => {
  const initial: CargoQuantityState = { receivedKg: 100, soldKg: 0, rejectedKg: 0, returnedKg: 0, deliveredKg: 0, inTransitKg: 0, remainingAvailableKg: 100, documentedVarianceKg: 0 };
  const sold = applyCargoQuantityEvent(initial, 'SALE', 60)!;
  const sentToReplacementLeg = applyCargoQuantityEvent(sold, 'REROUTE_DISPATCHED', 40)!;
  assert.equal(sentToReplacementLeg.soldKg, 60);
  assert.equal(sentToReplacementLeg.inTransitKg, 40);
  assert.equal(sentToReplacementLeg.remainingAvailableKg, 0);
  // The ordinary KisanPool payment flow remains the source of financial settlement;
  // this cargo-level simulation does not create or mutate a Payment record.
});
