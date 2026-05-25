// src/types/express.d.ts
//
// Augments Express's Request and Response interfaces so TypeScript knows
// about the properties our middlewares attach at runtime.
//
// Rules:
//  - Only add properties that are ALWAYS present after a specific middleware runs.
//  - Optional properties (?) for things that may or may not be attached.
//  - Never use `any` — tighten the type or use `unknown`.

import type { Logger } from 'winston';
import type { Role } from '@/config/constants';

declare global {
    namespace Express {

        // ─── Request augmentation ──────────────────────────────────────────────
        interface Request {

            // ── Attached by requestLogger middleware ──────────────────────────────
            // Present on every single request — requestLogger runs first globally
            requestId: string;           // UUID v4 — ties together all logs for one request
            requestLogger: Logger;       // Per-request child logger with requestId bound
            startTime: [number, number]; // process.hrtime() — for response time calculation

            // ── Attached by verifyToken middleware ────────────────────────────────
            // Present on all protected routes (after verifyToken runs).
            // Marked optional here because Express's base Request has no `user`.
            // Use AuthRequest (below) or getAuthUser() in protected route handlers
            // to access this as a guaranteed non-undefined value.
            user?: AuthenticatedUser;

            // ── Attached by validate middleware ───────────────────────────────────
            // Joi-validated and type-safe versions of req.body / req.query / req.params
            // After validation middleware runs, use these instead of the raw Express ones
            validatedBody?: unknown;
            validatedQuery?: unknown;
            validatedParams?: unknown;

            // ── Attached by idempotency middleware (webhooks) ─────────────────────
            idempotencyKey?: string;

            // ── Attached by auditTrail middleware ─────────────────────────────────
            // Populated by the middleware, flushed to audit_logs table at response end
            auditContext?: AuditContext;
        }

        // ─── Response augmentation ─────────────────────────────────────────────
        interface Response {
            // Attached by requestLogger middleware
            // Allows middleware to read back the requestId when building response headers
            requestId?: string;
        }
    }
}

// ─── Authenticated user shape ──────────────────────────────────────────────────
// This is what verifyToken decodes from the JWT and attaches to req.user.
// The user-module team must issue tokens that match this exact shape.
// Coordinate with them on any changes here.

export interface AuthenticatedUser {
    id: string;   // UUID — maps to users.id in DB
    phone: string;   // +91XXXXXXXXXX format
    role: Role;     // One of the ROLE constants
    agentId?: string;   // Set when role === ROLE.AGENT
    jti: string;   // JWT ID — used for token revocation via Redis denylist
    iat: number;   // Issued at (Unix timestamp)
    exp: number;   // Expiry (Unix timestamp)
}

// ─── Audit context shape ───────────────────────────────────────────────────────
// Carried on req.auditContext, populated by service layer,
// flushed to audit_logs by auditTrail middleware on response finish

export interface AuditContext {
    action?: string;     // From AUDIT_ACTION constants
    entityType?: string;     // 'loan_application' | 'loan_account' | 'payment' etc.
    entityId?: string;     // UUID of the affected record
    before?: unknown;    // Snapshot before mutation (for updates)
    after?: unknown;    // Snapshot after mutation
    metadata?: Record<string, unknown>;
}

// ─── Type-safe request helpers ─────────────────────────────────────────────────
// Generic wrappers that cast req.validatedBody / req.validatedParams
// to the correct DTO type after validation middleware has run.
// Use in controllers: const body = getValidatedBody<CreateLoanDto>(req)

import type { Request } from 'express';

export function getValidatedBody<T>(req: Request): T {
    if (req.validatedBody === undefined) {
        throw new Error(
            'getValidatedBody called before validate middleware ran. ' +
            'Ensure the validate() middleware is applied to this route.',
        );
    }
    return req.validatedBody as T;
}

export function getValidatedQuery<T>(req: Request): T {
    if (req.validatedQuery === undefined) {
        throw new Error(
            'getValidatedQuery called before validate middleware ran.',
        );
    }
    return req.validatedQuery as T;
}

export function getValidatedParams<T>(req: Request): T {
    if (req.validatedParams === undefined) {
        throw new Error(
            'getValidatedParams called before validate middleware ran.',
        );
    }
    return req.validatedParams as T;
}

// ─── Authenticated user accessor ───────────────────────────────────────────────
// Returns the typed user attached by verifyToken middleware.
// Throws at runtime if called on a route that does not sit behind verifyToken —
// this is intentional: such a call would be a programming error, not a user error.
//
// Use in controllers: const user = getAuthUser(req);

export function getAuthUser(req: Request): AuthenticatedUser {
    if (req.user === undefined) {
        throw new Error(
            'getAuthUser called before verifyToken middleware ran. ' +
            'Ensure the verifyToken() middleware is applied to this route.',
        );
    }
    return req.user;
}

// ─── Authenticated request type alias ─────────────────────────────────────────
// Use this in controllers that sit behind verifyToken middleware.
// It narrows req.user from optional to required — no optional chaining needed.
//
// IMPORTANT: This uses Omit + intersection (not a plain `&`) so that Express's
// RequestHandler overload accepts AuthRequest handlers. A plain intersection
// produces `user: AuthenticatedUser | undefined & AuthenticatedUser` which
// TypeScript treats as incompatible with the base Request's optional `user`.

export type AuthRequest = Omit<Request, 'user'> & {
    user: AuthenticatedUser;
};