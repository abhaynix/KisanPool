import { haversineKm } from '../../lib/geo';
import { FreshRecommendation } from '../../models';
import { KNOWN_MANDIS } from '../ai/places';
import { previewFreshMarketTransport } from './preview';
import { rankFreshOptions, RANKING_POLICY_VERSION } from './ranking';
import { estimateFreshness, FRESHNESS_MODEL_VERSION, getCropProfile } from '../freshness/profiles';

export const FRESH_PRICE_POLICY_VERSION = 'market-price-24h-72h-v1';
const SNAPSHOT_TTL_MS = 15 * 60 * 1000;

export interface FreshInput {
  cropKey: string;
  quantityKg: number;
  harvestedAt: Date;
  ripenessStage: 'GREEN' | 'TURNING' | 'PINK' | 'RED' | 'UNKNOWN';
  storageCondition: 'SHADE' | 'AMBIENT' | 'COOL_STORAGE' | 'UNKNOWN';
  storageTemperatureC?: number;
  handlingCondition: 'GOOD' | 'BRUISED' | 'ROUGH_HANDLING' | 'UNKNOWN';
  pickup: { name: string; lat: number; lng: number };
  earliestPickupAt: Date;
  desiredArrivalBy?: Date;
  searchRadiusKm: number;
}

export function getFreshCropCatalogue() {
  const profile = getCropProfile('tomato')!;
  return [{
    cropKey: profile.cropKey,
    displayName: profile.displayName,
    aliases: profile.aliases,
    ripenessStages: ['GREEN', 'TURNING', 'PINK', 'RED', 'UNKNOWN'],
    storageConditions: ['SHADE', 'AMBIENT', 'COOL_STORAGE', 'UNKNOWN'],
    handlingConditions: ['GOOD', 'BRUISED', 'ROUGH_HANDLING', 'UNKNOWN'],
    shelfWindowSupported: profile.estimatedLatestArrivalSupported,
    profileVersion: profile.profileVersion,
    freshnessModelVersion: profile.freshnessModelVersion,
  }];
}

function marketCandidates(pickup: { lat: number; lng: number }, radiusKm: number) {
  const within = (radius: number) => KNOWN_MANDIS
    .map((market) => ({
      marketId: market.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
      name: market.name,
      location: { lat: market.lat, lng: market.lng },
      source: 'KisanPool place reference; acceptance and current market status unverified',
      distanceKm: haversineKm(pickup, { lat: market.lat, lng: market.lng }),
    }))
    .filter((market) => market.distanceKm <= radius)
    .sort((a, b) => a.distanceKm - b.distanceKm);

  let result = within(radiusKm);
  if (result.length < 3 && radiusKm < 200) {
    const expanded = within(200);
    const seen = new Set(result.map((market) => market.marketId));
    result = [...result, ...expanded.filter((market) => !seen.has(market.marketId))];
  }
  return result;
}

