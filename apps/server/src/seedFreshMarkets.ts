/**
 * Local TEST evidence for Fresh market comparisons: markets, tomato acceptance,
 * operator-entered indicative prices and verified cost terms.
 *
 * Every value is labelled as test data in its source name, so the app shows it
 * as operator-entered test evidence rather than real mandi or buyer data.
 * Refuses to run in production. Safe to run repeatedly.
 */
import { connectDb, disconnectDb } from './db';
import { Market, MarketAcceptanceObservation, MarketPriceObservation } from './models';

const SOURCE = 'TEST SEED — local operator values, not real market data';
const TEST_VERIFIER = 'seed-fresh-markets';
const DAY = 24 * 60 * 60_000;

// Coordinates match the KisanPool place reference list; prices are invented test values.
const MARKETS = [
  { code: 'pune-market-yard', name: 'Pune Market Yard (Gultekdi)', lat: 18.4805, lng: 73.8683, prices: [18, 22, 26], hours: [6, 14], commissionPct: 6, handlingINRPerKg: 1.5 },
  { code: 'vashi-apmc', name: 'Vashi APMC', lat: 19.0662, lng: 73.0021, prices: [24, 30, 36], hours: [5, 12], commissionPct: 6, handlingINRPerKg: 1.5 },
  { code: 'ahmednagar-mandi', name: 'Ahmednagar Mandi', lat: 19.0948, lng: 74.748, prices: [14, 17, 20], hours: [6, 13], commissionPct: 5, handlingINRPerKg: 1 },
  { code: 'lasalgaon-mandi', name: 'Lasalgaon Mandi', lat: 20.1417, lng: 74.2389, prices: [20, 26, 31], hours: [6, 15], commissionPct: 5, handlingINRPerKg: 1 },
  { code: 'solapur-mandi', name: 'Solapur Mandi', lat: 17.6599, lng: 75.9064, prices: [12, 15, 19], hours: [6, 12], commissionPct: 5, handlingINRPerKg: 1 },
];

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed test Fresh market evidence in production.');
  }
  await connectDb();
  try {
    const now = new Date();
    const dayStamp = now.toISOString().slice(0, 10);
    for (const market of MARKETS) {
      const doc = await Market.findOneAndUpdate(
        { code: market.code },
        { $set: {
          name: market.name,
          location: { name: market.name, lat: market.lat, lng: market.lng },
          sourceName: SOURCE,
          verifiedAt: now,
          verifiedBy: TEST_VERIFIER,
          active: true,
          costs: {
            commissionPct: market.commissionPct,
            handlingINRPerKg: market.handlingINRPerKg,
            costsVerified: true,
            costsSourceName: SOURCE,
          },
        } },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );

      // One current acceptance per market; older seed rows are replaced.
      await MarketAcceptanceObservation.deleteMany({ marketId: doc._id, cropKey: 'tomato', verifiedBy: TEST_VERIFIER });
      await MarketAcceptanceObservation.create({
        marketId: doc._id,
        cropKey: 'tomato',
        accepted: true,
        receivingHours: `${String(market.hours[0]).padStart(2, '0')}:00–${String(market.hours[1]).padStart(2, '0')}:00 IST`,
        receivingHoursVerified: true,
        receivingOpenHourIST: market.hours[0],
        receivingCloseHourIST: market.hours[1],
        sourceName: SOURCE,
        observedAt: now,
        expiresAt: new Date(now.getTime() + 7 * DAY),
        verifiedBy: TEST_VERIFIER,
      });

      // Price rows are per day, so re-running the seed on a new day adds a fresh observation.
      const sourceRecordId = `seed-tomato-${market.code}-${dayStamp}`;
      const existing = await MarketPriceObservation.exists({ sourceType: 'OPERATOR_INDICATIVE', sourceRecordId });
      if (!existing) {
        const [min, modal, max] = market.prices;
        await MarketPriceObservation.create({
          marketId: doc._id,
          cropKey: 'tomato',
          sourceCommodityName: 'Tomato',
          sourceMinPrice: min,
          sourceModalPrice: modal,
          sourceMaxPrice: max,
          sourcePriceUnit: 'INR_PER_KG',
          sourceType: 'OPERATOR_INDICATIVE',
          sourceName: SOURCE,
          sourceRecordId,
          observedAt: new Date(now.getTime() - 2 * 60 * 60_000),
          fetchedAt: now,
        });
      }
    }
    console.log(`Seeded ${MARKETS.length} test markets with tomato acceptance, operator-indicative prices and verified cost terms.`);
    console.log('All values are labelled as TEST SEED. Use the admin "Fresh markets" tab to add or change evidence.');
  } finally {
    await disconnectDb();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
