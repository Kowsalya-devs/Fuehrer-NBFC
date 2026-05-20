// src/constants/roles.constants.ts
//
// Role and permission constants for the Feuhrer business module.
//
// The ROLE enum lives in config/constants.ts. This file re-exports it and
// adds pre-built role groups used across route files so allowRoles() calls
// stay readable and consistent.
//
// ROLE_HIERARCHY is defined in rbac.middleware.ts for use at request time.
// The numeric values here are exported for any code that needs to compare
// role weights outside the middleware (e.g. admin user management service).

export { ROLE } from '@/config/constants';
export type { Role } from '@/config/constants';

import { ROLE } from '@/config/constants';
import type { Role } from '@/config/constants';

// ─── Role hierarchy weights ───────────────────────────────────────────────────
// Matches rbac.middleware.ts — kept in sync manually.
// Higher number = more permissions.

export const ROLE_HIERARCHY: Record<Role, number> = {
    [ROLE.CUSTOMER]: 1,
    [ROLE.AGENT]: 2,
    [ROLE.COLLECTION_AGENT]: 3,
    [ROLE.OPS_EXECUTIVE]: 4,
    [ROLE.FINANCE]: 5,
    [ROLE.CREDIT_MANAGER]: 6,
    [ROLE.SUPER_ADMIN]: 99,
} as const;

export type RoleName = keyof typeof ROLE_HIERARCHY;

// ─── Pre-built role groups ────────────────────────────────────────────────────
// Use these in route files instead of inline arrays.
// Keeps allowRoles() calls short and semantically clear.

/** Only SUPER_ADMIN */
export const SUPER_ADMIN_ONLY: Role[] = [
    ROLE.SUPER_ADMIN,
];

/** Staff who can approve or reject loans */
export const CREDIT_ROLES: Role[] = [
    ROLE.CREDIT_MANAGER,
    ROLE.SUPER_ADMIN,
];

/** Staff who can initiate disbursements */
export const FINANCE_ROLES: Role[] = [
    ROLE.FINANCE,
    ROLE.SUPER_ADMIN,
];

/** Staff who can view and manage collections */
export const COLLECTION_ROLES: Role[] = [
    ROLE.COLLECTION_AGENT,
    ROLE.OPS_EXECUTIVE,
    ROLE.CREDIT_MANAGER,
    ROLE.FINANCE,
    ROLE.SUPER_ADMIN,
];

/** All internal NBFC staff (excludes CUSTOMER and AGENT) */
export const STAFF_ROLES: Role[] = [
    ROLE.OPS_EXECUTIVE,
    ROLE.CREDIT_MANAGER,
    ROLE.FINANCE,
    ROLE.COLLECTION_AGENT,
    ROLE.SUPER_ADMIN,
];

/** Staff who can generate and export MIS / RBI reports */
export const REPORT_ROLES: Role[] = [
    ROLE.FINANCE,
    ROLE.CREDIT_MANAGER,
    ROLE.SUPER_ADMIN,
];

/** Roles that can create loan applications (customer-facing) */
export const APPLICATION_ROLES: Role[] = [
    ROLE.CUSTOMER,
    ROLE.AGENT,
];

// ─── Role helpers ─────────────────────────────────────────────────────────────

/**
 * Returns true if roleA has equal or greater permissions than roleB.
 * SUPER_ADMIN always returns true.
 */
export function hasMinimumRole(roleA: Role, roleB: Role): boolean {
    if (roleA === ROLE.SUPER_ADMIN) return true;
    return ROLE_HIERARCHY[roleA] >= ROLE_HIERARCHY[roleB];
}

/**
 * Returns true if the role is an internal staff role
 * (not CUSTOMER or AGENT).
 */
export function isStaffRole(role: Role): boolean {
    return STAFF_ROLES.includes(role);
}

/**
 * Returns true if the role belongs to a customer-facing user
 * (CUSTOMER or AGENT).
 */
export function isCustomerFacingRole(role: Role): boolean {
    return role === ROLE.CUSTOMER || role === ROLE.AGENT;
}