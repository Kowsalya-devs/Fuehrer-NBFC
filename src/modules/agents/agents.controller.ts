// src/modules/agents/agents.controller.ts
import type { Response, NextFunction } from 'express';
import { agentsService } from './agents.service';
import { HTTP, ROLE } from '@/config/constants';
import {
    successResponse,
    paginatedResponse,
} from '@/types/common.types';
import {
    getValidatedBody,
    getValidatedParams,
    getValidatedQuery,
    getAuthUser,
} from '@/types/express.d';
import type { AuthRequest } from '@/types/express.d';
import type {
    OnboardAgentInput,
    UpdateAgentInput,
    SuspendAgentInput,
    ListAgentsInput,
    ListCommissionsInput,
} from './agents.types';

export const agentsController = {

    // POST /agents/onboard
    async onboard(req: AuthRequest, res: Response, next: NextFunction) {
        try {
            const user = getAuthUser(req);
            const body = getValidatedBody<Omit<OnboardAgentInput, 'userId'>>(req);
            const result = await agentsService.onboardAgent(
                { ...body, userId: user.id },
                req,
            );
            res.status(HTTP.CREATED).json(
                successResponse(result, 'Agent onboarded successfully'),
            );
        } catch (err) { next(err); }
    },

    // GET /agents/me
    async getMe(req: AuthRequest, res: Response, next: NextFunction) {
        try {
            const user = getAuthUser(req);
            const result = await agentsService.getAgentByUserId(user.id);
            if (!result) {
                return res.status(HTTP.NOT_FOUND).json({
                    success: false,
                    errorCode: 'AGENT_NOT_FOUND',
                    message: 'No agent profile found for this user',
                });
            }
            res.status(HTTP.OK).json(successResponse(result));
        } catch (err) { next(err); }
    },

    // GET /agents/me/dashboard
    async myDashboard(req: AuthRequest, res: Response, next: NextFunction) {
        try {
            const user = getAuthUser(req);
            const agent = await agentsService.getAgentByUserId(user.id);
            if (!agent) {
                return res.status(HTTP.NOT_FOUND).json({
                    success: false,
                    errorCode: 'AGENT_NOT_FOUND',
                    message: 'No agent profile found for this user',
                });
            }
            const result = await agentsService.getDashboard(
                agent.id, user.id, user.role,
            );
            res.status(HTTP.OK).json(successResponse(result));
        } catch (err) { next(err); }
    },

    // GET /agents/me/commissions
    async myCommissions(req: AuthRequest, res: Response, next: NextFunction) {
        try {
            const user = getAuthUser(req);
            const query = getValidatedQuery<ListCommissionsInput>(req);
            const result = await agentsService.listCommissions(
                undefined, query, user.id, user.role,
            );
            res.status(HTTP.OK).json(paginatedResponse(result));
        } catch (err) { next(err); }
    },

    // GET /agents/:agentId
    async getOne(req: AuthRequest, res: Response, next: NextFunction) {
        try {
            const user = getAuthUser(req);
            const { agentId } = getValidatedParams<{ agentId: string }>(req);
            const result = await agentsService.getAgent(agentId, user.id, user.role);
            res.status(HTTP.OK).json(successResponse(result));
        } catch (err) { next(err); }
    },

    // GET /agents/:agentId/dashboard
    async getDashboard(req: AuthRequest, res: Response, next: NextFunction) {
        try {
            const user = getAuthUser(req);
            const { agentId } = getValidatedParams<{ agentId: string }>(req);
            const result = await agentsService.getDashboard(
                agentId, user.id, user.role,
            );
            res.status(HTTP.OK).json(successResponse(result));
        } catch (err) { next(err); }
    },

    // GET /agents/:agentId/commissions
    async getCommissions(req: AuthRequest, res: Response, next: NextFunction) {
        try {
            const user = getAuthUser(req);
            const { agentId } = getValidatedParams<{ agentId: string }>(req);
            const query = getValidatedQuery<ListCommissionsInput>(req);
            const result = await agentsService.listCommissions(
                agentId, query, user.id, user.role,
            );
            res.status(HTTP.OK).json(paginatedResponse(result));
        } catch (err) { next(err); }
    },

    // PATCH /agents/:agentId
    async update(req: AuthRequest, res: Response, next: NextFunction) {
        try {
            const user = getAuthUser(req);
            const { agentId } = getValidatedParams<{ agentId: string }>(req);
            const body = getValidatedBody<UpdateAgentInput>(req);
            const result = await agentsService.updateProfile(
                agentId, user.id, user.role, body, req,
            );
            res.status(HTTP.OK).json(successResponse(result, 'Profile updated'));
        } catch (err) { next(err); }
    },

    // GET /agents
    async list(req: AuthRequest, res: Response, next: NextFunction) {
        try {
            const query = getValidatedQuery<ListAgentsInput>(req);
            const result = await agentsService.listAgents(query);
            res.status(HTTP.OK).json(paginatedResponse(result));
        } catch (err) { next(err); }
    },

    // POST /agents/:agentId/activate
    async activate(req: AuthRequest, res: Response, next: NextFunction) {
        try {
            const user = getAuthUser(req);
            const { agentId } = getValidatedParams<{ agentId: string }>(req);
            const result = await agentsService.activateAgent(
                agentId, user.id, req,
            );
            res.status(HTTP.OK).json(successResponse(result, 'Agent activated'));
        } catch (err) { next(err); }
    },

    // POST /agents/:agentId/suspend
    async suspend(req: AuthRequest, res: Response, next: NextFunction) {
        try {
            const user = getAuthUser(req);
            const { agentId } = getValidatedParams<{ agentId: string }>(req);
            const body = getValidatedBody<{ reason: string }>(req);
            const input: SuspendAgentInput = {
                agentId,
                suspendedBy: user.id,
                reason: body.reason,
            };
            const result = await agentsService.suspendAgent(input, req);
            res.status(HTTP.OK).json(successResponse(result, 'Agent suspended'));
        } catch (err) { next(err); }
    },

    // POST /agents/:agentId/reactivate
    async reactivate(req: AuthRequest, res: Response, next: NextFunction) {
        try {
            const user = getAuthUser(req);
            const { agentId } = getValidatedParams<{ agentId: string }>(req);
            const result = await agentsService.reactivateAgent(
                agentId, user.id, req,
            );
            res.status(HTTP.OK).json(
                successResponse(result, 'Agent reactivated'),
            );
        } catch (err) { next(err); }
    },

    // POST /agents/:agentId/terminate
    async terminate(req: AuthRequest, res: Response, next: NextFunction) {
        try {
            const user = getAuthUser(req);
            const { agentId } = getValidatedParams<{ agentId: string }>(req);
            const body = getValidatedBody<{ reason: string }>(req);
            const result = await agentsService.terminateAgent(
                agentId, user.id, body.reason, req,
            );
            res.status(HTTP.OK).json(successResponse(result, 'Agent terminated'));
        } catch (err) { next(err); }
    },

    // POST /agents/:agentId/payout
    async processPayout(req: AuthRequest, res: Response, next: NextFunction) {
        try {
            const user = getAuthUser(req);
            const { agentId } = getValidatedParams<{ agentId: string }>(req);
            const result = await agentsService.processPayout(
                { agentId, processedBy: user.id },
                req,
            );
            res.status(HTTP.CREATED).json(
                successResponse(result, 'Commission payout initiated'),
            );
        } catch (err) { next(err); }
    },
};