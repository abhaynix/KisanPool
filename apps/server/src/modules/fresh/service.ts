import { haversineKm, money, type Point } from '../../lib/geo';
import { FreshMarket, type FreshMarketDoc } from '../../models/FreshMarket';
import { FreshPrice, type FreshPriceDoc } from '../../models/FreshPrice';
import { getDirections } from '../maps/service';
import { previewLoadQuote } from '../pooling/service';
import { routeCost } from '../pooling/pricing';
import {
  calculateLossPct,
  calculateNetProceeds,
  calculateSaleableKg,
  convertPriceToPerKg,
  convertQuantityToKg,
  normalizeCondition,
  type CropCondition,
  type CropType,
} from './crop-config';

export const FALLBACK_RATE_PER_KM = 35; // ₹35/km fallback transport cost

export interface RecommendationRequestInput {
  crop: string;
  quantity?: number;
  quantityKg?: number;
  unit?: string;
  pickup?: Point;
  harvestAt?: string | Date;
  harvestedAt?: string | Date;
  condition?: string;
  deadlineHours?: number | null;
}

export interface MarketCostBreakdown {
  transport: number;
  commission: number;
  handling: number;
}

export interface MarketRecommendationItem {
  id: string;
  name: string;
  code: string;
  location: Point;
  distanceKm: number;
  approxDistance: boolean;
  etaMin: number;
  pricePerKg: number;
  rawPrice: number;
  rawUnit: string;
  priceSource: string;
  priceAgeHours: number;
  freshness: 'fresh' | 'stale' | 'expired';
  lossPct: number;
  saleableKg: number;
  costs: MarketCostBreakdown;
  net: number;
  reasonText: string;
  warnings: string[];
  deadlineMiss: boolean;
  score?: number;
}

export interface RecommendationResponse {
  markets: MarketRecommendationItem[];
  picks: {
    nearest?: MarketRecommendationItem;
    bestProfit?: MarketRecommendationItem;
    balanced?: MarketRecommendationItem;
  };
  nearTie: boolean;
  extraVsNearest: number;
  emptyReason: string | null;
}

export function filterMarketsByRadius<T extends { straightDistKm: number }>(items: T[]): T[] {
  let candidates = items.filter((c) => c.straightDistKm <= 100);
  if (candidates.length < 3) {
    candidates = items.filter((c) => c.straightDistKm <= 200);
  }
  return candidates;
}

export function rankAndSelectPicks(
  processedMarkets: MarketRecommendationItem[],
  deadlineHours: number | null = null,
): {
  picks: {
    nearest?: MarketRecommendationItem;
    bestProfit?: MarketRecommendationItem;
    balanced?: MarketRecommendationItem;
  };
  nearTie: boolean;
  extraVsNearest: number;
  emptyReason: string | null;
} {
  if (!processedMarkets.length) {
    return {
      picks: {},
      nearTie: false,
      extraVsNearest: 0,
      emptyReason: 'Is crop ka price abhi kisi market me nahi hai',
    };
  }

  // Check empty reasons
  if (deadlineHours !== null && processedMarkets.every((m) => m.deadlineMiss)) {
    return {
      picks: {},
      nearTie: false,
      extraVsNearest: 0,
      emptyReason: 'Deadline ke andar koi market nahi',
    };
  }

  if (processedMarkets.every((m) => m.freshness === 'expired')) {
    return {
      picks: {},
      nearTie: false,
      extraVsNearest: 0,
      emptyReason: 'Sab prices 72 ghante se purane hain',
    };
  }

  const deadlineEligible = processedMarkets.filter((m) => !m.deadlineMiss);

  // 1. NEAREST pick (min distance)
  let nearestPick: MarketRecommendationItem | undefined;
  if (deadlineEligible.length > 0) {
    nearestPick = [...deadlineEligible].sort((a, b) => a.distanceKm - b.distanceKm)[0];
  }

  // 2. BEST_PROFIT pick (max net, price ≤72h)
  let bestProfitPick: MarketRecommendationItem | undefined;
  const profitEligible = deadlineEligible.filter((m) => m.freshness !== 'expired');
  if (profitEligible.length > 0) {
    bestProfitPick = [...profitEligible].sort((a, b) => b.net - a.net)[0];
  }

  // 3. BALANCED pick:
  // score = .6*normNet + .25*(1 - normTime) + .15*(1 - normDist)
  let balancedPick: MarketRecommendationItem | undefined;
  if (deadlineEligible.length > 0) {
    const nets = deadlineEligible.map((m) => m.net);
    const times = deadlineEligible.map((m) => m.etaMin);
    const dists = deadlineEligible.map((m) => m.distanceKm);

    const minNet = Math.min(...nets);
    const maxNet = Math.max(...nets);
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);
    const minDist = Math.min(...dists);
    const maxDist = Math.max(...dists);

    for (const m of deadlineEligible) {
      const normNet = maxNet === minNet ? 1 : (m.net - minNet) / (maxNet - minNet);
      const normTime = maxTime === minTime ? 0 : (m.etaMin - minTime) / (maxTime - minTime);
      const normDist = maxDist === minDist ? 0 : (m.distanceKm - minDist) / (maxDist - minDist);
      m.score = Math.round((0.6 * normNet + 0.25 * (1 - normTime) + 0.15 * (1 - normDist)) * 1000) / 1000;
    }

    balancedPick = [...deadlineEligible].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];
  }

  // Enhance reasonTexts for the 3 picks
  if (nearestPick) {
    nearestPick.reasonText = `Sabse paas: ${nearestPick.distanceKm} km, ₹${nearestPick.costs.transport} transport`;
  }
  if (bestProfitPick) {
    bestProfitPick.reasonText = `Sabse zyada munafa: ₹${bestProfitPick.net.toLocaleString('en-IN')} net bachega`;
  }
  if (balancedPick) {
    balancedPick.reasonText = `Recommended balance: achha daam (₹${balancedPick.net.toLocaleString('en-IN')}) aur sahi samay (${balancedPick.etaMin}m)`;
  }

  // Near tie check: net difference between picks <= ₹100 or <= 3%
  let nearTie = false;
  if (bestProfitPick && nearestPick) {
    const diff = Math.abs(bestProfitPick.net - nearestPick.net);
    const pct = bestProfitPick.net > 0 ? diff / bestProfitPick.net : 0;
    if (diff <= 100 || pct <= 0.03) {
      nearTie = true;
    }
  }

  // extraVsNearest: BEST_PROFIT net - NEAREST net
  const extraVsNearest =
    bestProfitPick && nearestPick ? Math.round((bestProfitPick.net - nearestPick.net) * 100) / 100 : 0;

  return {
    picks: {
      nearest: nearestPick,
      bestProfit: bestProfitPick,
      balanced: balancedPick,
    },
    nearTie,
    extraVsNearest,
    emptyReason: null,
  };
}

