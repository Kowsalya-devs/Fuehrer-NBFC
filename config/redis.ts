// src/config/redis.ts
import Redis, { type RedisOptions } from 'ioredis';
import { env } from './env';
import { logger } from './logger';

// ─── Client options ────────────────────────────────────────────────────────────

const redisOptions: RedisOptions = {
    // Upstash and most managed Redis providers use TLS in production
    tls: env.redis.tls ? {} : undefined,

    // Retry with exponential backoff — important when App Runner restarts
    retryStrategy(times: number): number | null {
        if (times > 10) {
            logger.error('Redis: giving up after 10 reconnect attempts');
            return null; // Stop retrying — will cause connection to fail
        }
        const delay = Math.min(times * 200, 3000);
        logger.warn(`Redis: reconnecting in ${delay}ms`, { attempt: times });
        return delay;
    },

    // Don't let a slow Redis block the entire app
    connectTimeout: 5_000,
    commandTimeout: 3_000,

    // Keep-alive to prevent NAT/ALB from closing idle connections
    keepAlive: 10_000,

    // Reconnect automatically on connection errors
    enableOfflineQueue: true,
    maxRetriesPerRequest: 3,

    lazyConnect: true, // Don't connect until first command
};

// ─── Singleton ─────────────────────────────────────────────────────────────────

let redisClient: Redis | null = null;

export function getRedisClient(): Redis {
    if (redisClient) return redisClient;

    redisClient = new Redis(env.redis.url, redisOptions);

    redisClient.on('connect', () => {
        logger.info('Redis connected');
    });

    redisClient.on('ready', () => {
        logger.info('Redis ready');
    });

    redisClient.on('error', (err: Error) => {
        // Log but don't crash — Redis is used for OTP/cache, not primary data
        logger.error('Redis error', { message: err.message });
    });

    redisClient.on('close', () => {
        logger.warn('Redis connection closed');
    });

    redisClient.on('reconnecting', (delay: number) => {
        logger.warn('Redis reconnecting', { delay_ms: delay });
    });

    return redisClient;
}

export async function connectRedis(): Promise<void> {
    const client = getRedisClient();
    await client.connect();
    await client.ping(); // Confirm the connection is usable
    logger.info('Redis ping successful');
}

export async function disconnectRedis(): Promise<void> {
    if (redisClient) {
        await redisClient.quit();
        redisClient = null;
        logger.info('Redis disconnected');
    }
}

// ─── Typed Redis helpers ───────────────────────────────────────────────────────
// Centralise all key patterns here — prevents typos scattered across modules

export const RedisKeys = {
    // OTP storage (set by user module, verified by KYC module)
    otp: (phone: string) => `otp:${phone}`,

    // Session / JWT denylist (for logout before expiry)
    tokenDenylist: (jti: string) => `token:deny:${jti}`,

    // KYC status cache — avoids re-hitting DB on every request
    kycStatus: (userId: string) => `kyc:status:${userId}`,

    // EMI schedule cache — expensive to compute, cache for 1 hour
    emiSchedule: (loanAccountId: string) => `emi:schedule:${loanAccountId}`,

    // Rate limit buckets (used by rateLimiter middleware)
    rateLimit: (key: string) => `rl:${key}`,

    // Idempotency keys for webhook deduplication
    webhookProcessed: (txnId: string) => `wh:done:${txnId}`,

    // Distributed lock — prevents double-disbursement
    disbursementLock: (applicationId: string) => `lock:disburse:${applicationId}`,
} as const;

// ─── TTL constants (seconds) ───────────────────────────────────────────────────

export const RedisTTL = {
    OTP: 5 * 60,         // 5 minutes
    KYC_STATUS: 60 * 60,        // 1 hour
    EMI_SCHEDULE: 60 * 60,        // 1 hour
    WEBHOOK_PROCESSED: 24 * 60 * 60,   // 24 hours (idempotency window)
    DISBURSE_LOCK: 30,             // 30 seconds (distributed lock TTL)
} as const;

// ─── Distributed lock utility ──────────────────────────────────────────────────
// SET key value NX EX ttl — atomic, no separate GET+SET race condition

export async function acquireLock(
    key: string,
    ttlSeconds: number,
    token: string,
): Promise<boolean> {
    const client = getRedisClient();
    const result = await client.set(key, token, 'EX', ttlSeconds, 'NX');
    return result === 'OK';
}

export async function releaseLock(
    key: string,
    token: string,
): Promise<void> {
    const client = getRedisClient();
    // Lua script ensures we only delete OUR lock, not someone else's
    const script = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    else
      return 0
    end
  `;
    await client.eval(script, 1, key, token);
}