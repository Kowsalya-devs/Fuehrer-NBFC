// src/middlewares/rbac.middleware.ts
import type { Request, Response, NextFunction } from 'express';
import { ROLE } from '@/config/constants';
import type { Role } from '@/config/constants';
import { ForbiddenError, RBAC_ERRORS } from '@/errors';
import type { AuthRequest } from '@/types/express.d';

// ─── Role hierarchy ────────────────────────────────────────────────────────────
// Roles higher in the hierarchy can do everything lower roles can do.
// SUPER_ADMIN can call any endpoint regardless of the roles listed.

const ROLE_HIERARCHY: Record<Role, number> = {
    [ROLE.CUSTOMER]: 1,
    [ROLE.AGENT]: 2,
    [ROLE.COLLECTION_AGENT]: 3,
    [ROLE.OPS_EXECUTIVE]: 4,
    [ROLE.FINANCE]: 5,
    [ROLE.CREDIT_MANAGER]: 6,
    [ROLE.SUPER_ADMIN]: 99,
};

export function hasRole(userRole: Role, requiredRole: Role): boolean {
    // Super admin bypasses all role checks
    if (userRole === ROLE.SUPER_ADMIN) return true;
    return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole];
}

// ─── allowRoles middleware ─────────────────────────────────────────────────────
// Accepts a list of roles — ANY match is sufficient (OR logic).
// SUPER_ADMIN always passes regardless of the list.
//
// Usage:
//   router.post('/approve', verifyToken(), requireAuth(), allowRoles(ROLE.CREDIT_MANAGER), handler)

export function allowRoles(...roles: Role[]) {
    return (req: Request, _res: Response, next: NextFunction): void => {
        // verifyToken + requireAuth must have run before this
        if (!req.user) {
            return next(new ForbiddenError('Authentication required before role check'));
        }

        const userRole = req.user.role;

        // Super admin bypasses everything
        if (userRole === ROLE.SUPER_ADMIN) return next();

        const allowed = roles.some((r) => hasRole(userRole, r));
        if (!allowed) {
            return next(RBAC_ERRORS.insufficientRole(roles, userRole));
        }

        next();
    };
}

// ─── requireOwnership middleware ───────────────────────────────────────────────
// Ensures the authenticated user is only accessing their own resources.
// `paramKey` is the request param that holds the resource owner's userId.
//
// Usage (customer can only GET their own loans):
//   router.get('/:userId/loans', requireOwnership('userId'), handler)
//
// Staff roles bypass ownership — they can access any customer's data.

const STAFF_ROLES = new Set<Role>([
    ROLE.OPS_EXECUTIVE,
    ROLE.CREDIT_MANAGER,
    ROLE.FINANCE,
    ROLE.COLLECTION_AGENT,
    ROLE.SUPER_ADMIN,
]);

export function requireOwnership(paramKey = 'userId') {
    return (req: Request, _res: Response, next: NextFunction): void => {
        if (!req.user) {
            return next(new ForbiddenError('Authentication required'));
        }

        // Staff can access any user's resources
        if (STAFF_ROLES.has(req.user.role)) return next();

        const resourceOwnerId = req.params[paramKey];
        if (!resourceOwnerId) {
            return next(
                new ForbiddenError(
                    `Route param '${paramKey}' not found — cannot verify ownership`,
                ),
            );
        }

        if (req.user.id !== resourceOwnerId) {
            return next(RBAC_ERRORS.ownResourceOnly('resource'));
        }

        next();
    };
}

// ─── requireAgentOwnership middleware ─────────────────────────────────────────
// Agents can only manage their own customers.
// The target resource must have an `agentId` field we can compare against.
// The actual DB lookup happens in the service layer —
// this middleware just ensures the agent's ID is present on the request.

export function requireAgentContext() {
    return (req: Request, _res: Response, next: NextFunction): void => {
        if (!req.user) {
            return next(new ForbiddenError('Authentication required'));
        }

        if (req.user.role === ROLE.AGENT && !req.user.agentId) {
            return next(
                new ForbiddenError(
                    'Agent account is not fully set up — agentId missing from token',
                ),
            );
        }

        next();
    };
}

// ─── Type-safe auth request extractor ─────────────────────────────────────────
// After requireAuth() runs, req.user is guaranteed present.
// Use this in controllers instead of casting.

export function getAuthUser(req: Request): AuthRequest['user'] {
    if (!req.user) {
        // This should never happen if the middleware stack is correct
        throw new ForbiddenError(
            'getAuthUser called on unauthenticated request — check middleware order',
        );
    }
    return req.user;
}