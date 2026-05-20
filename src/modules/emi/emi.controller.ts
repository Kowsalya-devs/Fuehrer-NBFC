// src/modules/emi/emi.controller.ts
import type { Response, NextFunction } from 'express';
import { emiService } from './emi.service';
import { HTTP, ROLE } from '@/config/constants';
import { successResponse } from '@/types/common.types';
import {
    getValidatedParams,
    getValidatedQuery,
    getValidatedBody,
    getAuthUser,
} from '@/types/express.d';
import type { AuthRequest } from '@/types/express.d';
import { ForbiddenError } from '@/errors';
import { loansRepository } from '@/modules/loans';

const STAFF_ROLES = new Set([
    ROLE.OPS_EXECUTIVE,
    ROLE.CREDIT_MANAGER,
    ROLE.FINANCE,
    ROLE.SUPER_ADMIN,
    ROLE.COLLECTION_AGENT,
]);

// ─── Ownership guard ──────────────────────────────────────────────────────────
// Ensures the authenticated user owns the loan account being queried,
// or is a staff member who can access any account.

async function assertLoanAccountAccess(
    loanAccountId: string,
    userId: string,
    role: string,
): Promise<void> {
    if (STAFF_ROLES.has(role as typeof ROLE[keyof typeof ROLE])) return;
    const account = await loansRepository.findAccountByIdOrThrow(loanAccountId);
    if (account.userId !== userId) {
        throw new ForbiddenError('You can only view your own EMI schedule');
    }
}

export const emiController = {

    // GET /emi/:loanAccountId/schedule
    async getSchedule(req: AuthRequest, res: Response, next: NextFunction) {
        try {
            const user = getAuthUser(req);
            const { loanAccountId } =
                getValidatedParams<{ loanAccountId: string }>(req);

            await assertLoanAccountAccess(loanAccountId, user.id, user.role);

            const query = getValidatedQuery<{ status?: string; sortOrder?: string }>(req);
            const entries = await emiService.getSchedule({
                loanAccountId,
                status: query.status as any,
                sortOrder: query.sortOrder as any,
            });

            res.status(HTTP.OK).json(successResponse(entries));
        } catch (err) { next(err); }
    },

    // GET /emi/:loanAccountId/summary
    async getSummary(req: AuthRequest, res: Response, next: NextFunction) {
        try {
            const user = getAuthUser(req);
            const { loanAccountId } =
                getValidatedParams<{ loanAccountId: string }>(req);

            await assertLoanAccountAccess(loanAccountId, user.id, user.role);

            const summary = await emiService.getSummary(loanAccountId);
            res.status(HTTP.OK).json(successResponse(summary));
        } catch (err) { next(err); }
    },

    // GET /emi/:loanAccountId/foreclosure-quote
    async getForeclosureQuote(req: AuthRequest, res: Response, next: NextFunction) {
        try {
            const user = getAuthUser(req);
            const { loanAccountId } =
                getValidatedParams<{ loanAccountId: string }>(req);

            await assertLoanAccountAccess(loanAccountId, user.id, user.role);

            const quote = await emiService.getForeclosureQuote(loanAccountId);
            res.status(HTTP.OK).json(successResponse(quote));
        } catch (err) { next(err); }
    },

    // POST /emi/:emiId/waive  (Finance / Super Admin only)
    async waiveEmi(req: AuthRequest, res: Response, next: NextFunction) {
        try {
            const user = getAuthUser(req);
            const { emiId } = getValidatedParams<{ emiId: string }>(req);
            const body = getValidatedBody<{ reason: string }>(req);

            const result = await emiService.waiveEmi(
                { emiId, waivedBy: user.id, reason: body.reason },
                req,
            );

            res.status(HTTP.OK).json(successResponse(result, 'EMI waived'));
        } catch (err) { next(err); }
    },
};