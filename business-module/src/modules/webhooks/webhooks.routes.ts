// src/modules/webhooks/webhooks.routes.ts
//
// Webhook routes have a fundamentally different middleware stack from the rest
// of the API:
//
//   1. NO verifyToken — webhooks come from Razorpay/Signzy servers, not users.
//      Authentication is via HMAC signature in the body/header, not JWT.
//
//   2. NO express.json() — we capture rawBody ourselves for signature
//      verification. The rawBodyCapture middleware does the parsing.
//
//   3. NO generalLimiter — webhooks have their own higher-rate limiter.
//      Razorpay can send bursts of 50–100 events per minute during peak load.
//
//   4. NO auditTrail middleware — webhooks write their own log via
//      logWebhook() in the service layer. Double-logging wastes storage.
//
// These routes must be mounted BEFORE the global json() middleware in app.ts.
// If json() runs first, rawBody is not available and signature verification fails.

import { Router } from 'express';
import { webhooksController, rawBodyCapture } from './webhooks.controller';
import { webhookLimiter } from '@/middlewares';

const router = Router();

// ── Health probe — no auth, no rate limit, just a ping ────────────────────────
router.get('/ping', webhooksController.ping);

// ── Razorpay — raw body capture + webhook-specific rate limit ─────────────────
// rawBodyCapture replaces express.json() for this route.
// It reads the stream directly, attaches req.rawBody, then parses JSON into
// req.body as a convenience for downstream code that uses req.body.
router.post(
    '/razorpay',
    rawBodyCapture(),
    webhookLimiter,
    webhooksController.razorpay,
);

// ── eSign callback from Signzy ────────────────────────────────────────────────
// Signzy sends parsed JSON — express.json() already ran globally.
// rawBodyCapture not needed here since we verify via payload fields, not
// a request-level signature header.
router.post(
    '/esign',
    webhookLimiter,
    webhooksController.eSign,
);

// ── Signzy async check callbacks ──────────────────────────────────────────────
router.post(
    '/signzy',
    webhookLimiter,
    webhooksController.signzy,
);

export { router as webhooksRouter };
