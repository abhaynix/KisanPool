import { Router } from 'express';
import { ok } from '../../lib/envelope';
import { asyncHandler } from '../../middleware/error';
import { requireAuth, type AuthedRequest } from '../../middleware/auth';
import { getFreshRecommendations } from './service';

export const freshRouter = Router();

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
