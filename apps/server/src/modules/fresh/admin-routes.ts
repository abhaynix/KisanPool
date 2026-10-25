import { Router } from 'express';
import { ApiError, ok } from '../../lib/envelope';
import { asyncHandler } from '../../middleware/error';
import { requireAdmin, type AuthedRequest } from '../../middleware/auth';
import { FreshMarket, ACCEPTED_CROPS, type AcceptedCrop } from '../../models/FreshMarket';
import { FreshPrice, PRICE_UNITS, SOURCE_TYPES } from '../../models/FreshPrice';

export const adminFreshRouter = Router();

adminFreshRouter.use(requireAdmin);

function validateMarketInput(body: any, isUpdate = false) {
  if (!isUpdate || body.name !== undefined) {
    if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
      throw new ApiError('VALIDATION_ERROR', 'Market ka naam zaroori hai');
    }
  }
  if (!isUpdate || body.code !== undefined) {
    if (!body.code || typeof body.code !== 'string' || !body.code.trim()) {
      throw new ApiError('VALIDATION_ERROR', 'Market ka code zaroori hai');
    }
  }
  if (body.location) {
    const { lat, lng } = body.location;
    if (lat === undefined || typeof lat !== 'number' || Number.isNaN(lat) || lat < 8 || lat > 37) {
      throw new ApiError('VALIDATION_ERROR', 'Latitude 8 se 37 ke beech honi chahiye');
    }
    if (lng === undefined || typeof lng !== 'number' || Number.isNaN(lng) || lng < 68 || lng > 98) {
      throw new ApiError('VALIDATION_ERROR', 'Longitude 68 se 98 ke beech honi chahiye');
    }
  } else if (!isUpdate) {
    throw new ApiError('VALIDATION_ERROR', 'Latitude 8 se 37 ke beech honi chahiye');
  }

  if (body.commissionPct !== undefined && body.commissionPct !== null) {
    const c = Number(body.commissionPct);
    if (Number.isNaN(c) || c < 0 || c > 30) {
      throw new ApiError('VALIDATION_ERROR', 'Commission 0 se 30% ke beech honi chahiye');
    }
  }

  if (body.handlingINRPerKg !== undefined && body.handlingINRPerKg !== null) {
    const h = Number(body.handlingINRPerKg);
    if (Number.isNaN(h) || h < 0) {
      throw new ApiError('VALIDATION_ERROR', 'Handling charge 0 ya usse zyada hona chahiye');
    }
  }

  if (body.acceptedCrops !== undefined) {
    if (!Array.isArray(body.acceptedCrops) || body.acceptedCrops.length === 0) {
      throw new ApiError('VALIDATION_ERROR', 'Valid crop select karein (tomato, onion, grapes)');
    }
    for (const crop of body.acceptedCrops) {
      if (!ACCEPTED_CROPS.includes(crop)) {
        throw new ApiError('VALIDATION_ERROR', 'Valid crop select karein (tomato, onion, grapes)');
      }
    }
  }
}

// ------------------- MARKETS -------------------

// GET /admin/fresh/markets - list all markets
adminFreshRouter.get(
  '/markets',
  asyncHandler(async (_req, res) => {
    const markets = await FreshMarket.find().sort({ name: 1 }).lean();
    ok(res, markets);
  }),
);

// POST /admin/fresh/markets - create market
adminFreshRouter.post(
  '/markets',
  asyncHandler<AuthedRequest>(async (req, res) => {
    validateMarketInput(req.body);

    const normCode = String(req.body.code).trim().toLowerCase();
    const existing = await FreshMarket.findOne({ code: normCode });
    if (existing) {
      throw new ApiError('VALIDATION_ERROR', 'Is code ka market pehle se hai');
    }

    try {
      const market = new FreshMarket({
        name: req.body.name,
        code: normCode,
        location: {
          lat: Number(req.body.location.lat),
          lng: Number(req.body.location.lng),
        },
        active: req.body.active !== undefined ? Boolean(req.body.active) : true,
        commissionPct: req.body.commissionPct !== undefined ? Number(req.body.commissionPct) : 0,
        handlingINRPerKg: req.body.handlingINRPerKg !== undefined ? Number(req.body.handlingINRPerKg) : 0,
        acceptedCrops: req.body.acceptedCrops ?? ['tomato', 'onion', 'grapes'],
      });
      await market.save();
      ok(res, market.toObject(), 201);
    } catch (err: any) {
      if (err?.code === 11000) {
        throw new ApiError('VALIDATION_ERROR', 'Is code ka market pehle se hai');
      }
      if (err?.name === 'ValidationError') {
        const firstMsg = Object.values(err.errors || {})[0] as any;
        throw new ApiError('VALIDATION_ERROR', firstMsg?.message || 'Validation error');
      }
      throw err;
    }
  }),
);

