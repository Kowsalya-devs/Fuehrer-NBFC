// src/middlewares/rateLimiter.middleware.ts
import type { Request, Response, NextFunction } from 'express';
import { getRedisClient, RedisKeys } from '@/config/redis';
import { env } from '@/config/env';
import { RateLimitError } from '@/errors';
import { createModuleLogger } from '@/config/logger';

const log = createModuleLogger('rateLimiter');

// ─── Rate limit configuration ──────────────────────────────────────────────────

interface RateLimitConfig {
    windowMs: number;   // Time window in milliseconds
    max: number;   // Max requests per window
    keyPrefix?: string;   // Redis key prefix (defaults to 'rl')
    message?: string;
    // Custom key extractor — defaults to IP + path
    keyExtractor?: (req: Request) => string;
}

// ─── Core sliding window rate limiter ──────────────────────────────────────────
// Uses Redis INCR + EXPIRE — atomic, no race conditions.
// Not a true sliding window but a fixed window reset — sufficient for NBFC traffic volumes.

function createRateLimiter(config: RateLimitConfig) {
    return async (
        req: Request,
        res: Response,
        next: NextFunction,
    ): Promise<void> => {
        let redis;
        try {
            redis = getRedisClient();
        } catch {
            // Redis unavailable — fail open, log the miss
            log.warn('Rate limiter: Redis unavailable, skipping limit check', {
                path: req.path,
            });
            return next();
        }

        const windowSec = Math.ceil(config.windowMs / 1000);

        // ── Build the bucket key ─────────────────────────────────────────────────
        // Default: IP + path — specific enough to prevent abuse without locking users out
        const identifier = config.keyExtractor
            ? config.keyExtractor(req)
            : `${req.ip ?? 'unknown'}:${req.path}`;

        const redisKey = RedisKeys.rateLimit(
            `${config.keyPrefix ?? 'general'}:${identifier}`,
        );

        try {
            // INCR is atomic — safe under concurrent requests
            const current = await redis.incr(redisKey);

            if (current === 1) {
                // First request in window — set expiry
                await redis.expire(redisKey, windowSec);
            }

            const remaining = Math.max(0, config.max - current);
            const ttl = await redis.ttl(redisKey);
            const resetAt = Date.now() + ttl * 1000;

            // Always attach rate limit headers — good API citizenship
            res.setHeader('X-RateLimit-Limit', config.max);
            res.setHeader('X-RateLimit-Remaining', remaining);
            res.setHeader('X-RateLimit-Reset', Math.ceil(resetAt / 1000));

            if (current > config.max) {
                res.setHeader('Retry-After', ttl);
                log.warn('Rate limit exceeded', {
                    key: redisKey,
                    current,
                    max: config.max,
                    ip: req.ip,
                    path: req.path,
                    userId: req.user?.id,
                });
                return next(
                    new RateLimitError(
                        config.message ?? 'Too many requests',
                        ttl,
                        config.keyPrefix,
                    ),
                );
            }
        } catch (err) {
            // Redis error during check — fail open (availability > rate limiting)
            log.error('Rate limiter: Redis error during check', {
                error: (err as Error).message,
                path: req.path,
            });
        }

        next();
    };
}

// ─── Pre-configured limiters ───────────────────────────────────────────────────
// Import and use these directly in route files.

// General API — 100 req/min per IP
export const generalLimiter = createRateLimiter({
    windowMs: env.rateLimit.windowMs,
    max: env.rateLimit.maxRequests,
    keyPrefix: 'general',
});

// KYC endpoints — 5 req/hour per user
// Each Signzy call costs ₹10–₹50 — aggressive limiting is essential
export const kycLimiter = createRateLimiter({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: env.rateLimit.kycMax,
    keyPrefix: 'kyc',
    message: 'KYC verification attempts exceeded. Please try again in 1 hour.',
    keyExtractor: (req) =>
        // Key on userId if authenticated, fall back to IP
        req.user?.id ?? req.ip ?? 'unknown',
});

// Webhook endpoints — 500 req/min
// Razorpay can burst — needs a higher limit than general
export const webhookLimiter = createRateLimiter({
    windowMs: 60 * 1000,
    max: env.rateLimit.webhookMax,
    keyPrefix: 'webhook',
    keyExtractor: (req) =>
        // Key on source IP only — webhooks don't have a user context
        req.ip ?? 'unknown',
});

// Loan application — 3 applications per 24h per user
// Prevents application spam
export const loanApplicationLimiter = createRateLimiter({
    windowMs: 24 * 60 * 60 * 1000,
    max: 3,
    keyPrefix: 'loan-apply',
    message: 'Maximum 3 loan applications per day. Please try again tomorrow.',
    keyExtractor: (req) => req.user?.id ?? req.ip ?? 'unknown',
});

// Disbursement — 1 per loan (enforced at DB level too, but belt-and-suspenders)
export const disbursementLimiter = createRateLimiter({
    windowMs: 60 * 1000,
    max: 5,
    keyPrefix: 'disburse',
    keyExtractor: (req) => req.user?.id ?? req.ip ?? 'unknown',
});

// ─── Custom limiter factory ────────────────────────────────────────────────────
// For one-off cases in specific routes

export { createRateLimiter };