/** Persist an immutable result snapshot; future reads never recalculate it. */
export async function createFreshRecommendation(farmerId: string, input: FreshInput) {
  const profile = getCropProfile(input.cropKey)!;
  const generatedAt = new Date();
  const candidates = marketCandidates(input.pickup, input.searchRadiusKm);
  const transportPreviews = await previewFreshMarketTransport({
    farmerId,
    quantityKg: input.quantityKg,
    pickup: input.pickup,
    earliestPickupAt: input.earliestPickupAt,
    markets: candidates.map((market) => ({
      marketId: market.marketId,
      name: market.name,
      location: market.location,
    })),
  });
  const previewsByMarket = new Map(transportPreviews.options.map((option) => [option.marketId, option]));

  const options = candidates.map((market) => {
    const preview = previewsByMarket.get(market.marketId);
    const route = preview?.route;
    const transport = preview?.transport.candidates[0];
    const freshness = estimateFreshness({
      cropKey: input.cropKey,
      harvestedAt: input.harvestedAt,
      now: generatedAt,
      ripenessStage: input.ripenessStage,
      storageCondition: input.storageCondition,
      storageTemperatureC: input.storageTemperatureC,
      routeDurationMinutes: route?.endToEndDurationMinutes ?? 0,
      handlingCondition: input.handlingCondition,
    });
    return {
      marketId: market.marketId,
      marketName: market.name,
      marketLocation: market.location,
      marketReferenceSource: market.source,
      marketAcceptance: 'UNKNOWN' as const,
      distanceFromPickupKm: Math.round(market.distanceKm * 10) / 10,
      route: route ?? null,
      arrivalAt: route?.estimatedArrivalAt ?? new Date(
        input.earliestPickupAt.getTime(),
      ).toISOString(),
      transport: transport
        ? { available: true, ...transport }
        : { available: false, candidates: [], reason: 'NO_VEHICLE_AVAILABLE' },
      price: null,
      freshness,
      expectedSaleableKg: null,
      unknownCostItems: ['Market handling and selling costs are not configured.'],
      warnings: [
        'MARKET_ACCEPTANCE_UNVERIFIED',
        'PRICE_DATA_UNAVAILABLE',
        'SALEABLE_QUANTITY_UNSUPPORTED',
        ...(!transport ? ['NO_VEHICLE_AVAILABLE'] : []),
      ],
    };
  });

  const rankingCandidates = options.map((option) => ({
    marketId: option.marketId,
    marketName: option.marketName,
    cropAccepted: 'UNKNOWN' as const,
    receivingHoursPass: 'UNKNOWN' as const,
    route: {
      available: option.route != null,
      distanceKm: option.route?.distanceKm ?? 0,
      durationMinutes: option.route?.durationMinutes ?? 0,
      source: option.route?.estimateSource ?? 'UNAVAILABLE',
      pickupBufferMinutes: option.route?.pickupBufferMinutes ?? 0,
      marketUnloadingBufferMinutes: option.route?.marketUnloadingBufferMinutes ?? 0,
    },
    transport: {
      available: option.transport.available,
      farmerPayableINR: 'farmerPayableINR' in option.transport ? option.transport.farmerPayableINR : null,
      vehicleId: 'vehicleId' in option.transport ? option.transport.vehicleId : null,
    },
    price: {
      sourceType: 'NONE', status: 'UNAVAILABLE',
      minINRPerKg: null, modalINRPerKg: null, maxINRPerKg: null,
    },
    quantityKg: input.quantityKg,
    expectedSaleableKg: null,
    unknownCostItems: option.unknownCostItems,
    arrivalAt: option.arrivalAt,
    freshness: option.freshness,
  }));
  const ranked = rankFreshOptions(rankingCandidates, {
    now: generatedAt,
    strictDeadline: Boolean(input.desiredArrivalBy),
    desiredArrivalBy: input.desiredArrivalBy,
  });
  const missingData = [...new Set([
    ...(candidates.length ? [] : ['NO_MARKET_CANDIDATES_IN_RADIUS']),
    'MARKET_CROP_ACCEPTANCE',
    'LIVE_MARKET_PRICE',
    'MARKET_RECEIVING_HOURS',
    'SUPPORTED_SALEABLE_QUANTITY',
    'MARKET_HANDLING_COSTS',
    ...(options.some((option) => option.freshness.status === 'INSUFFICIENT_DATA')
      ? ['FRESHNESS_RISK_INPUTS'] : []),
  ])];
  const warnings = [...new Set([
    ...ranked.warnings,
    'CANDIDATE_MARKET_LOCATIONS_ARE_REFERENCE_ONLY',
    'NO_LIVE_MARKET_PRICE_FEED_CONFIGURED',
    'NO_MARKET_ACCEPTANCE_RECORDS_CONFIGURED',
  ])];
  const expiresAt = new Date(generatedAt.getTime() + SNAPSHOT_TTL_MS);
  const snapshot = await FreshRecommendation.create({
    farmerId,
    input,
    generatedAt,
    expiresAt,
    cropProfileVersion: profile.profileVersion,
    freshnessModelVersion: FRESHNESS_MODEL_VERSION,
    pricePolicyVersion: FRESH_PRICE_POLICY_VERSION,
    rankingPolicyVersion: RANKING_POLICY_VERSION,
    options,
    recommendations: ranked.recommendations,
    warnings,
    missingData,
    status: ranked.status,
  });

  return snapshot.toObject();
}

export async function getFreshRecommendation(farmerId: string, recommendationId: string) {
  // Querying by owner returns the same not-found result for absent and foreign IDs.
  return FreshRecommendation.findOne({ _id: recommendationId, farmerId }).lean();
}