export async function getFreshRecommendations(
  farmerId: string,
  input: RecommendationRequestInput,
): Promise<RecommendationResponse> {
  const normCrop = (input.crop || 'tomato').trim().toLowerCase();
  const rawQty = input.quantity ?? input.quantityKg ?? 100;
  const rawUnit = input.unit ?? 'kg';
  const totalKg = convertQuantityToKg(rawQty, rawUnit);

  const pickup: Point = input.pickup && typeof input.pickup.lat === 'number' && typeof input.pickup.lng === 'number'
    ? { lat: input.pickup.lat, lng: input.pickup.lng }
    : { lat: 19.8913, lng: 74.4799 }; // Kopargaon default coordinates

  const harvestDate = input.harvestAt
    ? new Date(input.harvestAt)
    : input.harvestedAt
    ? new Date(input.harvestedAt)
    : new Date();

  const condition: CropCondition = normalizeCondition(input.condition);
  const deadlineHours = typeof input.deadlineHours === 'number' && input.deadlineHours > 0
    ? input.deadlineHours
    : null;

  // 1. Find active markets accepting this crop
  const rawMarkets = await FreshMarket.find({
    active: true,
    acceptedCrops: normCrop,
  }).lean();

  const allActiveMarkets = rawMarkets.filter(
    (m) => m.location?.lat != null && m.location?.lng != null,
  );

  if (!allActiveMarkets.length) {
    return {
      markets: [],
      picks: {},
      nearTie: false,
      extraVsNearest: 0,
      emptyReason: 'Koi market is crop ko accept nahi karta',
    };
  }

  // 2. Straight-line distance filter: within 100 km; if < 3, expand to 200 km
  const withDistance = allActiveMarkets.map((market) => ({
    market,
    marketLocation: { lat: market.location!.lat, lng: market.location!.lng } as Point,
    straightDistKm: haversineKm(pickup, market.location as Point),
  }));

  let candidates = filterMarketsByRadius(withDistance);

  if (!candidates.length) {
    return {
      markets: [],
      picks: {},
      nearTie: false,
      extraVsNearest: 0,
      emptyReason: 'Koi market is crop ko accept nahi karta',
    };
  }

  // Sort candidates by straight distance
  candidates.sort((a, b) => a.straightDistKm - b.straightDistKm);

  // 3. Query latest price per market
  const marketIds = candidates.map((c) => c.market._id);
  const latestPrices = await FreshPrice.aggregate([
    {
      $match: {
        marketId: { $in: marketIds },
        crop: normCrop,
      },
    },
    { $sort: { observedAt: -1 } },
    {
      $group: {
        _id: '$marketId',
        latestPrice: { $first: '$$ROOT' },
      },
    },
  ]);

  const priceByMarketId = new Map(latestPrices.map((lp) => [String(lp._id), lp.latestPrice]));

  // Check if any market has a price for this crop
  if (!latestPrices.length) {
    return {
      markets: [],
      picks: {},
      nearTie: false,
      extraVsNearest: 0,
      emptyReason: 'Is crop ka price abhi kisi market me nahi hai',
    };
  }

  const now = Date.now();
  const processedMarkets: MarketRecommendationItem[] = [];

  for (const { market, marketLocation } of candidates) {
    const priceDoc = priceByMarketId.get(String(market._id));
    if (!priceDoc) {
      // Market has no price for this crop
      continue;
    }

    // Distance and ETA
    const dir = await getDirections(pickup, marketLocation);
    const distanceKm = dir.distanceKm;
    const etaMin = dir.durationMinutes;
    const approxDistance = dir.source === 'STRAIGHT_LINE_ESTIMATE';

    // Transport cost: try previewLoadQuote, fallback to fallback ₹/km config
    let transportCostINR = routeCost(distanceKm, FALLBACK_RATE_PER_KM);
    try {
      const quotePreview = await previewLoadQuote({
        farmerId,
        quantityKg: totalKg,
        cropType: normCrop,
        pickup,
        destination: marketLocation,
      });
      if (quotePreview.available && quotePreview.candidates.length > 0) {
        transportCostINR = quotePreview.candidates[0].farmerPayableINR;
      }
    } catch {
      // Fallback kept
    }

    // Transit time from harvest to arrival
    const arrivalTime = new Date(now + etaMin * 60_000);
    const hoursHarvestToArrival = Math.max(0, (arrivalTime.getTime() - harvestDate.getTime()) / (3600 * 1000));

    // Loss calculation
    const lossPct = calculateLossPct(condition, normCrop, hoursHarvestToArrival);
    const saleableKg = calculateSaleableKg(totalKg, lossPct);

    // Price conversion
    const pricePerKg = convertPriceToPerKg(priceDoc.price, priceDoc.unit);

    // Net proceeds calculation
    const financials = calculateNetProceeds({
      saleableKg,
      pricePerKg,
      transportCostINR,
      commissionPct: market.commissionPct ?? 0,
      handlingINRPerKg: market.handlingINRPerKg ?? 0,
    });

    // Price age & freshness
    const observedAtDate = new Date(priceDoc.observedAt);
    const ageHours = Math.max(0, Math.round(((now - observedAtDate.getTime()) / (3600 * 1000)) * 10) / 10);
    let freshness: 'fresh' | 'stale' | 'expired';
    const warnings: string[] = [];

    if (ageHours <= 24) {
      freshness = 'fresh';
    } else if (ageHours <= 72) {
      freshness = 'stale';
      warnings.push('Price 24 ghante se purana hai (stale)');
    } else {
      freshness = 'expired';
      warnings.push('Price 72 ghante se purana hai (expired)');
    }

    // Deadline check
    let deadlineMiss = false;
    if (deadlineHours !== null && etaMin / 60 > deadlineHours) {
      deadlineMiss = true;
      warnings.push(`Deadline (${deadlineHours}h) ke baad pahunchega`);
    }

    // Approx distance warning if applicable
    if (approxDistance) {
      warnings.push('Approx distance (straight-line estimate)');
    }

    // Plain Hindi-English reason line
    let reasonText = `₹${pricePerKg.toFixed(1)}/kg bhav, ${distanceKm} km door, ${lossPct}% est. loss`;
    if (freshness === 'fresh' && !deadlineMiss) {
      reasonText += ' · Taaza rate';
    }

    processedMarkets.push({
      id: String(market._id),
      name: market.name,
      code: market.code,
      location: marketLocation,
      distanceKm,
      approxDistance,
      etaMin,
      pricePerKg,
      rawPrice: priceDoc.price,
      rawUnit: priceDoc.unit,
      priceSource: priceDoc.sourceType,
      priceAgeHours: ageHours,
      freshness,
      lossPct,
      saleableKg,
      costs: {
        transport: financials.transportINR,
        commission: financials.commissionINR,
        handling: financials.handlingINR,
      },
      net: financials.netINR,
      reasonText,
      warnings,
      deadlineMiss,
    });
  }

  const ranked = rankAndSelectPicks(processedMarkets, deadlineHours);
  return {
    markets: processedMarkets,
    ...ranked,
  };
}
