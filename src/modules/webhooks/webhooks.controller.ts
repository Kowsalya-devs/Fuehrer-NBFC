// src/modules/webhooks/webhooks.controller.ts
//
// Critical design decisions in this file:
//
// 1. rawBody — Razorpay signature verification requires the exact raw bytes
//    that were sent. Express's json() middleware has already parsed req.body
//    by the time we get here. We capture the raw buffer via a custom middleware
//    (see rawBodyCapture below) and attach it to req.
//
// 2. Respond 200 immediately after signature verification — Razorpay's SLA
//    requires a response within 5 seconds or it marks the delivery as failed
//    and retries. We acknowledge fast then process asynchronously.
//    Exception: we do process synchronously here because Node.js async is fast
//    enough and we want accurate HTTP status for monitoring.
//
// 3. Never return 4xx for business logic errors from Razorpay webhooks —
//    a 4xx response tells Razorpay "bad request, stop retrying". Only return
//    4xx for signature failures. Return 5xx for processing errors so Razorpay
//    retries.

import type { Request, Response, NextFunction } from 'express';
import { webhooksService } from './webhooks.service';
import { HTTP } from '@/config/constants';
import { createModuleLogger } from '@/config/logger';
import type { RazorpayWebhookHeaders } from './webhooks.types';

const log = createModuleLogger('webhooks.controller');

// ─── Raw body capture middleware ───────────────────────────────────────────────
// Must be applied BEFORE express.json() on webhook routes.
// Attaches the raw buffer to req so signature verification can use it.

declare global {
    namespace Express {
        interface Request {
            rawBody?: Buffer;
        }
    }
}

export function rawBodyCapture() {
    return (req: Request, _res: Response, next: NextFunction): void => {
        const chunks: Buffer[] = [];

        req.on('data', (chunk: Buffer) => {
            chunks.push(chunk);
        });

        req.on('end', () => {
            req.rawBody = Buffer.concat(chunks);
            // Also populate req.body so downstream middleware works
            try {
                req.body = JSON.parse(req.rawBody.toString('utf8'));
            } catch {
                req.body = {};
            }
            next();
        });

        req.on('error', (err) => {
            log.error('Raw body capture stream error', { error: err.message });
            next(err);
        });
    };
}

// ─── Controller ───────────────────────────────────────────────────────────────

export const webhooksController = {

    // POST /webhooks/razorpay
    async razorpay(req: Request, res: Response, next: NextFunction) {
        try {
            if (!req.rawBody) {
                log.error('rawBody missing on Razorpay webhook — rawBodyCapture not applied');
                return res.status(HTTP.INTERNAL_ERROR).json({
                    success: false,
                    message: 'Raw body capture configuration error',
                });
            }

            const rawBodyString = req.rawBody.toString('utf8');
            const headers: RazorpayWebhookHeaders = {
                'x-razorpay-signature': req.headers['x-razorpay-signature'] as string | undefined,
                'x-razorpay-event-id': req.headers['x-razorpay-event-id'] as string | undefined,
            };

            await webhooksService.handleRazorpay(rawBodyString, headers, req);

            // 200 with a simple acknowledgement — Razorpay only checks for 2xx
            res.status(HTTP.OK).json({ received: true });

        } catch (err: unknown) {
            const message = (err as Error).message ?? '';

            // Signature failures → 401 (tell Razorpay this was rejected, not a server error)
            if (
                message.includes('signature') ||
                message.includes('PAYMENT_VENDOR_ERROR')
            ) {
                return res.status(HTTP.UNAUTHORIZED).json({
                    success: false,
                    message: 'Signature verification failed',
                });
            }

            // All other errors → 500 so Razorpay retries
            next(err);
        }
    },

    // POST /webhooks/esign
    async eSign(req: Request, res: Response, next: NextFunction) {
        try {
            await webhooksService.handleESign(req.body, req);
            res.status(HTTP.OK).json({ received: true });
        } catch (err: unknown) {
            const message = (err as Error).message ?? '';
            if (message.includes('signature') || message.includes('timestamp')) {
                return res.status(HTTP.UNAUTHORIZED).json({
                    success: false,
                    message: 'Callback verification failed',
                });
            }
            next(err);
        }
    },

    // POST /webhooks/signzy
    async signzy(req: Request, res: Response, next: NextFunction) {
        try {
            await webhooksService.handleSignzy(req.body, req);
            res.status(HTTP.OK).json({ received: true });
        } catch (err: unknown) {
            const message = (err as Error).message ?? '';
            if (message.includes('signature') || message.includes('timestamp')) {
                return res.status(HTTP.UNAUTHORIZED).json({
                    success: false,
                    message: 'Callback verification failed',
                });
            }
            next(err);
        }
    },

    // GET /webhooks/ping — used by Razorpay to confirm endpoint is reachable
    ping(_req: Request, res: Response): void {
        res.status(HTTP.OK).json(webhooksService.ping());
    },
};
