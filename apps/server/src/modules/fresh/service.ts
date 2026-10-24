import { createHash } from 'crypto';
import { config } from '../../config';
import { haversineKm } from '../../lib/geo';
import { FreshBuyerOffer, FreshDeliveryOutcome, FreshRecommendation, Market, TransportRequest, TripShipment } from '../../models';
import { ApiError } from '../../lib/envelope';
import { createRequest } from '../transport/service';
import { KNOWN_MANDIS } from '../ai/places';
import { previewFreshMarketTransport } from './preview';
import { rankFreshOptions, RANKING_POLICY_VERSION } from './ranking';
import { estimateFreshness, FRESHNESS_MODEL_VERSION, getCropProfile } from '../freshness/profiles';
import { buildFreshDemoScenario, FRESH_DEMO_ID } from './demo-scenario';
import { readMarketEvidence } from './market-data';
import {
  baselineSaleableKg,
  marketCostTerms,
  receivingHoursPassForArrival,
  SALEABLE_BASELINE_WARNING,
} from './eligibility';

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

async function marketCandidates(pickup: { lat: number; lng: number }, radiusKm: number) {
  const catalogue = (await Market.find({ active: true }).lean()).filter((market) => market.location?.lat != null && market.location?.lng != null);
  if (catalogue.length) return catalogue.map((market) => ({
    catalogued: true,
    marketId: market.code,
    name: market.name,
    location: market.location!,
    source: `${market.sourceName}${market.sourceUrl ? ` · ${market.sourceUrl}` : ''}`,
    distanceKm: haversineKm(pickup, market.location!),
  })).filter((market) => market.distanceKm <= radiusKm).sort((a, b) => a.distanceKm - b.distanceKm);
  const within = (radius: number) => KNOWN_MANDIS
    .map((market) => ({
      catalogued: false,
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
  const candidates = await marketCandidates(input.pickup, input.searchRadiusKm);
  const evidence = await readMarketEvidence(input.cropKey, generatedAt);
  const evidenceByMarket = new Map(evidence.map((item) => [item.code, item]));
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
  const saleableKg = baselineSaleableKg(input.quantityKg);

  const options = candidates.map((market) => {
    const marketEvidence = evidenceByMarket.get(market.marketId);
    const priceEvidence = marketEvidence?.price;
    const validPrice = priceEvidence?.dataStatus === 'VALID' && priceEvidence.eligibleForLiveRecommendation;
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
    const expectedGrossINR = validPrice ? (priceEvidence!.modalPriceINRPerKg ?? 0) * saleableKg : 0;
    const costTerms = marketCostTerms(marketEvidence?.costs, { expectedGrossINR, saleableKg });
    const receivingHoursPass = marketEvidence
      ? receivingHoursPassForArrival(marketEvidence.acceptance, route?.estimatedArrivalAt ?? null)
      : 'UNKNOWN';
    return {
      marketId: market.marketId,
      marketName: market.name,
      marketLocation: market.location,
      marketReferenceSource: market.source,
      marketAcceptance: marketEvidence?.acceptance.accepted ?? 'UNKNOWN',
      receivingHoursPass,
      distanceFromPickupKm: Math.round(market.distanceKm * 10) / 10,
      route: route ?? null,
      arrivalAt: route?.estimatedArrivalAt ?? new Date(
        input.earliestPickupAt.getTime(),
      ).toISOString(),
      transport: preview?.transport.available && transport
        ? { available: true, ...transport }
        : { available: false, candidates: [], reason: 'NO_VEHICLE_AVAILABLE' },
      price: priceEvidence ? {
        sourceType: priceEvidence.sourceType,
        status: priceEvidence.dataStatus,
        minINRPerKg: priceEvidence.minPriceINRPerKg,
        modalINRPerKg: priceEvidence.modalPriceINRPerKg,
        maxINRPerKg: priceEvidence.maxPriceINRPerKg,
        observedAt: priceEvidence.observedAt,
        sourceName: priceEvidence.sourceName,
        sourceUrl: priceEvidence.sourceUrl,
        sourcePriceUnit: priceEvidence.sourcePriceUnit,
      } : null,
      freshness,
      expectedSaleableKg: saleableKg,
      knownOtherCostsINR: costTerms.knownOtherCostsINR,
      unknownCostItems: costTerms.unknownCostItems,
      warnings: [
        ...(marketEvidence?.acceptance.accepted === true ? [] : ['MARKET_ACCEPTANCE_UNVERIFIED']),
        ...(!validPrice ? ['PRICE_DATA_UNAVAILABLE_OR_INELIGIBLE'] : []),
        SALEABLE_BASELINE_WARNING,
        ...(!transport ? ['NO_VEHICLE_AVAILABLE'] : []),
      ],
    };
  });

  const rankingCandidates = options.map((option) => ({
    marketId: option.marketId,
    marketName: option.marketName,
    cropAccepted: (option.marketAcceptance === true ? true : option.marketAcceptance === false ? false : 'UNKNOWN') as boolean | 'UNKNOWN',
    receivingHoursPass: option.receivingHoursPass,
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
      sourceType: option.price?.sourceType ?? 'NONE', status: option.price?.status ?? 'UNAVAILABLE',
      minINRPerKg: option.price?.minINRPerKg ?? null, modalINRPerKg: option.price?.modalINRPerKg ?? null, maxINRPerKg: option.price?.maxINRPerKg ?? null,
      observedAt: option.price?.observedAt,
    },
    quantityKg: input.quantityKg,
    expectedSaleableKg: option.expectedSaleableKg,
    knownOtherCostsINR: option.knownOtherCostsINR,
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
    ...(evidence.some((item) => item.acceptance.accepted != null) ? [] : ['MARKET_CROP_ACCEPTANCE']),
    ...(evidence.some((item) => item.price?.eligibleForLiveRecommendation) ? [] : ['LIVE_MARKET_PRICE']),
    ...(evidence.some((item) => item.acceptance.receivingHoursVerified) ? [] : ['MARKET_RECEIVING_HOURS']),
    ...(evidence.some((item) => item.costs?.costsVerified) ? [] : ['MARKET_HANDLING_COSTS']),
    ...(options.some((option) => option.freshness.status === 'INSUFFICIENT_DATA')
      ? ['FRESHNESS_RISK_INPUTS'] : []),
  ])];
  const warnings = [...new Set([
    ...ranked.warnings,
    ...(candidates.some((market) => !market.catalogued) ? ['CANDIDATE_MARKET_LOCATIONS_ARE_REFERENCE_ONLY'] : []),
    ...(evidence.some((item) => item.price?.eligibleForLiveRecommendation) ? [] : ['NO_LIVE_MARKET_PRICE_FEED_CONFIGURED']),
    ...(evidence.some((item) => item.acceptance.accepted != null) ? [] : ['NO_MARKET_ACCEPTANCE_RECORDS_CONFIGURED']),
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
  if (recommendationId === FRESH_DEMO_ID) {
    if (!config.freshDemoData) throw new ApiError('RESOURCE_NOT_FOUND', 'Fresh demo data is disabled.');
    return { ...buildFreshDemoScenario(), farmerId };
  }
  // Querying by owner returns the same not-found result for absent and foreign IDs.
  return FreshRecommendation.findOne({ _id: recommendationId, farmerId }).lean();
}

/** Deterministic local simulation, scoped to the signed-in farmer. */
export async function getFreshDemoRecommendation(farmerId: string) {
  return { ...buildFreshDemoScenario(), farmerId };
}

export async function selectFreshRecommendation(
  farmerId: string,
  recommendationId: string,
  input: {
    recommendationType: 'bestBalanced' | 'highestNetProceeds' | 'fastestFeasible' | 'closestSuitable';
    confirmedFarmerPayableINR?: number;
  },
) {
  if (recommendationId === FRESH_DEMO_ID) throw new ApiError('BOOKING_STATE_INVALID', 'Synthetic demo options cannot create transport requests.');
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
  const currentMarket = (await readMarketEvidence(snapshot.input.cropKey)).find((market) => market.code === candidate.marketId);
  if (currentMarket?.acceptance.accepted !== true || currentMarket.acceptance.receivingHoursVerified !== true) {
    throw new ApiError('BOOKING_STATE_INVALID', 'Current market acceptance or receiving-hours evidence is unavailable. Create a new comparison after it is verified.');
  }
  if (!currentMarket.price?.eligibleForLiveRecommendation) {
    throw new ApiError('BOOKING_STATE_INVALID', 'The market price is missing, stale or ineligible. Create a new comparison after current evidence is available.');
  }
  if (receivingHoursPassForArrival(currentMarket.acceptance, candidate.arrivalAt) !== true) {
    throw new ApiError('BOOKING_STATE_INVALID', 'The market is not verified to receive produce at the estimated arrival time. Create a new comparison.');
  }
  if (!currentMarket.costs?.costsVerified) {
    throw new ApiError('BOOKING_STATE_INVALID', 'Market selling costs are no longer verified. Create a new comparison after operations confirms them.');
  }
  const oldPrice = candidate.price?.modalINRPerKg;
  const currentPrice = currentMarket.price.modalPriceINRPerKg;
  if (oldPrice == null || currentPrice == null || Math.abs(currentPrice - oldPrice) > Math.max(1, oldPrice * 0.03)) {
    throw new ApiError('BOOKING_STATE_INVALID', 'Market price changed materially. Create a new comparison and review the updated estimate.');
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
