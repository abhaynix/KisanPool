import assert from 'node:assert/strict';
import test from 'node:test';
import { applyCargoQuantityEvent, type CargoQuantityState } from '../apps/server/src/modules/cargo/ledger-math';

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
