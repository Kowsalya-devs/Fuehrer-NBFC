// src/modules/underwriting/underwriting.routes.ts
import { Router } from 'express';
import Joi from 'joi';
import { underwritingController } from './underwriting.controller';
import {
    requireAuth,
    allowRoles,
    validateParams,
    validateBody,
    validateQuery,
} from '@/middlewares';
import { ROLE } from '@/config/constants';

const router = Router();

// ─── Param schemas ────────────────────────────────────────────────────────────

const loanIdParam = Joi.object({
    loanId: Joi.string().uuid({ version: 'uuidv4' }).required(),
});

const reportIdParam = Joi.object({
    reportId: Joi.string().uuid({ version: 'uuidv4' }).required(),
});

// ─── Body schemas ─────────────────────────────────────────────────────────────

const reviewBody = Joi.object({
    decision: Joi.string().valid('APPROVED', 'REJECTED').required(),

    notes: Joi.string().trim().min(10).max(1000).required()
        .messages({ 'string.min': 'Review notes must be at least 10 characters' }),

    overrideAmount: Joi.number().positive().precision(2).optional(),

    overrideRate: Joi.number().positive().max(36).precision(2).optional()
        .messages({ 'number.max': 'Override rate cannot exceed 36% per annum' }),

    overrideTenure: Joi.number().integer().min(1).max(36).optional(),
});

// ─── Query schemas ────────────────────────────────────────────────────────────

const listQuery = Joi.object({
    loanId: Joi.string().uuid({ version: 'uuidv4' }).optional(),
    decision: Joi.string()
        .valid('APPROVED', 'REJECTED', 'REFERRED', 'PENDING')
        .optional(),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
});

// ─── Routes ───────────────────────────────────────────────────────────────────

// Run underwriting assessment for a loan
// Called by ops executive after KYC completes
router.post(
    '/run/:loanId',
    requireAuth(),
    allowRoles(ROLE.OPS_EXECUTIVE, ROLE.SUPER_ADMIN),
    validateParams(loanIdParam),
    underwritingController.run,
);

// Re-run assessment (e.g. after updated bank statement)
router.post(
    '/rerun/:loanId',
    requireAuth(),
    allowRoles(ROLE.OPS_EXECUTIVE, ROLE.CREDIT_MANAGER, ROLE.SUPER_ADMIN),
    validateParams(loanIdParam),
    underwritingController.rerun,
);

// Credit manager reviews a REFERRED report
router.post(
    '/:reportId/review',
    requireAuth(),
    allowRoles(ROLE.CREDIT_MANAGER, ROLE.SUPER_ADMIN),
    validateParams(reportIdParam),
    validateBody(reviewBody),
    underwritingController.review,
);

// Get latest report for a specific loan
router.get(
    '/loan/:loanId',
    requireAuth(),
    allowRoles(
        ROLE.OPS_EXECUTIVE,
        ROLE.CREDIT_MANAGER,
        ROLE.FINANCE,
        ROLE.SUPER_ADMIN,
    ),
    validateParams(loanIdParam),
    underwritingController.getByLoan,
);

// Get a specific report by ID
router.get(
    '/:reportId',
    requireAuth(),
    allowRoles(
        ROLE.OPS_EXECUTIVE,
        ROLE.CREDIT_MANAGER,
        ROLE.FINANCE,
        ROLE.SUPER_ADMIN,
    ),
    validateParams(reportIdParam),
    underwritingController.getOne,
);

// List reports with filters
router.get(
    '/',
    requireAuth(),
    allowRoles(
        ROLE.OPS_EXECUTIVE,
        ROLE.CREDIT_MANAGER,
        ROLE.FINANCE,
        ROLE.SUPER_ADMIN,
    ),
    validateQuery(listQuery),
    underwritingController.list,
);

export { router as underwritingRouter };
