// src/modules/collections/collections.routes.ts
import { Router } from 'express';
import { collectionsController } from './collections.controller';
import {
    requireAuth,
    allowRoles,
    validateBody,
    validateParams,
    validateQuery,
} from '@/middlewares';
import {
    logContactSchema,
    assignCaseSchema,
    escalateCaseSchema,
    closeCaseSchema,
    listCasesSchema,
    caseIdParamSchema,
    loanAccountParamSchema,
} from './collections.dto';
import { ROLE } from '@/config/constants';
import Joi from 'joi';

const router = Router();

const COLLECTION_STAFF = [
    ROLE.COLLECTION_AGENT,
    ROLE.OPS_EXECUTIVE,
    ROLE.SUPER_ADMIN,
    ROLE.FINANCE,
];

// ─── Portfolio overview ────────────────────────────────────────────────────────
router.get(
    '/portfolio',
    requireAuth(),
    allowRoles(ROLE.OPS_EXECUTIVE, ROLE.SUPER_ADMIN, ROLE.FINANCE),
    collectionsController.portfolio,
);

// ─── Case list ─────────────────────────────────────────────────────────────────
router.get(
    '/',
    requireAuth(),
    allowRoles(...COLLECTION_STAFF),
    validateQuery(listCasesSchema),
    collectionsController.list,
);

// ─── Case by loan account ──────────────────────────────────────────────────────
router.get(
    '/loan/:loanAccountId',
    requireAuth(),
    allowRoles(...COLLECTION_STAFF),
    validateParams(loanAccountParamSchema),
    collectionsController.getByLoanAccount,
);

// ─── Single case ───────────────────────────────────────────────────────────────
router.get(
    '/:caseId',
    requireAuth(),
    allowRoles(...COLLECTION_STAFF),
    validateParams(caseIdParamSchema),
    collectionsController.getOne,
);

// ─── Contact history ───────────────────────────────────────────────────────────
router.get(
    '/:caseId/contacts',
    requireAuth(),
    allowRoles(...COLLECTION_STAFF),
    validateParams(caseIdParamSchema),
    validateQuery(Joi.object({
        page: Joi.number().integer().min(1).default(1),
        limit: Joi.number().integer().min(1).max(100).default(20),
    })),
    collectionsController.getContacts,
);

// ─── Log contact attempt ───────────────────────────────────────────────────────
router.post(
    '/:caseId/contact',
    requireAuth(),
    allowRoles(ROLE.COLLECTION_AGENT, ROLE.OPS_EXECUTIVE, ROLE.SUPER_ADMIN),
    validateParams(caseIdParamSchema),
    validateBody(logContactSchema),
    collectionsController.logContact,
);

// ─── Assign / reassign case ────────────────────────────────────────────────────
router.post(
    '/:caseId/assign',
    requireAuth(),
    allowRoles(ROLE.OPS_EXECUTIVE, ROLE.SUPER_ADMIN),
    validateParams(caseIdParamSchema),
    validateBody(assignCaseSchema),
    collectionsController.assignCase,
);

// ─── Escalate case ─────────────────────────────────────────────────────────────
router.post(
    '/:caseId/escalate',
    requireAuth(),
    allowRoles(ROLE.OPS_EXECUTIVE, ROLE.SUPER_ADMIN),
    validateParams(caseIdParamSchema),
    validateBody(escalateCaseSchema),
    collectionsController.escalate,
);

// ─── Close / resolve case ──────────────────────────────────────────────────────
router.post(
    '/:caseId/close',
    requireAuth(),
    allowRoles(
        ROLE.OPS_EXECUTIVE,
        ROLE.COLLECTION_AGENT,
        ROLE.SUPER_ADMIN,
    ),
    validateParams(caseIdParamSchema),
    validateBody(closeCaseSchema),
    collectionsController.closeCase,
);

export { router as collectionsRouter };
