import { Router } from 'express';
import { ok } from '../../lib/envelope';
import { asyncHandler } from '../../middleware/error';
import { requireAuth, type AuthedRequest } from '../../middleware/auth';
import { getActiveFreshMarketsWithDemand, getFreshRecommendations } from './service';

export const freshRouter = Router();

// Farmer API: GET /fresh/markets (List all active markets with demands & latest rates)
freshRouter.get(
  '/markets',
  requireAuth,
  asyncHandler<AuthedRequest>(async (req, res) => {
    const lat = req.query.lat ? Number(req.query.lat) : undefined;
    const lng = req.query.lng ? Number(req.query.lng) : undefined;
    const markets = await getActiveFreshMarketsWithDemand({ lat, lng });
    ok(res, markets);
  }),
);

// Farmer API: POST /fresh/recommendations
// Auth required, READ-ONLY, no side effects
freshRouter.post(
  '/recommendations',
  requireAuth,
  asyncHandler<AuthedRequest>(async (req, res) => {
    const result = await getFreshRecommendations(req.userId, req.body);
    ok(res, result);
  }),
);
