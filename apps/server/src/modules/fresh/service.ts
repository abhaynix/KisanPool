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

export interface MarketDemandItem {
  crop: string;
  pricePerKg: number;
  rawPrice: number;
  unit: string;
  ageHours: number;
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
  acceptedCrops?: string[];
  demands?: MarketDemandItem[];
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
  if (candidates.length < 3 && items.length > 0) {
    candidates = items;
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
  let rawMarkets = await FreshMarket.find({
    active: { $ne: false },
    $or: [
      { acceptedCrops: normCrop },
      { acceptedCrops: { $in: [normCrop, new RegExp(`^${normCrop}$`, 'i')] } },
      { acceptedCrops: { $size: 0 } },
      { acceptedCrops: { $exists: false } },
    ],
  }).lean();

  const isCustomCropFallback = !rawMarkets.length;
  if (isCustomCropFallback) {
    // If no market specifically lists this crop, show all active markets for custom request
    rawMarkets = await FreshMarket.find({ active: { $ne: false } }).lean();
  }

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

  // Also query latest prices across all crops for these markets to show full market demand
  const allLatestPrices = await FreshPrice.aggregate([
    {
      $match: {
        marketId: { $in: marketIds },
      },
    },
    { $sort: { observedAt: -1 } },
    {
      $group: {
        _id: { marketId: '$marketId', crop: '$crop' },
        latestPrice: { $first: '$$ROOT' },
      },
    },
  ]);

  const allPricesByMarketAndCrop = new Map(
    allLatestPrices.map((lp) => [`${String(lp._id.marketId)}_${lp._id.crop}`, lp.latestPrice]),
  );

  const now = Date.now();
  const processedMarkets: MarketRecommendationItem[] = [];

  for (const { market, marketLocation } of candidates) {
    const priceDoc = priceByMarketId.get(String(market._id));
    const hasPrice = priceDoc != null;

    // Build demand items for all crops accepted by this market
    const demands: MarketDemandItem[] = (market.acceptedCrops || []).map((c: string) => {
      const p = allPricesByMarketAndCrop.get(`${String(market._id)}_${c}`);
      const ageH = p
        ? Math.max(0, Math.round(((now - new Date(p.observedAt).getTime()) / (3600 * 1000)) * 10) / 10)
        : 0;
      return {
        crop: c,
        pricePerKg: p ? convertPriceToPerKg(p.price, p.unit) : 0,
        rawPrice: p ? p.price : 0,
        unit: p ? p.unit : 'kg',
        ageHours: ageH,
      };
    });

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

    // Price conversion & net proceeds
    let pricePerKg = 0;
    let rawPrice = 0;
    let rawUnit = 'kg';
    let priceSource = 'OPERATOR';
    let ageHours = 0;
    let freshness: 'fresh' | 'stale' | 'expired' = 'fresh';
    const warnings: string[] = [];

    let netINR = 0;
    let commissionINR = 0;
    let handlingINR = 0;

    if (hasPrice) {
      pricePerKg = convertPriceToPerKg(priceDoc.price, priceDoc.unit);
      rawPrice = priceDoc.price;
      rawUnit = priceDoc.unit;
      priceSource = priceDoc.sourceType;
      const observedAtDate = new Date(priceDoc.observedAt);
      ageHours = Math.max(0, Math.round(((now - observedAtDate.getTime()) / (3600 * 1000)) * 10) / 10);

      const financials = calculateNetProceeds({
        saleableKg,
        pricePerKg,
        transportCostINR,
        commissionPct: market.commissionPct ?? 0,
        handlingINRPerKg: market.handlingINRPerKg ?? 0,
      });
      netINR = financials.netINR;
      commissionINR = financials.commissionINR;
      handlingINR = financials.handlingINR;

      if (ageHours <= 24) {
        freshness = 'fresh';
      } else if (ageHours <= 72) {
        freshness = 'stale';
        warnings.push('Price 24 ghante se purana hai (stale)');
      } else {
        freshness = 'expired';
        warnings.push('Price 72 ghante se purana hai (expired)');
      }
    } else {
      freshness = 'stale';
      warnings.push('Mandi ne is crop ka bhav abhi update nahi kiya hai (Custom Request bhej sakte hain)');
    }

    if (isCustomCropFallback) {
      warnings.push(`Custom produce: Mandi se approval ke liye direct custom request bhejein`);
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
    let reasonText = hasPrice
      ? `₹${pricePerKg.toFixed(1)}/kg bhav, ${distanceKm} km door, ${lossPct}% est. loss`
      : `Mandi crop accept karti hai · Bhav update hote hi live net dikhega`;
    if (hasPrice && freshness === 'fresh' && !deadlineMiss) {
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
      rawPrice,
      rawUnit,
      priceSource,
      priceAgeHours: ageHours,
      freshness,
      lossPct,
      saleableKg,
      costs: {
        transport: transportCostINR,
        commission: commissionINR,
        handling: handlingINR,
      },
      net: netINR,
      reasonText,
      warnings,
      deadlineMiss,
      acceptedCrops: market.acceptedCrops || [normCrop],
      demands,
    });
  }

  const ranked = rankAndSelectPicks(processedMarkets, deadlineHours);
  return {
    markets: processedMarkets,
    ...ranked,
  };
}

export async function getActiveFreshMarketsWithDemand(query: {
  lat?: number | string;
  lng?: number | string;
}): Promise<any[]> {
  const pickup: Point =
    query.lat != null && query.lng != null
      ? { lat: Number(query.lat), lng: Number(query.lng) }
      : { lat: 19.8913, lng: 74.4799 };

  const markets = await FreshMarket.find({ active: true }).lean();
  if (!markets.length) return [];

  const marketIds = markets.map((m) => m._id);
  const now = Date.now();

  const allLatestPrices = await FreshPrice.aggregate([
    {
      $match: {
        marketId: { $in: marketIds },
      },
    },
    { $sort: { observedAt: -1 } },
    {
      $group: {
        _id: { marketId: '$marketId', crop: '$crop' },
        latestPrice: { $first: '$$ROOT' },
      },
    },
  ]);

  const priceMap = new Map(
    allLatestPrices.map((lp) => [`${String(lp._id.marketId)}_${lp._id.crop}`, lp.latestPrice]),
  );

  return markets
    .map((m) => {
      const marketLoc: Point = {
        lat: m.location?.lat ?? pickup.lat,
        lng: m.location?.lng ?? pickup.lng,
      };
      const distanceKm = Math.round(haversineKm(pickup, marketLoc) * 10) / 10;
      const demands = (m.acceptedCrops || []).map((crop: string) => {
        const p = priceMap.get(`${String(m._id)}_${crop}`);
        const ageHours = p
          ? Math.max(0, Math.round(((now - new Date(p.observedAt).getTime()) / (3600 * 1000)) * 10) / 10)
          : 0;
        return {
          crop,
          pricePerKg: p ? convertPriceToPerKg(p.price, p.unit) : 0,
          rawPrice: p ? p.price : 0,
          unit: p ? p.unit : 'kg',
          ageHours,
        };
      });

      return {
        id: String(m._id),
        name: m.name,
        code: m.code,
        location: marketLoc,
        acceptedCrops: m.acceptedCrops,
        commissionPct: m.commissionPct,
        handlingINRPerKg: m.handlingINRPerKg,
        active: m.active,
        distanceKm,
        demands,
      };
    })
    .sort((a, b) => a.distanceKm - b.distanceKm);
}