// PUT /admin/fresh/markets/:id - update market
adminFreshRouter.put(
  '/markets/:id',
  asyncHandler<AuthedRequest>(async (req, res) => {
    validateMarketInput(req.body, true);

    const market = await FreshMarket.findById(req.params.id);
    if (!market) {
      throw new ApiError('RESOURCE_NOT_FOUND', 'Market nahi mila');
    }

    if (req.body.code) {
      const normCode = String(req.body.code).trim().toLowerCase();
      if (normCode !== market.code) {
        const existing = await FreshMarket.findOne({ code: normCode, _id: { $ne: market._id } });
        if (existing) {
          throw new ApiError('VALIDATION_ERROR', 'Is code ka market pehle se hai');
        }
        market.code = normCode;
      }
    }

    if (req.body.name !== undefined) market.name = req.body.name.trim();
    if (req.body.location) {
      market.location = {
        lat: Number(req.body.location.lat),
        lng: Number(req.body.location.lng),
      };
    }
    if (req.body.active !== undefined) market.active = Boolean(req.body.active);
    if (req.body.commissionPct !== undefined) market.commissionPct = Number(req.body.commissionPct);
    if (req.body.handlingINRPerKg !== undefined) market.handlingINRPerKg = Number(req.body.handlingINRPerKg);
    if (req.body.acceptedCrops !== undefined) market.acceptedCrops = req.body.acceptedCrops;

    try {
      await market.save();
      ok(res, market.toObject());
    } catch (err: any) {
      if (err?.code === 11000) {
        throw new ApiError('VALIDATION_ERROR', 'Is code ka market pehle se hai');
      }
      if (err?.name === 'ValidationError') {
        const firstMsg = Object.values(err.errors || {})[0] as any;
        throw new ApiError('VALIDATION_ERROR', firstMsg?.message || 'Validation error');
      }
      throw err;
    }
  }),
);

// DELETE /admin/fresh/markets/:id - soft delete (active=false)
adminFreshRouter.delete(
  '/markets/:id',
  asyncHandler(async (req, res) => {
    const market = await FreshMarket.findById(req.params.id);
    if (!market) {
      throw new ApiError('RESOURCE_NOT_FOUND', 'Market nahi mila');
    }
    market.active = false;
    await market.save();
    ok(res, { success: true, message: 'Market soft deleted', market: market.toObject() });
  }),
);

// ------------------- PRICES -------------------

function validatePriceInput(body: any) {
  if (!body.marketId) {
    throw new ApiError('VALIDATION_ERROR', 'Market zaroori hai');
  }
  if (!body.crop || !ACCEPTED_CROPS.includes(body.crop)) {
    throw new ApiError('VALIDATION_ERROR', 'Valid crop select karein (tomato, onion, grapes)');
  }
  const price = Number(body.price);
  if (body.price === undefined || body.price === null || Number.isNaN(price) || price <= 0) {
    throw new ApiError('VALIDATION_ERROR', 'Price 0 se zyada honi chahiye');
  }
  if (body.unit && !PRICE_UNITS.includes(body.unit)) {
    throw new ApiError('VALIDATION_ERROR', 'Unit kg, quintal, ya tonne hona chahiye');
  }
  if (body.sourceType && !SOURCE_TYPES.includes(body.sourceType)) {
    throw new ApiError('VALIDATION_ERROR', 'Source type OFFICIAL, OPERATOR, ya DEMO hona chahiye');
  }
}

function calculateFreshness(observedAtDate: Date) {
  const now = Date.now();
  const ageMs = now - observedAtDate.getTime();
  const ageHours = Math.max(0, Math.round((ageMs / (3600 * 1000)) * 10) / 10);
  let freshness: 'fresh' | 'stale' | 'expired';
  if (ageHours <= 24) {
    freshness = 'fresh';
  } else if (ageHours <= 72) {
    freshness = 'stale';
  } else {
    freshness = 'expired';
  }
  return { ageHours, freshness };
}

