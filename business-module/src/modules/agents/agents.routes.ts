// src/modules/agents/agents.routes.ts
import { Router } from 'express';
import Joi from 'joi';
import { agentsController } from './agents.controller';
import {
    requireAuth,
    allowRoles,
    validateBody,
    validateParams,
    validateQuery,
} from '@/middlewares';
import {
    onboardAgentSchema,
    updateAgentSchema,
    suspendAgentSchema,
    listAgentsSchema,
    listCommissionsSchema,
    agentIdParamSchema,
} from './agents.dto';
import { ROLE } from '@/config/constants';

const router = Router();

// ─── Agent self-service routes ────────────────────────────────────────────────

// Onboard as agent (any authenticated user can apply)
router.post(
    '/onboard',
    requireAuth(),
    validateBody(onboardAgentSchema),
    agentsController.onboard,
);

// Agent views own profile
router.get(
    '/me',
    requireAuth(),
    allowRoles(ROLE.AGENT),
    agentsController.getMe,
);

// Agent views own dashboard
router.get(
    '/me/dashboard',
    requireAuth(),
    allowRoles(ROLE.AGENT),
    agentsController.myDashboard,
);

// Agent views own commissions
router.get(
    '/me/commissions',
    requireAuth(),
    allowRoles(ROLE.AGENT),
    validateQuery(listCommissionsSchema),
    agentsController.myCommissions,
);

// Agent updates own profile
router.patch(
    '/me',
    requireAuth(),
    allowRoles(ROLE.AGENT),
    validateBody(updateAgentSchema),
    async (req, res, next) => {
        // Redirect to /agents/:agentId using the agent's ID from their profile
        const { agentsService } = await import('./agents.service');
        const { getAuthUser } = await import('@/types/express');
        try {
            const user = getAuthUser(req);
            const agent = await agentsService.getAgentByUserId(user.id);
            if (!agent) return res.status(404).json({ success: false, message: 'Agent not found' });
            req.params.agentId = agent.id;
            agentsController.update(req as any, res, next);
        } catch (err) { next(err); }
    },
);

// ─── Staff read routes ────────────────────────────────────────────────────────

// List all agents
router.get(
    '/',
    requireAuth(),
    allowRoles(
        ROLE.OPS_EXECUTIVE,
        ROLE.CREDIT_MANAGER,
        ROLE.SUPER_ADMIN,
        ROLE.FINANCE,
    ),
    validateQuery(listAgentsSchema),
    agentsController.list,
);

// Get agent by ID
router.get(
    '/:agentId',
    requireAuth(),
    allowRoles(
        ROLE.OPS_EXECUTIVE,
        ROLE.CREDIT_MANAGER,
        ROLE.SUPER_ADMIN,
        ROLE.FINANCE,
    ),
    validateParams(agentIdParamSchema),
    agentsController.getOne,
);

// Get agent dashboard
router.get(
    '/:agentId/dashboard',
    requireAuth(),
    allowRoles(
        ROLE.OPS_EXECUTIVE,
        ROLE.SUPER_ADMIN,
        ROLE.FINANCE,
    ),
    validateParams(agentIdParamSchema),
    agentsController.getDashboard,
);

// Get agent commissions
router.get(
    '/:agentId/commissions',
    requireAuth(),
    allowRoles(
        ROLE.OPS_EXECUTIVE,
        ROLE.SUPER_ADMIN,
        ROLE.FINANCE,
    ),
    validateParams(agentIdParamSchema),
    validateQuery(listCommissionsSchema),
    agentsController.getCommissions,
);

// ─── Staff mutation routes ────────────────────────────────────────────────────

// Activate pending agent
router.post(
    '/:agentId/activate',
    requireAuth(),
    allowRoles(ROLE.OPS_EXECUTIVE, ROLE.SUPER_ADMIN),
    validateParams(agentIdParamSchema),
    agentsController.activate,
);

// Suspend active agent
router.post(
    '/:agentId/suspend',
    requireAuth(),
    allowRoles(ROLE.OPS_EXECUTIVE, ROLE.SUPER_ADMIN),
    validateParams(agentIdParamSchema),
    validateBody(suspendAgentSchema),
    agentsController.suspend,
);

// Reactivate suspended agent
router.post(
    '/:agentId/reactivate',
    requireAuth(),
    allowRoles(ROLE.OPS_EXECUTIVE, ROLE.SUPER_ADMIN),
    validateParams(agentIdParamSchema),
    agentsController.reactivate,
);

// Terminate agent (permanent — no reversal)
router.post(
    '/:agentId/terminate',
    requireAuth(),
    allowRoles(ROLE.SUPER_ADMIN),
    validateParams(agentIdParamSchema),
    validateBody(suspendAgentSchema),
    agentsController.terminate,
);

// Update agent profile
router.patch(
    '/:agentId',
    requireAuth(),
    allowRoles(ROLE.OPS_EXECUTIVE, ROLE.SUPER_ADMIN),
    validateParams(agentIdParamSchema),
    validateBody(updateAgentSchema),
    agentsController.update,
);

// Process commission payout
router.post(
    '/:agentId/payout',
    requireAuth(),
    allowRoles(ROLE.FINANCE, ROLE.SUPER_ADMIN),
    validateParams(agentIdParamSchema),
    agentsController.processPayout,
);

// ─── Frontend alias routes ─────────────────────────────────────────────────────

// GET /agent/loans → agent's assigned loans
router.get(
    '/agent/loans',
    requireAuth(),
    allowRoles(ROLE.AGENT),
    agentsController.getMe,
);

// GET /agent/overdue → overdue accounts for agent
router.get(
    '/agent/overdue',
    requireAuth(),
    allowRoles(ROLE.AGENT),
    agentsController.myDashboard,
);

// GET /agent/dashboard
router.get(
    '/agent/dashboard',
    requireAuth(),
    allowRoles(ROLE.AGENT),
    agentsController.myDashboard,
);

export { router as agentsRouter };
