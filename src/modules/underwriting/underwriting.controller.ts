// src/modules/underwriting/underwriting.controller.ts
import type { Response, NextFunction } from 'express';
import { underwritingService } from './underwriting.service';
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
} from '@/types/express.d';
import type { AuthRequest } from '@/types/express.d';
import { loansRepository } from '@/modules/loans';
import type {
    RunUnderwritingInput,
    CreditManagerReviewInput,
    ListUnderwritingReportsInput,
} from './underwriting.types';

export const underwritingController = {

    // POST /underwriting/run/:loanId
    async run(req: AuthRequest, res: Response, next: NextFunction) {
        try {
            const { loanId } = getValidatedParams<{ loanId: string }>(req);

            // Fetch loan to get the parameters needed for underwriting
            const loan = await loansRepository.findApplicationByIdOrThrow(loanId);

            const input: RunUnderwritingInput = {
                loanId,
                userId: loan.userId,
                requestedAmount: loan.amountRequested,
                tenureMonths: loan.tenureMonths,
                productType: loan.productType,
            };

            const result = await underwritingService.runUnderwriting(input, req);
            res.status(HTTP.CREATED).json(
                successResponse(result, 'Underwriting assessment completed'),
            );
        } catch (err) { next(err); }
    },

    // POST /underwriting/:reportId/review
    async review(req: AuthRequest, res: Response, next: NextFunction) {
        try {
            const user = getAuthUser(req);
            const { reportId } = getValidatedParams<{ reportId: string }>(req);
            const body = getValidatedBody<{
                decision: 'APPROVED' | 'REJECTED';
                notes: string;
                overrideAmount?: number;
                overrideRate?: number;
                overrideTenure?: number;
            }>(req);

            const input: CreditManagerReviewInput = {
                reportId,
                reviewedBy: user.id,
                decision: body.decision,
                notes: body.notes,
                overrideAmount: body.overrideAmount,
                overrideRate: body.overrideRate,
                overrideTenure: body.overrideTenure,
            };

            const result = await underwritingService.creditManagerReview(input, req);
            res.status(HTTP.OK).json(
                successResponse(result, 'Review submitted'),
            );
        } catch (err) { next(err); }
    },

    // GET /underwriting/loan/:loanId
    async getByLoan(req: AuthRequest, res: Response, next: NextFunction) {
        try {
            const user = getAuthUser(req);
            const { loanId } = getValidatedParams<{ loanId: string }>(req);
            const result = await underwritingService.getReportByLoan(
                loanId, user.id, user.role,
            );
            res.status(HTTP.OK).json(successResponse(result));
        } catch (err) { next(err); }
    },

    // GET /underwriting/:reportId
    async getOne(req: AuthRequest, res: Response, next: NextFunction) {
        try {
            const user = getAuthUser(req);
            const { reportId } = getValidatedParams<{ reportId: string }>(req);
            const result = await underwritingService.getReport(reportId, user.role);
            res.status(HTTP.OK).json(successResponse(result));
        } catch (err) { next(err); }
    },

    // GET /underwriting
    async list(req: AuthRequest, res: Response, next: NextFunction) {
        try {
            const query = getValidatedQuery<{
                loanId?: string;
                decision?: string;
                page?: number;
                limit?: number;
            }>(req);
            const pagination = parsePagination(query);
            const input: ListUnderwritingReportsInput = {
                ...pagination,
                loanId: query.loanId,
                decision: query.decision as any,
            };
            const result = await underwritingService.listReports(input);
            res.status(HTTP.OK).json(paginatedResponse(result));
        } catch (err) { next(err); }
    },

    // POST /underwriting/rerun/:loanId
    async rerun(req: AuthRequest, res: Response, next: NextFunction) {
        try {
            const { loanId } = getValidatedParams<{ loanId: string }>(req);
            const result = await underwritingService.rerunUnderwriting(loanId, req);
            res.status(HTTP.CREATED).json(
                successResponse(result, 'Underwriting re-assessment completed'),
            );
        } catch (err) { next(err); }
    },
};