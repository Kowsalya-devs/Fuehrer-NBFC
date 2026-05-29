// src/modules/collections/collections.controller.ts
import type { Response, NextFunction } from 'express';
import { collectionsService } from './collections.service';
import { HTTP } from '@/config/constants';
import {
    successResponse,
    paginatedResponse,
    parsePagination,
} from '@/types/common.types';
import {
    getValidatedBody,
    getValidatedParams,
    getValidatedQuery,
    getAuthUser,
} from '@/types/express';
import type { AuthRequest } from '@/types/express';
import type {
    LogContactInput,
    AssignCaseInput,
    EscalateCaseInput,
    CloseCaseInput,
    ListCasesInput,
} from './collections.types';

export const collectionsController = {

    // GET /collections
    async list(req: AuthRequest, res: Response, next: NextFunction) {
        try {
            const user = getAuthUser(req);
            const query = getValidatedQuery<ListCasesInput>(req);
            const result = await collectionsService.listCases(
                query, user.id, user.role,
            );
            res.status(HTTP.OK).json(paginatedResponse(result));
        } catch (err) { next(err); }
    },

    // GET /collections/portfolio
    async portfolio(req: AuthRequest, res: Response, next: NextFunction) {
        try {
            const result = await collectionsService.getPortfolioSummary();
            res.status(HTTP.OK).json(successResponse(result));
        } catch (err) { next(err); }
    },

    // GET /collections/:caseId
    async getOne(req: AuthRequest, res: Response, next: NextFunction) {
        try {
            const user = getAuthUser(req);
            const { caseId } = getValidatedParams<{ caseId: string }>(req);
            const result = await collectionsService.getCase(
                caseId, user.id, user.role,
            );
            res.status(HTTP.OK).json(successResponse(result));
        } catch (err) { next(err); }
    },

    // GET /collections/loan/:loanAccountId
    async getByLoanAccount(req: AuthRequest, res: Response, next: NextFunction) {
        try {
            const { loanAccountId } =
                getValidatedParams<{ loanAccountId: string }>(req);
            const result = await collectionsService.getCaseByLoanAccount(loanAccountId);
            if (!result) {
                return res.status(HTTP.NOT_FOUND).json({
                    success: false,
                    errorCode: 'NOT_FOUND',
                    message: 'No open collection case for this loan account',
                });
            }
            res.status(HTTP.OK).json(successResponse(result));
        } catch (err) { next(err); }
    },

    // GET /collections/:caseId/contacts
    async getContacts(req: AuthRequest, res: Response, next: NextFunction) {
        try {
            const user = getAuthUser(req);
            const { caseId } = getValidatedParams<{ caseId: string }>(req);
            const query = getValidatedQuery<{ page?: number; limit?: number }>(req);
            const { page, limit } = parsePagination(query);
            const result = await collectionsService.getContactHistory(
                caseId, page, limit, user.id, user.role,
            );
            res.status(HTTP.OK).json(paginatedResponse(result));
        } catch (err) { next(err); }
    },

    // POST /collections/:caseId/contact
    async logContact(req: AuthRequest, res: Response, next: NextFunction) {
        try {
            const user = getAuthUser(req);
            const { caseId } = getValidatedParams<{ caseId: string }>(req);
            const body = getValidatedBody<Omit<LogContactInput, 'caseId' | 'loggedBy'>>(req);
            const input: LogContactInput = {
                caseId,
                loggedBy: user.id,
                ...body,
            };
            const result = await collectionsService.logContact(input, req);
            res.status(HTTP.CREATED).json(
                successResponse(result, 'Contact logged'),
            );
        } catch (err) { next(err); }
    },

    // POST /collections/:caseId/assign
    async assignCase(req: AuthRequest, res: Response, next: NextFunction) {
        try {
            const user = getAuthUser(req);
            const { caseId } = getValidatedParams<{ caseId: string }>(req);
            const body = getValidatedBody<{ assignTo: string; reason?: string }>(req);
            const input: AssignCaseInput = {
                caseId,
                assignTo: body.assignTo,
                assignedBy: user.id,
                reason: body.reason,
            };
            const result = await collectionsService.assignCase(input, req);
            res.status(HTTP.OK).json(successResponse(result, 'Case assigned'));
        } catch (err) { next(err); }
    },

    // POST /collections/:caseId/escalate
    async escalate(req: AuthRequest, res: Response, next: NextFunction) {
        try {
            const user = getAuthUser(req);
            const { caseId } = getValidatedParams<{ caseId: string }>(req);
            const body = getValidatedBody<{ reason: string; level: number }>(req);
            const input: EscalateCaseInput = {
                caseId,
                escalatedBy: user.id,
                reason: body.reason,
                level: body.level,
            };
            const result = await collectionsService.escalateCase(input, req);
            res.status(HTTP.OK).json(successResponse(result, 'Case escalated'));
        } catch (err) { next(err); }
    },

    // POST /collections/:caseId/close
    async closeCase(req: AuthRequest, res: Response, next: NextFunction) {
        try {
            const user = getAuthUser(req);
            const { caseId } = getValidatedParams<{ caseId: string }>(req);
            const body = getValidatedBody<{ reason: string; status: 'RESOLVED' | 'CLOSED' }>(req);
            const input: CloseCaseInput = {
                caseId,
                closedBy: user.id,
                reason: body.reason,
                status: body.status,
            };
            const result = await collectionsService.closeCase(input, req);
            res.status(HTTP.OK).json(successResponse(result, 'Case closed'));
        } catch (err) { next(err); }
    },
};
