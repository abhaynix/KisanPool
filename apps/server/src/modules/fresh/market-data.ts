import { normalizeMarketPrice } from '@kisanpool/shared';
import { Market, MarketAcceptanceObservation, MarketPriceObservation } from '../../models';

export function marketPriceView(observation: any, now = new Date()) {
  const price = normalizeMarketPrice({
    sourceMinPrice: observation.sourceMinPrice,
    sourceModalPrice: observation.sourceModalPrice,
    sourceMaxPrice: observation.sourceMaxPrice,
    sourcePriceUnit: observation.sourcePriceUnit,
    sourceType: observation.sourceType,
    sourceName: observation.sourceName,
    sourceUrl: observation.sourceUrl,
    sourceRecordId: observation.sourceRecordId,
    observedAt: observation.observedAt,
    fetchedAt: observation.fetchedAt,
  }, { now });
  return { ...price, eligibleForLiveRecommendation: price.dataStatus === 'VALID' && ['OFFICIAL', 'CONFIRMED_BUYER'].includes(price.sourceType) };
}

export async function readMarketEvidence(cropKey: string, now = new Date()) {
  const markets = await Market.find({ active: true }).sort({ name: 1 }).lean();
  const ids = markets.map((market) => market._id);
  const [acceptances, observations] = await Promise.all([
    MarketAcceptanceObservation.find({ marketId: { $in: ids }, cropKey: cropKey.toLowerCase() }).sort({ observedAt: -1 }).lean(),
    MarketPriceObservation.find({ marketId: { $in: ids }, cropKey: cropKey.toLowerCase() }).sort({ observedAt: -1 }).lean(),
  ]);
  return markets.map((market) => {
    const acceptance = acceptances.find((item) => String(item.marketId) === String(market._id));
    const currentAcceptance = acceptance && acceptance.expiresAt > now ? acceptance : null;
    const observation = observations.find((item) => String(item.marketId) === String(market._id));
    const price = observation ? marketPriceView(observation, now) : null;
    return {
      marketId: String(market._id), code: market.code, name: market.name, location: market.location,
      catalogueSource: { name: market.sourceName, url: market.sourceUrl, verifiedAt: market.verifiedAt, verifiedBy: market.verifiedBy },
      acceptance: currentAcceptance ? {
        status: 'VALID',
        accepted: currentAcceptance.accepted,
        receivingHours: currentAcceptance.receivingHours,
        receivingHoursVerified: currentAcceptance.receivingHoursVerified,
        sourceName: currentAcceptance.sourceName,
        sourceUrl: currentAcceptance.sourceUrl,
        observedAt: currentAcceptance.observedAt,
        expiresAt: currentAcceptance.expiresAt,
        verificationStatus: currentAcceptance.verificationStatus,
      } : acceptance ? {
        status: 'EXPIRED', accepted: null, receivingHours: null, receivingHoursVerified: false,
        sourceName: acceptance.sourceName, sourceUrl: acceptance.sourceUrl, observedAt: acceptance.observedAt,
        expiresAt: acceptance.expiresAt, verificationStatus: 'EXPIRED',
      } : { status: 'UNKNOWN', accepted: null, receivingHours: null, receivingHoursVerified: false, verificationStatus: 'UNKNOWN' },
      price,
    };
  });
}
