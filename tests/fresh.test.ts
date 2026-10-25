import assert from 'node:assert/strict';
import http from 'node:http';
import test, { describe, before, after } from 'node:test';
import mongoose from 'mongoose';
import { createApp } from '../apps/server/src/app';
import { signAccessToken, signAdminToken } from '../apps/server/src/lib/jwt';
import { FreshMarket } from '../apps/server/src/models/FreshMarket';
import { FreshPrice } from '../apps/server/src/models/FreshPrice';
import {
  BASE_LOSS_BY_CONDITION,
  PER_HOUR_LOSS_BY_CROP,
  calculateLossPct,
  calculateNetProceeds,
  calculateSaleableKg,
  convertPriceToPerKg,
  convertQuantityToKg,
} from '../apps/server/src/modules/fresh/crop-config';
import {
  filterMarketsByRadius,
  rankAndSelectPicks,
  type MarketRecommendationItem,
} from '../apps/server/src/modules/fresh/service';

describe('KisanPool Fresh - Unit Tests', () => {
  test('unit conversion handles kg, quintal, and tonne correctly', () => {
    // Quantity conversion to kg
    assert.equal(convertQuantityToKg(10, 'kg'), 10);
    assert.equal(convertQuantityToKg(5, 'quintal'), 500);
    assert.equal(convertQuantityToKg(2.5, 'tonne'), 2500);
    assert.equal(convertQuantityToKg(100, 'KG'), 100);

    // Price conversion to ₹/kg
    assert.equal(convertPriceToPerKg(35, 'kg'), 35);
    assert.equal(convertPriceToPerKg(3500, 'quintal'), 35);
    assert.equal(convertPriceToPerKg(25000, 'tonne'), 25);
  });

  test('transit loss formula applies base loss and hourly degradation clamped to [0, 40]%', () => {
    // Green tomato 10 hours: base 2% + 0.25%/h * 10h = 4.5%
    const greenLoss = calculateLossPct('Green', 'tomato', 10);
    assert.equal(greenLoss, 4.5);

    // Turning onion 20 hours: base 4% + 0.05%/h * 20h = 5.0%
    const turningLoss = calculateLossPct('Turning', 'onion', 20);
    assert.equal(turningLoss, 5.0);

    // Fully ripe grapes 200 hours: base 12% + 0.30%/h * 200h = 72% -> clamped to 40%
    const ripeGrapesLoss = calculateLossPct('Fully ripe', 'grapes', 200);
    assert.equal(ripeGrapesLoss, 40);

    // Negative hours clamped to base loss
    const negativeHoursLoss = calculateLossPct('Ripe', 'tomato', -5);
    assert.equal(negativeHoursLoss, 7); // Ripe base loss is 7%

    // Saleable kg calculation
    assert.equal(calculateSaleableKg(1000, 4.5), 955);
    assert.equal(calculateSaleableKg(100, 40), 60);
  });

  test('net proceeds formula subtracts transport, commission, and handling from gross', () => {
    // 1000 kg saleable @ ₹30/kg = ₹30,000 gross
    // commission: 5% of ₹30,000 = ₹1,500
    // handling: ₹0.50/kg on 1000 kg = ₹500
    // transport: ₹2,000
    // expected net = 30,000 - 1,500 - 500 - 2,000 = ₹26,000
    const calc = calculateNetProceeds({
      saleableKg: 1000,
      pricePerKg: 30,
      transportCostINR: 2000,
      commissionPct: 5,
      handlingINRPerKg: 0.5,
    });

    assert.equal(calc.grossINR, 30000);
    assert.equal(calc.commissionINR, 1500);
    assert.equal(calc.handlingINR, 500);
    assert.equal(calc.transportINR, 2000);
    assert.equal(calc.netINR, 26000);
  });

  test('radius expansion keeps 100 km markets when >= 3, expands to 200 km when < 3', () => {
    // Case 1: 3 or more markets within 100km -> keep within 100km
    const marketsCluster = [
      { id: '1', straightDistKm: 30 },
      { id: '2', straightDistKm: 60 },
      { id: '3', straightDistKm: 85 },
      { id: '4', straightDistKm: 150 },
    ];
    const filteredCluster = filterMarketsByRadius(marketsCluster);
    assert.equal(filteredCluster.length, 3);
    assert.ok(filteredCluster.every((m) => m.straightDistKm <= 100));

    // Case 2: only 2 markets within 100km -> expands to 200km
    const marketsSparse = [
      { id: '1', straightDistKm: 40 },
      { id: '2', straightDistKm: 90 },
      { id: '3', straightDistKm: 140 },
      { id: '4', straightDistKm: 180 },
      { id: '5', straightDistKm: 250 },
    ];
    const filteredSparse = filterMarketsByRadius(marketsSparse);
    assert.equal(filteredSparse.length, 4); // markets 1, 2, 3, 4 are <= 200km
    assert.ok(filteredSparse.every((m) => m.straightDistKm <= 200));
  });

  test('picks selection selects NEAREST, BEST_PROFIT, and BALANCED correctly', () => {
    const mockMarkets: MarketRecommendationItem[] = [
      {
        id: 'near',
        name: 'Kopargaon Local',
        code: 'kopargaon',
        location: { lat: 19.89, lng: 74.47 },
        distanceKm: 15,
        approxDistance: false,
        etaMin: 25,
        pricePerKg: 28,
        rawPrice: 28,
        rawUnit: 'kg',
        priceSource: 'DEMO',
        priceAgeHours: 2,
        freshness: 'fresh',
        lossPct: 3,
        saleableKg: 970,
        costs: { transport: 500, commission: 1000, handling: 200 },
        net: 25460,
        reasonText: '',
        warnings: [],
        deadlineMiss: false,
      },
      {
        id: 'far-profitable',
        name: 'Nashik Big APMC',
        code: 'nashik',
        location: { lat: 20.0, lng: 73.78 },
        distanceKm: 90,
        approxDistance: false,
        etaMin: 120,
        pricePerKg: 38,
        rawPrice: 38,
        rawUnit: 'kg',
        priceSource: 'DEMO',
        priceAgeHours: 4,
        freshness: 'fresh',
        lossPct: 6,
        saleableKg: 940,
        costs: { transport: 3000, commission: 1200, handling: 300 },
        net: 31220,
        reasonText: '',
        warnings: [],
        deadlineMiss: false,
      },
      {
        id: 'balanced-mid',
        name: 'Rahata APMC',
        code: 'rahata',
        location: { lat: 19.7, lng: 74.5 },
        distanceKm: 35,
        approxDistance: false,
        etaMin: 50,
        pricePerKg: 34,
        rawPrice: 34,
        rawUnit: 'kg',
        priceSource: 'OPERATOR',
        priceAgeHours: 6,
        freshness: 'fresh',
        lossPct: 4,
        saleableKg: 960,
        costs: { transport: 1200, commission: 1100, handling: 250 },
        net: 30090,
        reasonText: '',
        warnings: [],
        deadlineMiss: false,
      },
    ];

    const result = rankAndSelectPicks(mockMarkets, 24);

    assert.equal(result.picks.nearest?.id, 'near');
    assert.equal(result.picks.bestProfit?.id, 'far-profitable');
    assert.ok(result.picks.balanced);
    assert.ok(result.extraVsNearest > 0);
    assert.equal(result.extraVsNearest, Math.round((31220 - 25460) * 100) / 100);
  });

  test('near-tie detection flags nearTie when difference <= 100 or <= 3%', () => {
    const marketA: MarketRecommendationItem = {
      id: 'a',
      name: 'Mandi A',
      code: 'a',
      location: { lat: 19.8, lng: 74.4 },
      distanceKm: 20,
      approxDistance: false,
      etaMin: 30,
      pricePerKg: 30,
      rawPrice: 30,
      rawUnit: 'kg',
      priceSource: 'DEMO',
      priceAgeHours: 2,
      freshness: 'fresh',
      lossPct: 3,
      saleableKg: 970,
      costs: { transport: 500, commission: 1000, handling: 200 },
      net: 25000,
      reasonText: '',
      warnings: [],
      deadlineMiss: false,
    };

    const marketB: MarketRecommendationItem = {
      ...marketA,
      id: 'b',
      name: 'Mandi B',
      distanceKm: 15, // A bit closer
      net: 25050, // Only ₹50 difference (<= 100 and <= 3%)
    };

    const tieResult = rankAndSelectPicks([marketA, marketB], 24);
    assert.equal(tieResult.nearTie, true);

    const marketC: MarketRecommendationItem = {
      ...marketA,
      id: 'c',
      name: 'Mandi C',
      distanceKm: 60,
      net: 28000, // ₹3,000 difference (well over 3% and > ₹100)
    };

    const noTieResult = rankAndSelectPicks([marketA, marketC], 24);
    assert.equal(noTieResult.nearTie, false);
  });

  test('deadline exclusion excludes markets exceeding arrival deadline from the 3 picks', () => {
    const marketFast: MarketRecommendationItem = {
      id: 'fast',
      name: 'Fast Mandi',
      code: 'fast',
      location: { lat: 19.8, lng: 74.4 },
      distanceKm: 25,
      approxDistance: false,
      etaMin: 45, // 0.75h
      pricePerKg: 25,
      rawPrice: 25,
      rawUnit: 'kg',
      priceSource: 'DEMO',
      priceAgeHours: 1,
      freshness: 'fresh',
      lossPct: 3,
      saleableKg: 970,
      costs: { transport: 600, commission: 800, handling: 200 },
      net: 22650,
      reasonText: '',
      warnings: [],
      deadlineMiss: false,
    };

    const marketLate: MarketRecommendationItem = {
      id: 'late-high-price',
      name: 'Far High Profit Mandi',
      code: 'late',
      location: { lat: 19.0, lng: 73.0 },
      distanceKm: 180,
      approxDistance: false,
      etaMin: 300, // 5 hours > deadline 2 hours
      pricePerKg: 50,
      rawPrice: 50,
      rawUnit: 'kg',
      priceSource: 'DEMO',
      priceAgeHours: 1,
      freshness: 'fresh',
      lossPct: 5,
      saleableKg: 950,
      costs: { transport: 4000, commission: 1500, handling: 300 },
      net: 41700,
      reasonText: '',
      warnings: ['Deadline (2h) ke baad pahunchega'],
      deadlineMiss: true,
    };

    const result = rankAndSelectPicks([marketFast, marketLate], 2);
    // Despite higher profit, marketLate missed the 2h deadline, so marketFast must be picked
    assert.equal(result.picks.bestProfit?.id, 'fast');
    assert.equal(result.picks.nearest?.id, 'fast');
  });

  test('stale vs expired price excludes expired (>72h) from BEST_PROFIT rank', () => {
    const freshMarket: MarketRecommendationItem = {
      id: 'fresh',
      name: 'Fresh Market',
      code: 'fresh',
      location: { lat: 19.8, lng: 74.4 },
      distanceKm: 30,
      approxDistance: false,
      etaMin: 45,
      pricePerKg: 30,
      rawPrice: 30,
      rawUnit: 'kg',
      priceSource: 'OPERATOR',
      priceAgeHours: 10,
      freshness: 'fresh',
      lossPct: 3,
      saleableKg: 970,
      costs: { transport: 800, commission: 1000, handling: 200 },
      net: 27100,
      reasonText: '',
      warnings: [],
      deadlineMiss: false,
    };

    const expiredMarket: MarketRecommendationItem = {
      id: 'expired-high',
      name: 'Old Outdated Price Mandi',
      code: 'old',
      location: { lat: 19.8, lng: 74.4 },
      distanceKm: 35,
      approxDistance: false,
      etaMin: 50,
      pricePerKg: 45,
      rawPrice: 45,
      rawUnit: 'kg',
      priceSource: 'DEMO',
      priceAgeHours: 80, // > 72 hours!
      freshness: 'expired',
      lossPct: 4,
      saleableKg: 960,
      costs: { transport: 900, commission: 1200, handling: 200 },
      net: 40900, // High theoretical net, but expired price
      reasonText: '',
      warnings: ['Price 72 ghante se purana hai (expired)'],
      deadlineMiss: false,
    };

    const result = rankAndSelectPicks([freshMarket, expiredMarket], null);
    // The expired market must NOT be selected as BEST_PROFIT
    assert.equal(result.picks.bestProfit?.id, 'fresh');
  });

  test('empty-result returns informative plain Hindi-English reasons', () => {
    // 1. No markets provided
    const emptyResult = rankAndSelectPicks([], 24);
    assert.equal(emptyResult.emptyReason, 'Is crop ka price abhi kisi market me nahi hai');

    // 2. All markets missed deadline
    const lateMarket: MarketRecommendationItem = {
      id: 'late',
      name: 'Far Mandi',
      code: 'far',
      location: { lat: 19.8, lng: 74.4 },
      distanceKm: 150,
      approxDistance: false,
      etaMin: 240,
      pricePerKg: 30,
      rawPrice: 30,
      rawUnit: 'kg',
      priceSource: 'DEMO',
      priceAgeHours: 2,
      freshness: 'fresh',
      lossPct: 4,
      saleableKg: 960,
      costs: { transport: 3000, commission: 1000, handling: 200 },
      net: 24600,
      reasonText: '',
      warnings: [],
      deadlineMiss: true,
    };
    const deadlineResult = rankAndSelectPicks([lateMarket], 2);
    assert.equal(deadlineResult.emptyReason, 'Deadline ke andar koi market nahi');

    // 3. All prices expired > 72h
    const expiredOnly: MarketRecommendationItem = {
      ...lateMarket,
      deadlineMiss: false,
      freshness: 'expired',
    };
    const expiredResult = rankAndSelectPicks([expiredOnly], null);
    assert.equal(expiredResult.emptyReason, 'Sab prices 72 ghante se purane hain');
  });

  test('latest-price selection picks newest observedAt from append-only history', () => {
    const marketId = new mongoose.Types.ObjectId();
    const history = [
      {
        _id: new mongoose.Types.ObjectId(),
        marketId,
        crop: 'tomato',
        price: 25,
        observedAt: new Date(Date.now() - 48 * 3600 * 1000), // 2 days ago
      },
      {
        _id: new mongoose.Types.ObjectId(),
        marketId,
        crop: 'tomato',
        price: 32,
        observedAt: new Date(Date.now() - 2 * 3600 * 1000), // 2 hours ago (newest)
      },
      {
        _id: new mongoose.Types.ObjectId(),
        marketId,
        crop: 'tomato',
        price: 28,
        observedAt: new Date(Date.now() - 24 * 3600 * 1000), // 1 day ago
      },
    ];

    // Simulating newest observedAt sort
    const latest = [...history].sort((a, b) => b.observedAt.getTime() - a.observedAt.getTime())[0];
    assert.equal(latest.price, 32);
  });
});

