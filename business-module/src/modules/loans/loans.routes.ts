// src/modules/loans/loans.routes.ts
import { Router } from 'express';
import { loansController } from './loans.controller';
import {
    requireAuth,
    allowRoles,
    validateBody,
    validateQuery,
    validateParams,
    loanApplicationLimiter,
} from '@/middlewares';
import {
    createLoanSchema,
    emiPreviewSchema,
    approveLoanSchema,
    rejectLoanSchema,
    listLoansQuerySchema,
    loanIdParamSchema,
} from './loans.dto';
import { commonSchemas } from '@/middlewares';
import { ROLE } from '@/config/constants';

const router = Router();

// ─── Public / light-auth ──────────────────────────────────────────────────────

// EMI preview — no auth needed (used on product landing page)
router.get(
    '/emi-preview',
    validateQuery(emiPreviewSchema),
    loansController.emiPreview,
);

// Gold loan rate — no auth needed (used on Gold Loan Estimator screen)
router.get(
    '/gold/rate',
    loansController.goldRate,
);

// Gold loan estimator — calculate max loan from weight + purity
router.get(
    '/gold/estimate',
    loansController.goldEstimate,
);

// ─── Customer routes ──────────────────────────────────────────────────────────

// Create new loan application
router.post(
    '/',
    requireAuth(),
    allowRoles(ROLE.CUSTOMER, ROLE.AGENT),
    loanApplicationLimiter,
    validateBody(createLoanSchema),
    loansController.create,
);

// Submit draft application
router.post(
    '/:id/submit',
    requireAuth(),
    allowRoles(ROLE.CUSTOMER, ROLE.AGENT),
    validateParams(loanIdParamSchema),
    loansController.submit,
);

// Customer's own loan accounts
router.get(
    '/my-accounts',
    requireAuth(),
    allowRoles(ROLE.CUSTOMER),
    loansController.myAccounts,
);

// ─── Frontend alias routes ────────────────────────────────────────────────────
// The frontend calls these paths — aliased to the canonical backend routes
// so both the app and API docs work without breaking either.

// GET /loans/active → alias for GET /loans/my-accounts
// Frontend realLoanService calls GET /loans/active for the customer home screen
router.get(
    '/active',
    requireAuth(),
    allowRoles(ROLE.CUSTOMER),
    loansController.myAccounts,
);

// GET /loans/my → alias for GET /loans/my-accounts
// Used by some frontend screens as a shorter path
router.get(
    '/my',
    requireAuth(),
    allowRoles(ROLE.CUSTOMER),
    loansController.myAccounts,
);

// GET /loans/:id/emi → alias for EMI schedule
// Frontend calls GET /loans/{id}/emi to show the repayment schedule.
// TODO: add loansController.emiSchedule handler that queries emi_schedule
// table by loan_account_id. For now routes to getAccount which includes
// the account summary — replace with dedicated emiSchedule handler.
router.get(
    '/:id/emi',
    requireAuth(),
    validateParams(loanIdParamSchema),
    loansController.getAccount, // TODO: replace with loansController.emiSchedule
);

// GET /loans/:id/emi-schedule → canonical EMI schedule route (matches API docs)
router.get(
    '/:id/emi-schedule',
    requireAuth(),
    validateParams(loanIdParamSchema),
    loansController.getAccount, // TODO: replace with loansController.emiSchedule
);

// ─── Shared read routes ───────────────────────────────────────────────────────

// List applications (customers see own, staff see all with filters)
router.get(
    '/',
    requireAuth(),
    validateQuery(listLoansQuerySchema),
    loansController.list,
);

// Get single application
router.get(
    '/:id',
    requireAuth(),
    validateParams(loanIdParamSchema),
    loansController.getOne,
);

// Get loan account by ID
router.get(
    '/accounts/:id',
    requireAuth(),
    validateParams(commonSchemas.uuidParam),
    loansController.getAccount,
);

// ─── Credit Manager routes ────────────────────────────────────────────────────

// Approve loan
router.post(
    '/:id/approve',
    requireAuth(),
    allowRoles(ROLE.CREDIT_MANAGER),
    validateParams(loanIdParamSchema),
    validateBody(approveLoanSchema),
    loansController.approve,
);

// Reject loan
router.post(
    '/:id/reject',
    requireAuth(),
    allowRoles(
        ROLE.CREDIT_MANAGER,
        ROLE.SUPER_ADMIN,
    ),
    validateParams(loanIdParamSchema),
    validateBody(rejectLoanSchema),
    loansController.reject,
);

export { router as loansRouter };
