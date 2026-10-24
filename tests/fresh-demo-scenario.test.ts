import assert from 'node:assert/strict';
import test from 'node:test';
import { buildFreshDemoScenario, FRESH_DEMO_ID } from '../apps/server/src/modules/fresh/demo-scenario';
import { rankFreshOptions } from '../apps/server/src/modules/fresh/ranking';

test('local simulation has four distinct explained views and transparent calculations', () => {
  const result = buildFreshDemoScenario();
  assert.equal(result._id, FRESH_DEMO_ID);
  assert.deepEqual(Object.values(result.recommendations).map((item: any) => item.marketId), [
    'demo-balanced', 'demo-high', 'demo-fast', 'demo-near',
  ]);
  assert.deepEqual(result.options.map((option: any) => option.financials.netProceedsINR.expected), [1692, 4094, 2506, 3645]);
  assert.ok(result.options.every((option: any) => option.price.sourceType === 'SIMULATED' && option.route.estimateSource === 'SIMULATED'));
  assert.ok(result.options.every((option: any) => option.marketAcceptance === 'SIMULATED'));
  assert.ok(result.options.every((option: any) => option.fullyEligible === false && option.warnings.includes('NOT_BOOKABLE')));
  assert.ok(result.options.every((option: any) => option.explanation && option.simulation.provenance.includes('Synthetic')));
  assert.ok(result.options.every((option: any) => option.simulation.saleableAssumption.includes('not a measured') && option.simulation.costAssumption.includes('unknown')));
});

test('missing live candidates remain explicitly unavailable', () => {
  const result = rankFreshOptions([]);
  assert.equal(result.status, 'NO_FEASIBLE_MARKET');
  assert.equal(result.recommendations.bestBalanced, null);
  assert.equal(result.recommendations.highestNetProceeds, null);
  assert.equal(result.recommendations.fastestFeasible, null);
  assert.equal(result.recommendations.closestSuitable, null);
  assert.ok(result.warnings.includes('NO_FEASIBLE_MARKET'));
});
