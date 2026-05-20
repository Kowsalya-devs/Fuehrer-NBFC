// src/modules/payments/payments.routes.ts
import { Router } from 'express';
import Joi from 'joi';
import { paymentsController } from './payments.controller';
import {
    requireAuth,
    allowRoles,
    validateBody,
    validateParams,
    validateQuery,
} from '@/middlewares';
import {
    createMandateSchema,
    paymentLinkSchema,
    recordCashPaymentSchema,
    listPaymentsSchema,
    loanAccountIdParamSchema,
    paymentIdParamSchema,
} from './payments.dto';
import { ROLE } from '@/config/constants';

const router = Router();

// ─── Customer routes ──────────────────────────────────────────────────────────

// Register eNACH mandate
router.post(
    '/mandate',
    requireAuth(),
    allowRoles(ROLE.CUSTOMER),
    validateBody(createMandateSchema),
    paymentsController.createMandate,
);

// View mandate for own loan account
router.get(
    '/mandate/:loanAccountId',
    requireAuth(),
    validateParams(loanAccountIdParamSchema),
    paymentsController.getMandate,
);

// View payments for own loan account
router.get(
    '/:loanAccountId',
    requireAuth(),
    validateParams(loanAccountIdParamSchema),
    validateQuery(listPaymentsSchema),
    paymentsController.listByAccount,
);

// ─── Staff routes ─────────────────────────────────────────────────────────────

// Generate manual payment link (ops / collection)
router.post(
    '/link',
    requireAuth(),
    allowRoles(
        ROLE.OPS_EXECUTIVE,
        ROLE.COLLECTION_AGENT,
        ROLE.SUPER_ADMIN,
    ),
    validateBody(paymentLinkSchema),
    paymentsController.createPaymentLink,
);

// Record cash payment (collection agents)
router.post(
    '/cash',
    requireAuth(),
    allowRoles(ROLE.COLLECTION_AGENT, ROLE.SUPER_ADMIN),
    validateBody(recordCashPaymentSchema),
    paymentsController.recordCash,
);

// Get single payment record
router.get(
    '/record/:paymentId',
    requireAuth(),
    allowRoles(
        ROLE.OPS_EXECUTIVE,
        ROLE.FINANCE,
        ROLE.CREDIT_MANAGER,
        ROLE.SUPER_ADMIN,
        ROLE.COLLECTION_AGENT,
    ),
    validateParams(paymentIdParamSchema),
    paymentsController.getOne,
);

export { router as paymentsRouter };