// src/middlewares/verifyToken.middleware.ts
import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import { env } from '@/config/env';
import { getRedisClient, RedisKeys } from '@/config/redis';
import {
    UnauthorizedError,
    AUTH_ERRORS,
} from '@/errors';
import type { AuthenticatedUser } from '@/types/express.d';

// ─── Token extraction ──────────────────────────────────────────────────────────
// Accept: "Bearer <token>" in Authorization header only.
// We do not read tokens from cookies or query strings — security best practice.

function extractToken(req: Request): string | null {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) return null;
    const token = authHeader.slice(7).trim();
    return token.length > 0 ? token : null;
}

// ─── JWT verification (sync — jsonwebtoken is sync by default) ─────────────────

function verifyJwt(token: string): AuthenticatedUser {
    try {
        return jwt.verify(token, env.auth.jwtSecret, {
            algorithms: ['HS256'],
            // Do not set `complete: true` — we only need the payload
        }) as AuthenticatedUser;
    } catch (err: unknown) {
        if (err instanceof jwt.TokenExpiredError) throw AUTH_ERRORS.expiredToken();
        if (err instanceof jwt.JsonWebTokenError) throw AUTH_ERRORS.invalidToken();
        throw AUTH_ERRORS.invalidToken();
    }
}

// ─── Denylist check (Redis) ────────────────────────────────────────────────────
// When a user logs out (user-module), their token's `jti` is written to Redis
// with TTL matching the token's remaining lifetime.
// We check this on every request — O(1) Redis GET is fast enough.

async function isTokenDenylisted(jti: string): Promise<boolean> {
    try {
        const redis = getRedisClient();
        const result = await redis.get(RedisKeys.tokenDenylist(jti));
        return result !== null;
    } catch {
        // Redis is unavailable — fail open (allow the request)
        // Logging happens in redis.ts error handler already
        // In production, a Redis outage should not lock out all users
        return false;
    }
}

// ─── Middleware: verifyToken ───────────────────────────────────────────────────
// OPTIONAL by default — attaches req.user if a valid token is present.
// Does NOT reject the request if no token is found.
// Use `requireAuth` (below) on protected routes to enforce presence.

export function verifyToken() {
    return async (
        req: Request,
        res: Response,
        next: NextFunction,
    ): Promise<void> => {
        const token = extractToken(req);

        if (!token) {
            // No token — req.user remains undefined
            // The rbac middleware will reject if the route requires auth
            return next();
        }

        try {
            const payload = verifyJwt(token);

            // Check denylist — handles logout before token expiry
            if (await isTokenDenylisted(payload.jti)) {
                throw AUTH_ERRORS.tokenRevoked();
            }

            req.user = payload;

            // Bind userId to the request logger — all subsequent logs carry it
            req.requestLogger = req.requestLogger.child({ userId: payload.id });

        } catch (err) {
            // Any auth error — pass to global error handler
            return next(err);
        }

        next();
    };
}

// ─── requireAuth ──────────────────────────────────────────────────────────────
// Lightweight guard — place AFTER verifyToken in the middleware stack.
// Rejects requests where verifyToken found no valid token.
// Do not duplicate JWT logic here — verifyToken already ran.

export function requireAuth() {
    return (req: Request, _res: Response, next: NextFunction): void => {
        if (!req.user) {
            return next(AUTH_ERRORS.missingToken());
        }
        next();
    };
}