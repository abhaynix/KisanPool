import { createHash } from 'crypto';
import { haversineKm } from '../../lib/geo';
import { FreshBuyerOffer, FreshDeliveryOutcome, FreshRecommendation, TransportRequest, TripShipment } from '../../models';
import { ApiError } from '../../lib/envelope';
import { createRequest } from '../transport/service';
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
    cropType: input.cropKey,
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
      transport: preview?.transport.available && transport
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

/** Local seeded fixture lookup, scoped to the signed-in farmer. */
export async function getFreshDemoRecommendation(farmerId: string) {
  return FreshRecommendation.findOne({ farmerId, 'input.demoScenarioKey': 'fresh-demo-v1' })
    .sort({ generatedAt: -1 })
    .lean();
}

export async function selectFreshRecommendation(
  farmerId: string,
  recommendationId: string,
  input: {
    recommendationType: 'bestBalanced' | 'highestNetProceeds' | 'fastestFeasible' | 'closestSuitable';
    confirmedFarmerPayableINR?: number;
  },
) {
  const snapshot = await getFreshRecommendation(farmerId, recommendationId) as any;
  if (!snapshot) throw new ApiError('RESOURCE_NOT_FOUND', 'That recommendation was not found.');
  const requestId = createHash('sha256').update(`fresh-selection:${String(snapshot._id)}`).digest('hex').slice(0, 24);
  const existing = await TransportRequest.findOne({ freshRecommendationId: snapshot._id, farmerId });
  if (existing) return { request: existing, alreadySelected: true };
  const replayed = await TransportRequest.findOne({ _id: requestId, farmerId, freshRecommendationId: snapshot._id });
  if (replayed) return { request: replayed, alreadySelected: true };
  if (new Date(snapshot.expiresAt).getTime() <= Date.now()) {
    throw new ApiError('BOOKING_STATE_INVALID', 'This comparison expired. Create a fresh comparison before selecting.');
  }

  const selected = snapshot.recommendations?.[input.recommendationType];
  if (!selected || selected.fullyEligible !== true) {
    throw new ApiError('BOOKING_STATE_INVALID', 'This comparison has no verified, bookable recommendation.');
  }
  const candidate = snapshot.options.find((option: any) => option.marketId === selected.marketId);
  if (!candidate || candidate.marketAcceptance !== true || !candidate.route || !candidate.transport?.available) {
    throw new ApiError('BOOKING_STATE_INVALID', 'Market acceptance, route, or transport is no longer verified.');
  }
  const marketPoint = candidate.marketLocation;
  const freshQuote = await previewFreshMarketTransport({
    farmerId,
    quantityKg: snapshot.input.quantityKg,
    cropType: snapshot.input.cropKey,
    pickup: snapshot.input.pickup,
    earliestPickupAt: new Date().toISOString(),
    markets: [{ marketId: candidate.marketId, name: candidate.marketName, location: marketPoint }],
  });
  const currentTransport = freshQuote.options[0]?.transport;
  const current = currentTransport?.candidates?.[0];
  if (!current || currentTransport.available !== true || current.farmerPayableINR == null) {
    throw new ApiError('BOOKING_STATE_INVALID', 'Transport is no longer available. Create a new comparison.');
  }
  const oldAmount = candidate.transport.farmerPayableINR;
  const newAmount = current.farmerPayableINR;
  const movedMaterially = oldAmount == null || Math.abs(newAmount - oldAmount) > Math.max(50, Math.abs(oldAmount) * 0.03);
  if (movedMaterially && (input.confirmedFarmerPayableINR == null || Math.abs(input.confirmedFarmerPayableINR - newAmount) > 1)) {
    return {
      reconfirmationRequired: true,
      previousFarmerPayableINR: oldAmount,
      currentFarmerPayableINR: newAmount,
      message: 'The transport preview changed. Review the current estimate and submit again to continue.',
    };
  }

  try {
    const request = await createRequest(farmerId, {
      id: requestId,
      cropType: snapshot.input.cropKey,
      quantityKg: snapshot.input.quantityKg,
      pickup: snapshot.input.pickup,
      destination: { name: candidate.marketName, ...marketPoint },
      preferredDate: new Date(snapshot.input.earliestPickupAt),
      notes: `Fresh comparison ${String(snapshot._id)}; selected ${input.recommendationType}. Transporter offer and booking follow the standard KisanPool flow.`,
      freshSelection: { recommendationId: String(snapshot._id), optionId: input.recommendationType },
    });
    return { request, alreadySelected: false, reconfirmationRequired: false };
  } catch (error) {
    if ((error as { code?: number })?.code === 11000) {
      const committed = await TransportRequest.findOne({ freshRecommendationId: snapshot._id, farmerId });
      if (committed) return { request: committed, alreadySelected: true };
    }
    throw error;
  }
}

