import { rankFreshOptions, type FreshRankingCandidate } from './ranking';

export const FRESH_DEMO_ID = 'local-synthetic-fresh-v1';

const now = new Date('2026-01-15T06:00:00.000Z');
const destination = { lat: 18.52, lng: 73.85 };

const scenario: Array<FreshRankingCandidate & {
  marketLocation: { lat: number; lng: number };
  receivingHours: string;
  priceUnit: 'INR_PER_KG';
  provenance: string;
}> = [
  {
    marketId: 'demo-near', marketName: 'Demo Market A · closest', marketLocation: { lat: 18.58, lng: 73.88 },
    cropAccepted: true, receivingHoursPass: true,
    route: { available: true, distanceKm: 9, durationMinutes: 95, source: 'SIMULATED', pickupBufferMinutes: 20, marketUnloadingBufferMinutes: 15 },
    transport: { available: true, farmerPayableINR: 240, vehicleId: 'SIMULATED-VEHICLE-A' },
    price: { sourceType: 'OFFICIAL', status: 'VALID', minINRPerKg: 20, modalINRPerKg: 22, maxINRPerKg: 24 },
    quantityKg: 100, expectedSaleableKg: 96, knownOtherCostsINR: 180,
    unknownCostItems: ['Actual market commission is not supplied by this simulation.'],
    arrivalAt: new Date(now.getTime() + 130 * 60_000), receivingHours: '06:00–12:00 (simulated)', priceUnit: 'INR_PER_KG', provenance: 'Synthetic scenario fixture; not a quote',
  },
  {
    marketId: 'demo-high', marketName: 'Demo Market B · highest price', marketLocation: { lat: 19.2, lng: 74.1 },
    cropAccepted: true, receivingHoursPass: true,
    route: { available: true, distanceKm: 88, durationMinutes: 260, source: 'SIMULATED', pickupBufferMinutes: 20, marketUnloadingBufferMinutes: 25 },
    transport: { available: true, farmerPayableINR: 950, vehicleId: 'SIMULATED-VEHICLE-B' },
    price: { sourceType: 'OFFICIAL', status: 'VALID', minINRPerKg: 52, modalINRPerKg: 56, maxINRPerKg: 60 },
    quantityKg: 100, expectedSaleableKg: 94, knownOtherCostsINR: 220, unknownCostItems: [],
    arrivalAt: new Date(now.getTime() + 305 * 60_000), receivingHours: '06:00–16:00 (simulated)', priceUnit: 'INR_PER_KG', provenance: 'Synthetic scenario fixture; not a quote',
  },
  {
    marketId: 'demo-fast', marketName: 'Demo Market C · fastest', marketLocation: { lat: 18.7, lng: 74.0 },
    cropAccepted: true, receivingHoursPass: true,
    route: { available: true, distanceKm: 31, durationMinutes: 42, source: 'SIMULATED', pickupBufferMinutes: 10, marketUnloadingBufferMinutes: 12 },
    transport: { available: true, farmerPayableINR: 470, vehicleId: 'SIMULATED-VEHICLE-C' },
    price: { sourceType: 'OFFICIAL', status: 'VALID', minINRPerKg: 30, modalINRPerKg: 32, maxINRPerKg: 34 },
    quantityKg: 100, expectedSaleableKg: 98, knownOtherCostsINR: 160,
    unknownCostItems: ['Actual grading and commission are not supplied by this simulation.'],
    arrivalAt: new Date(now.getTime() + 64 * 60_000), receivingHours: '05:00–10:00 (simulated)', priceUnit: 'INR_PER_KG', provenance: 'Synthetic scenario fixture; not a quote',
  },
  {
    marketId: 'demo-balanced', marketName: 'Demo Market D · balanced', marketLocation: { lat: 18.88, lng: 74.12 },
    cropAccepted: true, receivingHoursPass: true,
    route: { available: true, distanceKm: 44, durationMinutes: 100, source: 'SIMULATED', pickupBufferMinutes: 15, marketUnloadingBufferMinutes: 20 },
    transport: { available: true, farmerPayableINR: 520, vehicleId: 'SIMULATED-VEHICLE-D' },
    price: { sourceType: 'OFFICIAL', status: 'VALID', minINRPerKg: 42, modalINRPerKg: 45, maxINRPerKg: 48 },
    quantityKg: 100, expectedSaleableKg: 97, knownOtherCostsINR: 200, unknownCostItems: [],
    arrivalAt: new Date(now.getTime() + 135 * 60_000), receivingHours: '06:00–14:00 (simulated)', priceUnit: 'INR_PER_KG', provenance: 'Synthetic scenario fixture; not a quote',
  },
];

