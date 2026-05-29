// src/modules/emi/emi.routes.ts
import { Router } from 'express';
import Joi from 'joi';
import { emiController } from './emi.controller';
import {
    requireAuth,
    allowRoles,
    validateParams,
    validateQuery,
    validateBody,
} from '@/middlewares';
import { commonSchemas } from '@/middlewares';
import { EMI_STATUS, ROLE } from '@/config/constants';

const router = Router();

const loanAccountParam = Joi.object({
    loanAccountId: Joi.string().uuid({ version: 'uuidv4' }).required(),
});

const emiIdParam = Joi.object({
    emiId: Joi.string().uuid({ version: 'uuidv4' }).required(),
});

const scheduleQuery = Joi.object({
    status: Joi.string().valid(...Object.values(EMI_STATUS)).optional(),
    sortOrder: Joi.string().valid('asc', 'desc').default('asc'),
});

const waiveBody = Joi.object({
    reason: Joi.string().trim().min(10).max(500).required(),
});

// GET /emi/:loanAccountId/schedule
router.get(
    '/:loanAccountId/schedule',
    requireAuth(),
    validateParams(loanAccountParam),
    validateQuery(scheduleQuery),
    emiController.getSchedule,
);

// GET /emi/:loanAccountId/summary
router.get(
    '/:loanAccountId/summary',
    requireAuth(),
    validateParams(loanAccountParam),
    emiController.getSummary,
);

// GET /emi/:loanAccountId/foreclosure-quote
router.get(
    '/:loanAccountId/foreclosure-quote',
    requireAuth(),
    validateParams(loanAccountParam),
    emiController.getForeclosureQuote,
);

// POST /emi/:emiId/waive
router.post(
    '/:emiId/waive',
    requireAuth(),
    allowRoles(ROLE.FINANCE, ROLE.SUPER_ADMIN),
    validateParams(emiIdParam),
    validateBody(waiveBody),
    emiController.waiveEmi,
);

export { router as emiRouter };
