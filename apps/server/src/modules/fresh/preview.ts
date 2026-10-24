import { getDirections } from '../maps/service';
import { previewLoadQuote } from '../pooling/service';

export interface FreshPreviewMarket {
  marketId: string;
  name: string;
  location: { lat: number; lng: number };
}

/**
 * Side-effect-free route and transport preview for a supplied set of market
 * candidates. Market discovery/acceptance belongs to the market catalogue; this
 * service only estimates candidate routes and queries the existing vehicle and
 * pooling-pricing domain. It does not reserve capacity or create a request.
 */
export async function previewFreshMarketTransport(
  input: {
  farmerId: string;
    quantityKg: number;
    cropType?: string;
  pickup: { lat: number; lng: number };
  earliestPickupAt?: Date | string;
  pickupBufferMinutes?: number;
  marketUnloadingBufferMinutes?: number;
  markets: FreshPreviewMarket[];
  },
  dependencies: {
    getDirections: typeof getDirections;
    previewLoadQuote: typeof previewLoadQuote;
  } = { getDirections, previewLoadQuote },
) {
  const results = await Promise.all(input.markets.map(async (market) => {
    const route = await dependencies.getDirections(input.pickup, market.location);
    const transport = await dependencies.previewLoadQuote({
      farmerId: input.farmerId,
      quantityKg: input.quantityKg,
      pickup: input.pickup,
      destination: market.location,
      cropType: input.cropType,
    });

    const pickupBufferMinutes = input.pickupBufferMinutes ?? 0;
    const marketUnloadingBufferMinutes = input.marketUnloadingBufferMinutes ?? 0;
    const endToEndDurationMinutes = route.durationMinutes + pickupBufferMinutes + marketUnloadingBufferMinutes;
    return {
      marketId: market.marketId,
      marketName: market.name,
      route: {
        distanceKm: route.distanceKm,
        durationMinutes: route.durationMinutes,
        pickupBufferMinutes,
        marketUnloadingBufferMinutes,
        endToEndDurationMinutes,
        estimatedArrivalAt: input.earliestPickupAt
          ? new Date(new Date(input.earliestPickupAt).getTime() + endToEndDurationMinutes * 60_000).toISOString()
          : null,
        estimateSource: route.source,
        polyline: route.polyline,
      },
      transport,
    };
  }));

  return {
    sideEffectFree: true as const,
    generatedAt: new Date().toISOString(),
    options: results,
  };
}
