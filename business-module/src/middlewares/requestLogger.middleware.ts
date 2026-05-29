// src/middlewares/requestLogger.middleware.ts
import { randomUUID } from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { createRequestLogger } from '@/config/logger';
import { env } from '@/config/env';

// ─── Paths that generate too much noise in logs ────────────────────────────────
// Health checks hit every 30s from the load balancer — skip them
const SILENT_PATHS = new Set([
    '/health',
    '/health/live',
    '/health/ready',
    '/favicon.ico',
]);

// Headers that contain credentials — redact before logging
const SENSITIVE_HEADERS = new Set([
    'authorization',
    'x-api-key',
    'cookie',
    'x-razorpay-signature',
]);

function redactHeaders(
    headers: Record<string, string | string[] | undefined>,
): Record<string, string | string[] | undefined> {
    const redacted: Record<string, string | string[] | undefined> = {};
    for (const [key, value] of Object.entries(headers)) {
        redacted[key] = SENSITIVE_HEADERS.has(key.toLowerCase())
            ? '[REDACTED]'
            : value;
    }
    return redacted;
}

// ─── Middleware ────────────────────────────────────────────────────────────────

export function requestLogger() {
    return (req: Request, res: Response, next: NextFunction): void => {
        // ── Attach request metadata ──────────────────────────────────────────────
        // Prefer client-sent X-Request-ID (for distributed tracing) or generate new
        const requestId =
            (req.headers['x-request-id'] as string | undefined) ?? randomUUID();

        req.requestId = requestId;
        req.startTime = process.hrtime();
        req.requestLogger = createRequestLogger(requestId);

        // Echo the request ID back so clients can correlate logs
        res.setHeader('X-Request-ID', requestId);

        const isSilent = SILENT_PATHS.has(req.path);

        // ── Log incoming request ──────────────────────────────────────────────────
        if (!isSilent) {
            req.requestLogger.http('Incoming request', {
                method: req.method,
                path: req.path,
                query: Object.keys(req.query).length ? req.query : undefined,
                ip: req.ip ?? req.socket.remoteAddress,
                // Only log headers in debug mode — they're verbose
                headers: env.logging.level === 'debug'
                    ? redactHeaders(req.headers as Record<string, string | string[] | undefined>)
                    : undefined,
                userAgent: req.headers['user-agent'],
            });
        }

        // ── Log outgoing response ─────────────────────────────────────────────────
        // Use 'finish' not 'close' — finish fires when response is fully sent
        res.on('finish', () => {
            if (isSilent) return;

            const [sec, ns] = process.hrtime(req.startTime);
            const durationMs = Math.round(sec * 1000 + ns / 1_000_000);
            const statusCode = res.statusCode;

            const logFn =
                statusCode >= 500 ? req.requestLogger.error.bind(req.requestLogger)
                    : statusCode >= 400 ? req.requestLogger.warn.bind(req.requestLogger)
                        : req.requestLogger.http.bind(req.requestLogger);

            logFn('Request completed', {
                method: req.method,
                path: req.path,
                statusCode,
                durationMs,
                // Attach userId if token was verified — links HTTP log to auth context
                userId: req.user?.id,
                contentLength: res.getHeader('content-length'),
            });
        });

        next();
    };
}
