import { Router } from 'express';
import { z } from 'zod';
import { getCropProfile } from '../freshness/profiles';
import { ApiError, ok } from '../../lib/envelope';
import { asyncHandler } from '../../middleware/error';
import { requireAuth, requireRole, type AuthedRequest } from '../../middleware/auth';
import { requireWritable } from '../resilience/guard';
import { createFreshRecommendation, getFreshCropCatalogue, getFreshRecommendation, selectFreshRecommendation, recordFreshDeliveryOutcome, createFreshBuyerOffer, listFreshBuyerOffers } from './service';

export const freshRouter = Router();

const pointSchema = z.object({
  name: z.string().trim().min(1).max(120),
  lat: z.number().finite().min(-90).max(90),
  lng: z.number().finite().min(-180).max(180),
});

export const freshRecommendationRequestSchema = z.object({
  cropKey: z.string().trim().toLowerCase().refine((value) => Boolean(getCropProfile(value)), {
    message: 'Only supported crops can be evaluated.',
  }),
  quantityKg: z.number().finite().positive().max(100_000),
  harvestedAt: z.coerce.date(),
  ripenessStage: z.enum(['GREEN', 'TURNING', 'PINK', 'RED', 'UNKNOWN']),
  storageCondition: z.enum(['SHADE', 'AMBIENT', 'COOL_STORAGE', 'UNKNOWN']),
  storageTemperatureC: z.number().finite().min(-30).max(80).optional(),
  handlingCondition: z.enum(['GOOD', 'BRUISED', 'ROUGH_HANDLING', 'UNKNOWN']).default('UNKNOWN'),
  pickup: pointSchema,
  earliestPickupAt: z.coerce.date(),
  desiredArrivalBy: z.coerce.date().optional(),
  searchRadiusKm: z.number().finite().min(1).max(200).default(100),
}).superRefine((input, ctx) => {
  const now = Date.now();
  if (input.harvestedAt.getTime() > now) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['harvestedAt'], message: 'Harvest time cannot be in the future.' });
  }
  if (input.earliestPickupAt.getTime() < now) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['earliestPickupAt'], message: 'Pickup time must be now or later.' });
  }
  if (input.desiredArrivalBy && input.desiredArrivalBy.getTime() <= input.earliestPickupAt.getTime()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['desiredArrivalBy'], message: 'Arrival deadline must be after pickup time.' });
  }
});

freshRouter.get(
  '/crops',
  requireAuth,
  requireRole('FARMER'),
  asyncHandler<AuthedRequest>(async (_req, res) => {
    ok(res, getFreshCropCatalogue());
  }),
);

freshRouter.post(
  '/recommendations/:id/select',
  requireAuth,
  requireRole('FARMER'),
  requireWritable,
  asyncHandler<AuthedRequest>(async (req, res) => {
    const body = z.object({
      recommendationType: z.enum(['bestBalanced', 'highestNetProceeds', 'fastestFeasible', 'closestSuitable']),
      confirmedFarmerPayableINR: z.number().finite().min(0).optional(),
    }).parse(req.body);
    ok(res, await selectFreshRecommendation(req.userId, req.params.id, body));
  }),
);

freshRouter.post(
  '/outcomes',
  requireAuth,
  requireRole('FARMER'),
  requireWritable,
  asyncHandler<AuthedRequest>(async (req, res) => {
    const body = z.object({
      requestId: z.string().min(1),
      actualPickupAt: z.coerce.date(),
      actualDeliveredAt: z.coerce.date(),
      actualSoldPriceINRPerKg: z.number().finite().min(0).optional(),
      acceptedKg: z.number().finite().min(0),
      rejectedKg: z.number().finite().min(0),
      additionalCostsINR: z.number().finite().min(0).optional(),
      qualityOutcome: z.enum(['ACCEPTED', 'PARTIAL_REJECTION', 'REJECTED', 'NOT_REPORTED']),
    }).parse(req.body);
    ok(res, await recordFreshDeliveryOutcome(req.userId, body), 201);
  }),
);

freshRouter.post(
  '/recommendations/:id/buyer-offers',
  requireAuth,
  requireRole('FARMER'),
  requireWritable,
  asyncHandler<AuthedRequest>(async (req, res) => {
    const body = z.object({
      marketName: z.string().trim().min(1).max(120),
      buyerLabel: z.string().trim().max(120).optional(),
      priceINRPerKg: z.number().finite().min(0),
      quantityKg: z.number().finite().positive().optional(),
      validUntil: z.coerce.date(),
    }).parse(req.body);
    ok(res, await createFreshBuyerOffer(req.userId, { ...body, recommendationId: req.params.id }), 201);
  }),
);

freshRouter.get(
  '/recommendations/:id/buyer-offers',
  requireAuth,
  requireRole('FARMER'),
  asyncHandler<AuthedRequest>(async (req, res) => {
    ok(res, await listFreshBuyerOffers(req.userId, req.params.id));
  }),
);

freshRouter.post(
  '/recommendations',
  requireAuth,
  requireRole('FARMER'),
  requireWritable,
  asyncHandler<AuthedRequest>(async (req, res) => {
    const input = freshRecommendationRequestSchema.parse(req.body);
    const result = await createFreshRecommendation(req.userId, input);
    ok(res, result, 201);
  }),
);

freshRouter.get(
  '/recommendations/:id',
  requireAuth,
  requireRole('FARMER'),
  asyncHandler<AuthedRequest>(async (req, res) => {
    const snapshot = await getFreshRecommendation(req.userId, req.params.id);
    if (!snapshot) throw new ApiError('RESOURCE_NOT_FOUND', 'That recommendation was not found.');
    ok(res, snapshot);
  }),
);