export async function recordFreshDeliveryOutcome(
  farmerId: string,
  input: {
    requestId: string;
    actualPickupAt: Date;
    actualDeliveredAt: Date;
    actualSoldPriceINRPerKg?: number;
    acceptedKg: number;
    rejectedKg: number;
    additionalCostsINR?: number;
    qualityOutcome: 'ACCEPTED' | 'PARTIAL_REJECTION' | 'REJECTED' | 'NOT_REPORTED';
  },
) {
  const request = await TransportRequest.findOne({ _id: input.requestId, farmerId });
  if (!request) throw new ApiError('RESOURCE_NOT_FOUND', 'That Fresh delivery was not found.');
  if (!request.freshRecommendationId) throw new ApiError('BOOKING_STATE_INVALID', 'This transport request is not linked to a Fresh comparison.');
  const shipment = await TripShipment.findOne({ requestId: request._id, farmerId });
  if (!shipment || !['DELIVERED', 'PAYMENT_PENDING', 'PAID', 'COMPLETED'].includes(shipment.state)) {
    throw new ApiError('BOOKING_STATE_INVALID', 'Record the outcome after the delivery is complete.');
  }
  if (input.actualPickupAt > input.actualDeliveredAt || input.actualDeliveredAt > new Date()) {
    throw new ApiError('BOOKING_STATE_INVALID', 'Enter valid pickup and delivery times.');
  }
  if (input.acceptedKg + input.rejectedKg > shipment.quantityKg) {
    throw new ApiError('BOOKING_STATE_INVALID', 'Accepted and rejected quantity cannot exceed the delivered batch.');
  }
  const existing = await FreshDeliveryOutcome.findOne({ requestId: request._id });
  if (existing) return existing;
  const recommendation = request.freshRecommendationId
    ? await FreshRecommendation.findOne({ _id: request.freshRecommendationId, farmerId }).lean() as any
    : null;
  const selected = recommendation?.recommendations?.[request.freshOptionId ?? ''];
  try {
    return await FreshDeliveryOutcome.create({
      farmerId,
      requestId: request._id,
      tripId: shipment.tripId,
      shipmentId: shipment._id,
      recommendationId: request.freshRecommendationId,
      expectedSoldPriceINRPerKg: selected?.price?.modalINRPerKg ?? undefined,
      expectedSaleableKg: selected?.financials?.saleableKg ?? undefined,
      expectedArrivalAt: selected?.arrivalAt ? new Date(selected.arrivalAt) : undefined,
      expectedTransportCostINR: selected?.transport?.farmerPayableINR ?? undefined,
      actualPickupAt: input.actualPickupAt,
      actualDeliveredAt: input.actualDeliveredAt,
      actualSoldPriceINRPerKg: input.actualSoldPriceINRPerKg,
      acceptedKg: input.acceptedKg,
      rejectedKg: input.rejectedKg,
      additionalCostsINR: input.additionalCostsINR,
      qualityOutcome: input.qualityOutcome,
      evidenceSource: 'FARMER_REPORTED',
    });
  } catch (error) {
    if ((error as { code?: number })?.code === 11000) {
      const committed = await FreshDeliveryOutcome.findOne({ requestId: request._id });
      if (committed) return committed;
    }
    throw error;
  }
}

export async function createFreshBuyerOffer(farmerId: string, input: {
  recommendationId: string;
  marketName: string;
  buyerLabel?: string;
  priceINRPerKg: number;
  quantityKg?: number;
  validUntil: Date;
}) {
  const snapshot = await getFreshRecommendation(farmerId, input.recommendationId);
  if (!snapshot) throw new ApiError('RESOURCE_NOT_FOUND', 'That comparison was not found.');
  if (input.validUntil <= new Date()) throw new ApiError('BOOKING_STATE_INVALID', 'Buyer quote validity must be in the future.');
  return FreshBuyerOffer.create({ ...input, farmerId, evidenceStatus: 'FARMER_REPORTED_UNVERIFIED' });
}

export async function listFreshBuyerOffers(farmerId: string, recommendationId: string) {
  const snapshot = await getFreshRecommendation(farmerId, recommendationId);
  if (!snapshot) throw new ApiError('RESOURCE_NOT_FOUND', 'That comparison was not found.');
  return FreshBuyerOffer.find({ farmerId, recommendationId }).sort({ createdAt: -1 }).lean();
}