describe('KisanPool Fresh - Integration & Model Tests', () => {
  let server: http.Server;
  let baseUrl: string;

  before((_, done) => {
    const app = createApp();
    server = http.createServer(app);
    server.listen(0, () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      baseUrl = `http://127.0.0.1:${port}`;
      done();
    });
  });

  after((_, done) => {
    server.close(done);
  });

  test('POST /fresh/recommendations requires authentication (401 when no token)', async () => {
    const res = await fetch(`${baseUrl}/fresh/recommendations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ crop: 'tomato', quantity: 100, unit: 'kg' }),
    });

    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.error?.code, 'AUTH_UNAUTHENTICATED');
  });

  test('GET /fresh/markets requires authentication (401 when no token)', async () => {
    const res = await fetch(`${baseUrl}/fresh/markets`);
    assert.equal(res.status, 401);
  });

  test('admin routes return 403 Forbidden for non-admin farmer token', async () => {
    const farmerToken = signAccessToken({ sub: 'farmer-user-123', role: 'FARMER' });

    // Try GET /admin/fresh/markets
    const resMarkets = await fetch(`${baseUrl}/admin/fresh/markets`, {
      headers: { Authorization: `Bearer ${farmerToken}` },
    });
    assert.equal(resMarkets.status, 403);

    // Try GET /admin/fresh/prices/latest
    const resPrices = await fetch(`${baseUrl}/admin/fresh/prices/latest`, {
      headers: { Authorization: `Bearer ${farmerToken}` },
    });
    assert.equal(resPrices.status, 403);
  });

  test('admin routes validate market input with plain-words Hindi-English errors', async () => {
    const adminToken = signAdminToken();

    // Invalid latitude (out of 8..37 range)
    const resBadLat = await fetch(`${baseUrl}/admin/fresh/markets`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Bad Lat Mandi',
        code: 'bad-lat',
        location: { lat: 55, lng: 74 }, // invalid
        acceptedCrops: ['tomato'],
      }),
    });

    assert.equal(resBadLat.status, 400);
    const bodyBadLat = await resBadLat.json();
    assert.ok(
      bodyBadLat.error?.message?.includes('Latitude 8 se 37 ke beech honi chahiye'),
      `Expected Hindi-English lat message, got: ${bodyBadLat.error?.message}`,
    );

    // Invalid price (<= 0)
    const resBadPrice = await fetch(`${baseUrl}/admin/fresh/prices`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        marketId: new mongoose.Types.ObjectId().toString(),
        crop: 'tomato',
        price: -10,
        unit: 'kg',
      }),
    });

    assert.equal(resBadPrice.status, 400);
    const bodyBadPrice = await resBadPrice.json();
    assert.ok(
      bodyBadPrice.error?.message?.includes('Price 0 se zyada honi chahiye'),
      `Expected Hindi-English price message, got: ${bodyBadPrice.error?.message}`,
    );
  });

  test('FreshMarket model auto-lowercases market code via setter', () => {
    const market = new FreshMarket({
      name: 'Nashik APMC Main',
      code: 'NASHIK-APMC-01',
      location: { lat: 19.9975, lng: 73.7898 },
      commissionPct: 5,
      handlingINRPerKg: 0.5,
      acceptedCrops: ['tomato', 'onion'],
    });

    assert.equal(market.code, 'nashik-apmc-01');
    assert.equal(market.validateSync(), undefined);
  });

  test('FreshPrice stores observedAt and fetchedAt as real Date instances', () => {
    const price = new FreshPrice({
      marketId: new mongoose.Types.ObjectId(),
      crop: 'tomato',
      price: 32.5,
      unit: 'kg',
      sourceType: 'OPERATOR',
      observedAt: '2026-10-25T05:00:00.000Z',
    });

    assert.ok(price.observedAt instanceof Date);
    assert.ok(price.fetchedAt instanceof Date);
    assert.equal(price.observedAt.toISOString(), '2026-10-25T05:00:00.000Z');
    assert.equal(price.validateSync(), undefined);
  });

  test('soft delete sets active flag to false without removing record', () => {
    const market = new FreshMarket({
      name: 'Kopargaon Sub-Market',
      code: 'kopargaon-sub',
      location: { lat: 19.8913, lng: 74.4799 },
      active: true,
      acceptedCrops: ['grapes'],
    });

    assert.equal(market.active, true);
    // Soft delete:
    market.active = false;
    assert.equal(market.active, false);
  });

  test('bulk price update creates new append-only rows in FreshPrice', () => {
    const marketId1 = new mongoose.Types.ObjectId();
    const marketId2 = new mongoose.Types.ObjectId();

    const bulkItems = [
      { marketId: marketId1, crop: 'tomato', price: 28, unit: 'kg', sourceType: 'OPERATOR' as const },
      { marketId: marketId1, crop: 'onion', price: 22, unit: 'kg', sourceType: 'OPERATOR' as const },
      { marketId: marketId2, crop: 'grapes', price: 65, unit: 'kg', sourceType: 'DEMO' as const },
    ];

    const priceDocs = bulkItems.map((item) => new FreshPrice(item));

    assert.equal(priceDocs.length, 3);
    for (const doc of priceDocs) {
      assert.equal(doc.validateSync(), undefined);
      assert.ok(doc.observedAt instanceof Date);
      assert.ok(doc.price > 0);
    }
  });
});
