// src/modules/disbursement/disbursement.routes.ts
import { Router } from 'express';
import { disbursementController } from './disbursement.controller';
import {
    requireAuth,
    allowRoles,
    validateBody,
    validateParams,
    disbursementLimiter,
} from '@/middlewares';
import {
    initiateDisbursementSchema,
    loanIdParamSchema,
    disbursementIdParamSchema,
} from './disbursement.dto';
import { ROLE } from '@/config/constants';

const router = Router();

// ─── Finance / Ops routes ─────────────────────────────────────────────────────

// Pre-flight checklist — run before initiating to see what's blocking
router.get(
    '/checklist/:loanId',
    requireAuth(),
    allowRoles(ROLE.FINANCE, ROLE.SUPER_ADMIN),
    validateParams(loanIdParamSchema),
    disbursementController.checklist,
);

// Initiate disbursement
router.post(
    '/initiate/:loanId',
    requireAuth(),
    allowRoles(ROLE.FINANCE, ROLE.SUPER_ADMIN),
    disbursementLimiter,
    validateParams(loanIdParamSchema),
    validateBody(initiateDisbursementSchema),
    disbursementController.initiate,
);

// Retry a failed disbursement
router.post(
    '/:disbursementId/retry',
    requireAuth(),
    allowRoles(ROLE.FINANCE, ROLE.SUPER_ADMIN),
    disbursementLimiter,
    validateParams(disbursementIdParamSchema),
    disbursementController.retry,
);

// ─── Read routes (ops + finance) ──────────────────────────────────────────────

router.get(
    '/loan/:loanId',
    requireAuth(),
    allowRoles(
        ROLE.FINANCE,
        ROLE.OPS_EXECUTIVE,
        ROLE.CREDIT_MANAGER,
        ROLE.SUPER_ADMIN,
    ),
    validateParams(loanIdParamSchema),
    disbursementController.getByLoan,
);

router.get(
    '/:disbursementId',
    requireAuth(),
    allowRoles(
        ROLE.FINANCE,
        ROLE.OPS_EXECUTIVE,
        ROLE.CREDIT_MANAGER,
        ROLE.SUPER_ADMIN,
    ),
    validateParams(disbursementIdParamSchema),
    disbursementController.getOne,
);

export { router as disbursementRouter };