/** Read-only illustrative scenario. Shadow ranking is discarded for eligibility and never reaches live selection. */
export function buildFreshDemoScenario() {
  const generatedAt = new Date();
  const deadline = new Date(generatedAt.getTime() + 8 * 60 * 60_000);
  const candidates = scenario.map((item) => ({
    ...item,
    arrivalAt: new Date(generatedAt.getTime() + (item.route.durationMinutes + (item.route.pickupBufferMinutes ?? 0) + (item.route.marketUnloadingBufferMinutes ?? 0)) * 60_000),
  }));
  const ranked = rankFreshOptions(candidates, { now: generatedAt, desiredArrivalBy: deadline });
  const present = (candidate: (typeof ranked.options)[number] | null) => candidate ? {
    ...candidate,
    fullyEligible: false,
    price: { ...candidate.price, sourceType: 'SIMULATED', status: 'SIMULATED' },
    warnings: [...candidate.warnings, 'SIMULATION_ONLY', 'NOT_BOOKABLE'],
    explanation: candidate.marketId === 'demo-high' ? 'Highest expected net proceeds in this synthetic scenario.'
      : candidate.marketId === 'demo-fast' ? 'Shortest simulated end-to-end delivery time.'
        : candidate.marketId === 'demo-near' ? 'Shortest simulated route distance.'
          : 'Best equal-weight profit and delivery-suitability score in this scenario.',
  } : null;
  const options = ranked.options.map(present);
  const byId = new Map(options.map((option) => [option!.marketId, option]));
  const recommendations = Object.fromEntries(Object.entries(ranked.recommendations)
    .map(([key, value]) => [key, value ? byId.get(value.marketId) : null]));
  return {
    _id: FRESH_DEMO_ID,
    farmerId: 'LOCAL_DEMO',
    input: { cropKey: 'tomato', quantityKg: 100, harvestedAt: new Date(generatedAt.getTime() - 2 * 60 * 60_000), ripenessStage: 'TURNING', storageCondition: 'SHADE', handlingCondition: 'GOOD', pickup: { ...destination, name: 'Synthetic pickup' }, earliestPickupAt: generatedAt, desiredArrivalBy: deadline, searchRadiusKm: 100 },
    demoScenarioKey: FRESH_DEMO_ID,
    generatedAt: generatedAt.toISOString(), expiresAt: new Date(generatedAt.getTime() + 60 * 60_000).toISOString(),
    cropProfileVersion: 'demo-v1', freshnessModelVersion: 'demo-v1', pricePolicyVersion: 'SIMULATED', rankingPolicyVersion: ranked.policyVersion,
    options: options.map((option) => ({ ...option, route: { ...option!.route, estimateSource: 'SIMULATED', estimatedArrivalAt: option!.arrivalAt, endToEndDurationMinutes: option!.route.durationMinutes + (option!.route.pickupBufferMinutes ?? 0) + (option!.route.marketUnloadingBufferMinutes ?? 0) }, marketLocation: scenario.find((item) => item.marketId === option!.marketId)!.marketLocation, marketReferenceSource: 'SYNTHETIC DEMO FIXTURE', marketAcceptance: 'SIMULATED',
      distanceFromPickupKm: option!.route.distanceKm, arrivalAt: option!.arrivalAt, transport: { ...option!.transport },
      freshness: { status: 'INSUFFICIENT_DATA', score: null, band: null, modelVersion: null, missingInputs: ['No real produce measurement'], warnings: ['Simulation only'], estimatedLatestArrivalAt: null },
      expectedSaleableKg: option!.expectedSaleableKg, unknownCostItems: option!.unknownCostItems,
      simulation: { receivingHours: scenario.find((item) => item.marketId === option!.marketId)!.receivingHours, priceUnit: 'INR_PER_KG', provenance: scenario.find((item) => item.marketId === option!.marketId)!.provenance, saleableAssumption: 'Synthetic handling assumption for this scenario; not a measured loss estimate.', costAssumption: (option!.unknownCostItems?.length ?? 0) ? 'Some real market/handling costs are unknown.' : 'No additional unknown cost is included in this fixture; real market fees remain unknown.' },
    })),
    recommendations,
    warnings: ['SYNTHETIC_SIMULATION_ONLY', 'NOT_LIVE_MARKET_DATA', 'NOT_BOOKABLE'],
    missingData: ['Real market price', 'Verified crop acceptance', 'Real transport availability', 'Actual market costs'],
    status: 'READY',
  };
}
