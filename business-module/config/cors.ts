// src/config/cors.ts
import cors, { type CorsOptions } from 'cors';
import { env } from './env';
import { logger } from './logger';

// ─── Allowed origins ───────────────────────────────────────────────────────────
// In production: explicitly listed domains only
// In development: allow everything (Expo Go, local tooling, Postman)

function isOriginAllowed(origin: string): boolean {
    if (env.isDev || env.isTest) return true;

    // Exact match or subdomain of allowed origins
    return env.cors.allowedOrigins.some(
        (allowed) =>
            origin === allowed ||
            origin.endsWith(`.${allowed.replace(/^https?:\/\//, '')}`),
    );
}

export const corsOptions: CorsOptions = {
    origin(origin, callback) {
        // Allow requests with no origin (mobile apps, curl, Postman in non-browser mode)
        if (!origin) return callback(null, true);

        if (isOriginAllowed(origin)) {
            return callback(null, true);
        }

        logger.warn('CORS blocked request', { origin });
        callback(new Error(`CORS policy: origin ${origin} is not allowed`));
    },

    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],

    allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Request-ID',          // For request tracing
        'X-Idempotency-Key',      // For idempotent POST requests
        'X-Razorpay-Signature',   // Razorpay webhook header
    ],

    exposedHeaders: [
        'X-Request-ID',           // Let client log the request ID
        'X-RateLimit-Remaining',
        'X-RateLimit-Reset',
    ],

    credentials: true,          // Allow cookies / Authorization headers

    maxAge: 86_400,             // Cache preflight for 24h (reduces OPTIONS requests)
};

export const corsMiddleware = cors(corsOptions);