// GET /admin/fresh/prices/latest - latest price per market × crop
adminFreshRouter.get(
  '/prices/latest',
  asyncHandler(async (_req, res) => {
    const markets = await FreshMarket.find().sort({ name: 1 }).lean();
    const marketMap = new Map(markets.map((m) => [String(m._id), m]));

    // Append-only history: find the latest price per market + crop
    const latestAgg = await FreshPrice.aggregate([
      { $sort: { observedAt: -1 } },
      {
        $group: {
          _id: { marketId: '$marketId', crop: '$crop' },
          doc: { $first: '$$ROOT' },
        },
      },
    ]);

    const results = latestAgg.map((entry) => {
      const priceDoc = entry.doc;
      const market = marketMap.get(String(priceDoc.marketId));
      const observedAt = new Date(priceDoc.observedAt);
      const { ageHours, freshness } = calculateFreshness(observedAt);

      return {
        _id: String(priceDoc._id),
        marketId: String(priceDoc.marketId),
        marketName: market?.name ?? 'Unknown',
        marketCode: market?.code ?? '',
        active: market?.active ?? true,
        crop: priceDoc.crop,
        price: priceDoc.price,
        unit: priceDoc.unit,
        sourceType: priceDoc.sourceType,
        observedAt: observedAt.toISOString(),
        fetchedAt: new Date(priceDoc.fetchedAt).toISOString(),
        createdBy: priceDoc.createdBy,
        ageHours,
        freshness,
      };
    });

    ok(res, results);
  }),
);

// POST /admin/fresh/prices - create single price
adminFreshRouter.post(
  '/prices',
  asyncHandler<AuthedRequest>(async (req, res) => {
    validatePriceInput(req.body);

    const market = await FreshMarket.findById(req.body.marketId);
    if (!market) {
      throw new ApiError('RESOURCE_NOT_FOUND', 'Market nahi mila');
    }

    const observedAt = req.body.observedAt ? new Date(req.body.observedAt) : new Date();
    const price = new FreshPrice({
      marketId: market._id,
      crop: req.body.crop,
      price: Number(req.body.price),
      unit: req.body.unit ?? 'quintal',
      sourceType: req.body.sourceType ?? 'OPERATOR',
      observedAt,
      fetchedAt: new Date(),
      createdBy: req.userId || 'admin',
    });

    await price.save();
    const { ageHours, freshness } = calculateFreshness(observedAt);

    ok(
      res,
      {
        ...price.toObject(),
        ageHours,
        freshness,
      },
      201,
    );
  }),
);

// POST /admin/fresh/prices/bulk - bulk update prices
adminFreshRouter.post(
  '/prices/bulk',
  asyncHandler<AuthedRequest>(async (req, res) => {
    const items = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      throw new ApiError('VALIDATION_ERROR', 'Prices array zaroori hai');
    }

    for (const item of items) {
      validatePriceInput(item);
    }

    const saved = [];
    const now = new Date();
    for (const item of items) {
      const observedAt = item.observedAt ? new Date(item.observedAt) : now;
      const price = new FreshPrice({
        marketId: item.marketId,
        crop: item.crop,
        price: Number(item.price),
        unit: item.unit ?? 'quintal',
        sourceType: item.sourceType ?? 'OPERATOR',
        observedAt,
        fetchedAt: now,
        createdBy: req.userId || 'admin',
      });
      await price.save();
      const { ageHours, freshness } = calculateFreshness(observedAt);
      saved.push({
        ...price.toObject(),
        ageHours,
        freshness,
      });
    }

    ok(res, saved, 201);
  }),
);

// GET /admin/fresh/prices/history - history per market+crop
adminFreshRouter.get(
  '/prices/history',
  asyncHandler(async (req, res) => {
    const { marketId, crop } = req.query;
    if (!marketId || typeof marketId !== 'string') {
      throw new ApiError('VALIDATION_ERROR', 'Market ID zaroori hai');
    }
    const filter: Record<string, any> = { marketId };
    if (crop && typeof crop === 'string') {
      filter.crop = crop;
    }

    const history = await FreshPrice.find(filter)
      .sort({ observedAt: -1 })
      .limit(50)
      .lean();

    const formatted = history.map((item) => {
      const observedAt = new Date(item.observedAt);
      const { ageHours, freshness } = calculateFreshness(observedAt);
      return {
        ...item,
        observedAt: observedAt.toISOString(),
        fetchedAt: new Date(item.fetchedAt).toISOString(),
        ageHours,
        freshness,
      };
    });

    ok(res, formatted);
  }),
);
