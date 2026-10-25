/**
 * Seed script for Fresh demo data.
 *
 * Populates ~6 markets around Kopargaon/Ahilyanagar/Nashik/Pune with demo prices
 * for tomato, onion, and grapes using Mongoose models.
 *
 * Idempotent: can be run repeatedly without duplicating markets or throwing errors.
 */
import { connectDb, disconnectDb } from './db';
import { FreshMarket } from './models/FreshMarket';
import { FreshPrice } from './models/FreshPrice';

interface DemoMarketDef {
  name: string;
  code: string;
  location: { lat: number; lng: number };
  commissionPct: number;
  handlingINRPerKg: number;
  acceptedCrops: ('tomato' | 'onion' | 'grapes')[];
  prices: {
    crop: 'tomato' | 'onion' | 'grapes';
    price: number;
    unit: 'kg' | 'quintal';
  }[];
}

const DEMO_MARKETS: DemoMarketDef[] = [
  {
    name: 'Kopargaon APMC',
    code: 'kopargaon-apmc',
    location: { lat: 19.8913, lng: 74.4799 },
    commissionPct: 5,
    handlingINRPerKg: 0.5,
    acceptedCrops: ['tomato', 'onion', 'grapes'],
    prices: [
      { crop: 'tomato', price: 2200, unit: 'quintal' }, // ₹22/kg
      { crop: 'onion', price: 1800, unit: 'quintal' }, // ₹18/kg
      { crop: 'grapes', price: 4500, unit: 'quintal' }, // ₹45/kg
    ],
  },
  {
    name: 'Rahata Mandi',
    code: 'rahata-mandi',
    location: { lat: 19.7121, lng: 74.4925 },
    commissionPct: 6,
    handlingINRPerKg: 0.6,
    acceptedCrops: ['tomato', 'onion', 'grapes'],
    prices: [
      { crop: 'tomato', price: 2350, unit: 'quintal' }, // ₹23.5/kg
      { crop: 'onion', price: 1750, unit: 'quintal' }, // ₹17.5/kg
      { crop: 'grapes', price: 4800, unit: 'quintal' }, // ₹48/kg
    ],
  },
  {
    name: 'Shrirampur APMC',
    code: 'shrirampur-apmc',
    location: { lat: 19.6197, lng: 74.6565 },
    commissionPct: 5,
    handlingINRPerKg: 0.5,
    acceptedCrops: ['tomato', 'onion', 'grapes'],
    prices: [
      { crop: 'tomato', price: 2150, unit: 'quintal' }, // ₹21.5/kg
      { crop: 'onion', price: 1900, unit: 'quintal' }, // ₹19/kg
      { crop: 'grapes', price: 4600, unit: 'quintal' }, // ₹46/kg
    ],
  },
  {
    name: 'Nashik Dindori Mandi',
    code: 'nashik-dindori',
    location: { lat: 20.2018, lng: 73.8344 },
    commissionPct: 7,
    handlingINRPerKg: 0.8,
    acceptedCrops: ['tomato', 'onion', 'grapes'],
    prices: [
      { crop: 'tomato', price: 2600, unit: 'quintal' }, // ₹26/kg
      { crop: 'onion', price: 2100, unit: 'quintal' }, // ₹21/kg
      { crop: 'grapes', price: 5500, unit: 'quintal' }, // ₹55/kg
    ],
  },
  {
    name: 'Ahilyanagar APMC',
    code: 'ahilyanagar-apmc',
    location: { lat: 19.0952, lng: 74.7496 },
    commissionPct: 6,
    handlingINRPerKg: 0.7,
    acceptedCrops: ['tomato', 'onion', 'grapes'],
    prices: [
      { crop: 'tomato', price: 2400, unit: 'quintal' }, // ₹24/kg
      { crop: 'onion', price: 2000, unit: 'quintal' }, // ₹20/kg
      { crop: 'grapes', price: 5000, unit: 'quintal' }, // ₹50/kg
    ],
  },
  {
    name: 'Pune Gultekdi Market Yard',
    code: 'pune-market-yard',
    location: { lat: 18.4967, lng: 73.8687 },
    commissionPct: 8,
    handlingINRPerKg: 1.0,
    acceptedCrops: ['tomato', 'onion', 'grapes'],
    prices: [
      { crop: 'tomato', price: 3100, unit: 'quintal' }, // ₹31/kg (higher city price)
      { crop: 'onion', price: 2500, unit: 'quintal' }, // ₹25/kg
      { crop: 'grapes', price: 6800, unit: 'quintal' }, // ₹68/kg
    ],
  },
];

export async function seedFreshDemo(): Promise<{ marketCount: number; priceCount: number }> {
  let marketCount = 0;
  let priceCount = 0;
  const now = new Date();

  for (const def of DEMO_MARKETS) {
    let market = await FreshMarket.findOne({ code: def.code });
    if (!market) {
      market = new FreshMarket({
        name: def.name,
        code: def.code,
        location: def.location,
        active: true,
        commissionPct: def.commissionPct,
        handlingINRPerKg: def.handlingINRPerKg,
        acceptedCrops: def.acceptedCrops,
      });
      await market.save();
    } else {
      market.name = def.name;
      market.location = def.location;
      market.active = true;
      market.commissionPct = def.commissionPct;
      market.handlingINRPerKg = def.handlingINRPerKg;
      market.acceptedCrops = def.acceptedCrops;
      await market.save();
    }
    marketCount++;

    for (const p of def.prices) {
      const freshPrice = new FreshPrice({
        marketId: market._id,
        crop: p.crop,
        price: p.price,
        unit: p.unit,
        sourceType: 'DEMO',
        observedAt: now,
        fetchedAt: now,
        createdBy: 'seed:fresh-demo',
      });
      await freshPrice.save();
      priceCount++;
    }
  }

  return { marketCount, priceCount };
}

async function main() {
  await connectDb();
  console.log('Seeding Fresh demo markets and prices...');
  const { marketCount, priceCount } = await seedFreshDemo();
  console.log(`Successfully seeded ${marketCount} Fresh markets and ${priceCount} demo prices.`);
  await disconnectDb();
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Failed to seed Fresh demo:', err);
    process.exit(1);
  });
}
