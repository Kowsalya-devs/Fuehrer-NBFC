// src/modules/reports/reports.routes.ts
import { Router } from 'express';
import Joi from 'joi';
import { reportsController } from './reports.controller';
import {
    requireAuth,
    allowRoles,
    validateQuery,
} from '@/middlewares';
import { ROLE } from '@/config/constants';

const router = Router();

const dateRangeQuery = Joi.object({
    fromDate: Joi.date().iso().optional(),
    toDate: Joi.date().iso().optional(),
    format: Joi.string().valid('json', 'csv').default('json'),
    refresh: Joi.string().valid('true', 'false').default('false'),
});

const portfolioQuery = dateRangeQuery;

const collectionQuery = dateRangeQuery.append({
    agentId: Joi.string().uuid({ version: 'uuidv4' }).optional(),
});

const rbiQuery = Joi.object({
    reportType: Joi.string()
        .valid(
            'NPA_CLASSIFICATION',
            'LOAN_DISBURSEMENT',
            'REPAYMENT_SCHEDULE',
            'CREDIT_INFORMATION',
        )
        .default('NPA_CLASSIFICATION'),
    periodEnd: Joi.date().iso().optional(),
    format: Joi.string().valid('json', 'csv').default('json'),
    refresh: Joi.string().valid('true', 'false').default('false'),
});

// ── Portfolio MIS ──────────────────────────────────────────────────────────────
router.get(
    '/portfolio',
    requireAuth(),
    allowRoles(
        ROLE.FINANCE,
        ROLE.SUPER_ADMIN,
        ROLE.CREDIT_MANAGER,
    ),
    validateQuery(portfolioQuery),
    reportsController.portfolioMIS,
);

// ── Collection efficiency ──────────────────────────────────────────────────────
router.get(
    '/collection-efficiency',
    requireAuth(),
    allowRoles(
        ROLE.FINANCE,
        ROLE.SUPER_ADMIN,
        ROLE.OPS_EXECUTIVE,
    ),
    validateQuery(collectionQuery),
    reportsController.collectionEfficiency,
);

// ── RBI regulatory return ──────────────────────────────────────────────────────
router.get(
    '/rbi-return',
    requireAuth(),
    allowRoles(ROLE.FINANCE, ROLE.SUPER_ADMIN),
    validateQuery(rbiQuery),
    reportsController.rbiReturn,
);

export { router as reportsRouter };