// src/modules/webhooks/webhooks.service.ts
import crypto from 'crypto';
import type { Request } from 'express';
import { paymentsService } from '@/modules/payments';
import { kycService } from '@/modules/kyc';
import { disbursementService } from '@/modules/disbursement';
import { getPaymentProvider } from '@/providers';
import { getRedisClient, RedisKeys, RedisTTL } from '@/config/redis';
import { getSecrets } from '@/config/secrets';
import { prisma } from '@/config/database';
import { createModuleLogger } from '@/config/logger';
import { PAYMENT_ERRORS } from '@/errors';
import type {
    WebhookSource,
    WebhookProcessingStatus,
    WebhookLogRecord,
    RazorpayWebhookHeaders,
    ESignCallbackPayload,
    BureauCallbackPayload,
    SignzyCallbackPayload,
} from './webhooks.types';
import type { RazorpayWebhookPayload } from '@/modules/payments';

const log = createModuleLogger('webhooks.service');

// ─── Signature verification ────────────────────────────────────────────────────
// Each vendor uses a different HMAC construction. All verification is
// constant-time to prevent timing oracle attacks.

function hmacSha256(secret: string, data: string): string {
    return crypto
        .createHmac('sha256', secret)
        .update(data)
        .digest('hex');
}

function constantTimeEqual(a: string, b: string): boolean {
    try {
        // Buffer.from pads to same length if needed — timingSafeEqual requires equal
        const bufA = Buffer.from(a, 'hex');
        const bufB = Buffer.from(b, 'hex');
        if (bufA.length !== bufB.length) return false;
        return crypto.timingSafeEqual(bufA, bufB);
    } catch {
        return false;
    }
}

// ─── Per-source signature verifiers ───────────────────────────────────────────

export function verifyRazorpaySignature(
    rawBody: string,
    signature: string,
    secret: string,
): boolean {
    // Razorpay: HMAC-SHA256(rawBody, webhookSecret)
    const expected = hmacSha256(secret, rawBody);
    return constantTimeEqual(expected, signature);
}

export function verifySignzySignature(
    payload: SignzyCallbackPayload,
    secret: string,
): boolean {
    // Signzy: HMAC-SHA256(requestId + checkType + status + timestamp, apiKey)
    const data = `${payload.requestId}${payload.checkType}${payload.status}${payload.timestamp}`;
    const expected = hmacSha256(secret, data);
    return constantTimeEqual(expected, payload.signature);
}

export function verifyESignSignature(
    payload: ESignCallbackPayload,
    secret: string,
): boolean {
    // eSign: HMAC-SHA256(requestId + status + timestamp, apiKey)
    const data = `${payload.requestId}${payload.status}${payload.timestamp}`;
    const expected = hmacSha256(secret, data);
    return constantTimeEqual(expected, payload.signature);
}

// ─── Idempotency guard ─────────────────────────────────────────────────────────
// Two-layer: Redis (fast, volatile) → DB (slow, durable).
// Redis TTL matches the webhook processing guarantee window (24h).

async function checkIdempotency(
    source: WebhookSource,
    gatewayEventId: string,
): Promise<boolean> {
    const redis = getRedisClient();
    const lockKey = RedisKeys.webhookProcessed(`${source}:${gatewayEventId}`);

    // Fast path — Redis hit
    const cached = await redis.get(lockKey).catch(() => null);
    if (cached) {
        log.debug('Webhook idempotency: Redis hit', { source, gatewayEventId });
        return true;
    }

    // Slow path — DB check (covers Redis eviction / restart)
    const existing = await prisma.webhook_logs.findFirst({
        where: {
            source,
            gateway_event_id: gatewayEventId,
            status: { in: ['PROCESSED', 'IGNORED'] },
        },
        select: { id: true },
    });

    if (existing) {
        // Backfill Redis so future checks are fast
        await redis.setex(lockKey, RedisTTL.WEBHOOK_PROCESSED, '1').catch(() => { });
        log.debug('Webhook idempotency: DB hit', { source, gatewayEventId });
        return true;
    }

    return false;
}

async function markIdempotent(
    source: WebhookSource,
    gatewayEventId: string,
): Promise<void> {
    const redis = getRedisClient();
    const lockKey = RedisKeys.webhookProcessed(`${source}:${gatewayEventId}`);
    await redis.setex(lockKey, RedisTTL.WEBHOOK_PROCESSED, '1').catch(() => { });
}

// ─── Webhook log writer ────────────────────────────────────────────────────────

