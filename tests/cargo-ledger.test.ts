import assert from 'node:assert/strict';
import test from 'node:test';
import { applyCargoQuantityEvent, cargoBalanceIsValid, cargoEventMatches, hasSameOptionApprovals, type CargoQuantityState } from '../apps/server/src/modules/cargo/ledger-math';

const received100: CargoQuantityState = {
  receivedKg: 100, soldKg: 0, rejectedKg: 0, returnedKg: 0, deliveredKg: 0,
  inTransitKg: 0, remainingAvailableKg: 100, documentedVarianceKg: 0,
};

test('partial sale keeps only the unsold quantity available for reroute', () => {
  const sold = applyCargoQuantityEvent(received100, 'SALE', 60);
  assert.ok(sold);
  assert.equal(sold.soldKg, 60);
  assert.equal(sold.remainingAvailableKg, 40);
  assert.equal(cargoBalanceIsValid(sold), true);
  assert.equal(applyCargoQuantityEvent(sold, 'REROUTE_DISPATCHED', 41), null);
});

test('reroute quantity moves to transit and returns to available only on receipt', () => {
  const sold = applyCargoQuantityEvent(received100, 'SALE', 60)!;
  const dispatched = applyCargoQuantityEvent(sold, 'REROUTE_DISPATCHED', 40)!;
  assert.equal(dispatched.remainingAvailableKg, 0);
  assert.equal(dispatched.inTransitKg, 40);
  assert.equal(applyCargoQuantityEvent(dispatched, 'FINAL_DELIVERY', 1), null);
  const received = applyCargoQuantityEvent(dispatched, 'REROUTE_RECEIVED', 40)!;
  assert.equal(received.remainingAvailableKg, 40);
  assert.equal(received.inTransitKg, 0);
  assert.equal(cargoBalanceIsValid(received), true);
});

test('documented variance is balanced and negative or excess dispositions are rejected', () => {
  assert.equal(applyCargoQuantityEvent(received100, 'VARIANCE', 10)?.remainingAvailableKg, 90);
  assert.equal(applyCargoQuantityEvent(received100, 'SALE', 0), null);
  assert.equal(applyCargoQuantityEvent(received100, 'SALE', 101), null);
  assert.equal(cargoBalanceIsValid({ ...received100, soldKg: 101 }), false);
});

test('reroute requires both parties to approve the exact same option version', () => {
  const plan = {
    version: 3, option: 'REROUTE_TO_MARKET',
    farmerApproval: { version: 3, option: 'REROUTE_TO_MARKET' },
    transporterApproval: { version: 3, option: 'REROUTE_TO_MARKET', accepted: true },
  };
  assert.equal(hasSameOptionApprovals(plan), true);
  assert.equal(hasSameOptionApprovals({ ...plan, transporterApproval: { ...plan.transporterApproval, accepted: false } }), false);
  assert.equal(hasSameOptionApprovals({ ...plan, transporterApproval: { ...plan.transporterApproval, version: 2 } }), false);
  assert.equal(hasSameOptionApprovals({ ...plan, farmerApproval: { ...plan.farmerApproval, option: 'SELL_HERE' } }), false);
});

test('idempotency accepts only an exact repeated event payload', () => {
  const first = { type: 'SALE', quantityKg: 60, decisionPlanVersion: 2, priceINRPerKg: 40 };
  assert.equal(cargoEventMatches(first, { ...first }), true);
  assert.equal(cargoEventMatches(first, { ...first, quantityKg: 61 }), false);
  assert.equal(cargoEventMatches(first, { ...first, decisionPlanVersion: 3 }), false);
  assert.equal(cargoEventMatches(first, { ...first, priceINRPerKg: 41 }), false);
});
