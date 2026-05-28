// src/modules/audit/audit.routes.ts
import { Router } from 'express';
import Joi from 'joi';
import { auditController } from './audit.controller';
import {
    requireAuth,
    allowRoles,
    validateParams,
    validateQuery,
} from '@/middlewares';
import { ROLE } from '@/config/constants';

const router = Router();

// ─── Only Super Admin and Finance can access audit logs ───────────────────────
const AUDIT_ROLES = [ROLE.SUPER_ADMIN, ROLE.FINANCE];

// ─── Query schemas ─────────────────────────────────────────────────────────────

const listAuditQuery = Joi.object({
    entityType: Joi.string().max(100).optional(),
    entityId: Joi.string().uuid({ version: 'uuidv4' }).optional(),
    userId: Joi.string().uuid({ version: 'uuidv4' }).optional(),
    action: Joi.string().max(100).optional(),
    fromDate: Joi.date().iso().optional(),
    toDate: Joi.date().iso().optional(),
    sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(500).default(50),
});

const trailQuery = Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(200).default(50),
});

const userActivityQuery = Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(200).default(50),
    fromDate: Joi.date().iso().optional(),
    toDate: Joi.date().iso().optional(),
});

const exportQuery = Joi.object({
    fromDate: Joi.date().iso().required(),
    toDate: Joi.date().iso()
        .min(Joi.ref('fromDate'))
        .required(),
    entityType: Joi.string().max(100).optional(),
    action: Joi.string().max(100).optional(),
    format: Joi.string().valid('json', 'csv').default('json'),
});

const trailParams = Joi.object({
    entityType: Joi.string().max(100).required(),
    entityId: Joi.string().uuid({ version: 'uuidv4' }).required(),
});

const userIdParam = Joi.object({
    userId: Joi.string().uuid({ version: 'uuidv4' }).required(),
});

const requestIdParam = Joi.object({
    requestId: Joi.string().uuid({ version: 'uuidv4' }).required(),
});

const auditIdParam = Joi.object({
    id: Joi.string().uuid({ version: 'uuidv4' }).required(),
});

// ─── Routes ───────────────────────────────────────────────────────────────────

// Statistics summary
router.get(
    '/stats',
    requireAuth(),
    allowRoles(...AUDIT_ROLES),
    auditController.stats,
);

// Compliance export (streaming)
router.get(
    '/export',
    requireAuth(),
    allowRoles(...AUDIT_ROLES),
    validateQuery(exportQuery),
    auditController.export,
);

// Entity audit trail — full history of one record
router.get(
    '/trail/:entityType/:entityId',
    requireAuth(),
    allowRoles(...AUDIT_ROLES),
    validateParams(trailParams),
    validateQuery(trailQuery),
    auditController.entityTrail,
);

// User activity — everything one user has done
router.get(
    '/user/:userId',
    requireAuth(),
    allowRoles(...AUDIT_ROLES),
    validateParams(userIdParam),
    validateQuery(userActivityQuery),
    auditController.userActivity,
);

// Request trace — all audit entries for one HTTP request
router.get(
    '/request/:requestId',
    requireAuth(),
    allowRoles(...AUDIT_ROLES),
    validateParams(requestIdParam),
    auditController.requestTrace,
);

// List with full filter support
router.get(
    '/',
    requireAuth(),
    allowRoles(...AUDIT_ROLES),
    validateQuery(listAuditQuery),
    auditController.list,
);

// Single entry by ID
router.get(
    '/:id',
    requireAuth(),
    allowRoles(...AUDIT_ROLES),
    validateParams(auditIdParam),
    auditController.getOne,
);

// No POST, PATCH, DELETE routes — intentionally omitted
// Audit records are written only by the system, never by API consumers

export { router as auditRouter };