async function logWebhook(entry: Omit<WebhookLogRecord, 'id'>): Promise<void> {
    await prisma.webhook_logs.create({
        data: {
            source: entry.source,
            event: entry.event,
            gateway_event_id: entry.gatewayEventId,
            status: entry.status,
            processing_ms: entry.processingMs,
            error_message: entry.errorMessage,
            received_at: entry.receivedAt,
            processed_at: entry.processedAt,
        },
    }).catch((err) => {
        // Never crash on log failure
        log.error('Failed to write webhook log', { error: (err as Error).message });
    });
}

// ─── Execution wrapper ─────────────────────────────────────────────────────────
// Runs the handler, times it, writes the log, marks idempotency.

async function executeWithAudit<T>(params: {
    source: WebhookSource;
    event: string;
    gatewayEventId: string | null;
    receivedAt: Date;
    handler: () => Promise<T>;
    req: Request;
}): Promise<{ status: WebhookProcessingStatus; result?: T }> {
    const { source, event, gatewayEventId, receivedAt, handler } = params;
    const startMs = Date.now();

    // Idempotency check — skip if already processed
    if (gatewayEventId) {
        const alreadyDone = await checkIdempotency(source, gatewayEventId);
        if (alreadyDone) {
            await logWebhook({
                source,
                event,
                gatewayEventId,
                status: 'SKIPPED',
                processingMs: Date.now() - startMs,
                errorMessage: null,
                receivedAt,
                processedAt: new Date(),
            });
            return { status: 'SKIPPED' };
        }
    }

    try {
        const result = await handler();

        const processingMs = Date.now() - startMs;

        if (gatewayEventId) {
            await markIdempotent(source, gatewayEventId);
        }

        await logWebhook({
            source,
            event,
            gatewayEventId,
            status: 'PROCESSED',
            processingMs,
            errorMessage: null,
            receivedAt,
            processedAt: new Date(),
        });

        log.info('Webhook processed', {
            source,
            event,
            gatewayEventId,
            processingMs,
            requestId: params.req.requestId,
        });

        return { status: 'PROCESSED', result };

    } catch (err) {
        const processingMs = Date.now() - startMs;
        const errorMessage = (err as Error).message;

        await logWebhook({
            source,
            event,
            gatewayEventId,
            status: 'FAILED',
            processingMs,
            errorMessage,
            receivedAt,
            processedAt: new Date(),
        });

        log.error('Webhook handler failed', {
            source,
            event,
            gatewayEventId,
            errorMessage,
            stack: (err as Error).stack,
            requestId: params.req.requestId,
        });

        // Re-throw so the controller can respond with 500
        // Razorpay will retry on 5xx — that is the correct behaviour
        throw err;
    }
}

// ─── Webhook service ───────────────────────────────────────────────────────────

export const webhooksService = {

    // ── 1. Razorpay webhook ────────────────────────────────────────────────────
    // Entry point for all Razorpay events.
    // rawBody must be the unparsed request body string — JSON.parse happens after
    // signature verification, never before.

    async handleRazorpay(
        rawBody: string,
        headers: RazorpayWebhookHeaders,
        req: Request,
    ): Promise<void> {
        const receivedAt = new Date();
        const signature = headers['x-razorpay-signature'];
        const eventId = headers['x-razorpay-event-id'] ?? null;

        // ── Step 1: Signature verification ──────────────────────────────────────
        // Must happen before JSON.parse — signature is over the raw bytes
        if (!signature) {
            log.warn('Razorpay webhook missing signature header', {
                requestId: req.requestId,
            });
            throw PAYMENT_ERRORS.invalidWebhookSignature();
        }

        const secrets = getSecrets();
        const isValid = verifyRazorpaySignature(
            rawBody,
            signature,
            secrets.razorpay.webhookSecret,
        );

        if (!isValid) {
            log.warn('Razorpay webhook signature verification failed', {
                requestId: req.requestId,
                eventId,
            });
            throw PAYMENT_ERRORS.invalidWebhookSignature();
        }

        // ── Step 2: Parse payload ────────────────────────────────────────────────
        let payload: RazorpayWebhookPayload;
        try {
            payload = JSON.parse(rawBody) as RazorpayWebhookPayload;
        } catch {
            throw new Error('Invalid JSON in Razorpay webhook body');
        }

        const event = payload.event;
        const gatewayEventId = eventId ?? this._extractRazorpayEventId(payload);

        log.info('Razorpay webhook received', {
            event,
            gatewayEventId,
            requestId: req.requestId,
        });

        // ── Step 3: Route to handler with idempotency + audit ────────────────────
        await executeWithAudit({
            source: 'razorpay',
            event,
            gatewayEventId,
            receivedAt,
            req,
            handler: () =>
                paymentsService.processRazorpayWebhook(payload, req.requestId),
        });

        // Also route payout webhooks to disbursement service
        if (event.startsWith('payout.')) {
            await executeWithAudit({
                source: 'razorpay',
                event: `disbursement:${event}`,
                gatewayEventId: gatewayEventId
                    ? `disburse:${gatewayEventId}`
                    : null,
                receivedAt,
                req,
                handler: () =>
                    disbursementService.processPayoutWebhook(
                        {
                            razorpayPayoutId:
                                (payload.payload as Record<string, Record<string, Record<string, string>>>)
                                    ?.payout?.entity?.id ?? '',
                            status:
                                (payload.payload as Record<string, Record<string, Record<string, string>>>)
                                    ?.payout?.entity?.status ?? '',
                            utrNumber:
                                (payload.payload as Record<string, Record<string, Record<string, string>>>)
                                    ?.payout?.entity?.utr ?? null,
                            failureReason:
                                (payload.payload as Record<string, Record<string, Record<string, string>>>)
                                    ?.payout?.entity?.failure_reason ?? null,
                        },
                        req,
                    ),
            });
        }
    },

    // ── 2. eSign callback ──────────────────────────────────────────────────────
    // Signzy calls this when a customer completes or declines eSign.

    async handleESign(
        payload: ESignCallbackPayload,
        req: Request,
    ): Promise<void> {
        const receivedAt = new Date();

        // ── Signature verification ───────────────────────────────────────────────
        const secrets = getSecrets();
        const isValid = verifyESignSignature(payload, secrets.signzy.apiKey);

        if (!isValid) {
            log.warn('eSign callback signature invalid', {
                requestId: payload.requestId,
            });
            throw new Error('eSign callback signature verification failed');
        }

        // ── Replay protection — timestamps must be within 5 minutes ─────────────
        const ageSeconds = (Date.now() - payload.timestamp * 1000) / 1000;
        if (Math.abs(ageSeconds) > 300) {
            log.warn('eSign callback timestamp too old or future', {
                ageSeconds,
                requestId: payload.requestId,
            });
            throw new Error('eSign callback timestamp out of acceptable range');
        }

        await executeWithAudit({
            source: 'esign',
            event: `esign.${payload.status.toLowerCase()}`,
            gatewayEventId: payload.requestId,
            receivedAt,
            req,
            handler: () =>
                kycService.processESignCallback(
                    payload.requestId,
                    payload.status,
                    req,
                ),
        });
    },

    // ── 3. Signzy async callback ───────────────────────────────────────────────
    // Some Signzy checks are async — result comes via callback.

    async handleSignzy(
        payload: SignzyCallbackPayload,
        req: Request,
    ): Promise<void> {
        const receivedAt = new Date();

        const secrets = getSecrets();
        const isValid = verifySignzySignature(payload, secrets.signzy.apiKey);

        if (!isValid) {
            log.warn('Signzy callback signature invalid', {
                checkType: payload.checkType,
                requestId: payload.requestId,
            });
            throw new Error('Signzy callback signature verification failed');
        }

        const ageSeconds = (Date.now() - payload.timestamp * 1000) / 1000;
        if (Math.abs(ageSeconds) > 300) {
            throw new Error('Signzy callback timestamp out of acceptable range');
        }

        await executeWithAudit({
            source: 'signzy',
            event: `signzy.${payload.checkType.toLowerCase()}.${payload.status.toLowerCase()}`,
            gatewayEventId: payload.requestId,
            receivedAt,
            req,
            handler: async () => {
                // Route to the appropriate KYC check handler
                log.info('Signzy async callback', {
                    checkType: payload.checkType,
                    status: payload.status,
                    requestId: payload.requestId,
                });
                // Future: route to specific handlers as async checks are added
                // For now: log and acknowledge
            },
        });
    },

    // ── 4. Health probe for webhook endpoint ───────────────────────────────────

    ping(): { ok: boolean; ts: string } {
        return { ok: true, ts: new Date().toISOString() };
    },

    // ── Private helpers ────────────────────────────────────────────────────────

    _extractRazorpayEventId(payload: RazorpayWebhookPayload): string | null {
        // Extract the most specific ID from the payload for deduplication
        const p = payload.payload;

        const paymentId =
            (p as Record<string, Record<string, Record<string, string>>>)
                ?.payment?.entity?.id ?? null;
        const payoutId =
            (p as Record<string, Record<string, Record<string, string>>>)
                ?.payout?.entity?.id ?? null;
        const orderId =
            (p as Record<string, Record<string, Record<string, string>>>)
                ?.order?.entity?.id ?? null;

        // Use event + entity ID as idempotency key
        const entityId = paymentId ?? payoutId ?? orderId;
        return entityId ? `${payload.event}:${entityId}` : null;
    },
};