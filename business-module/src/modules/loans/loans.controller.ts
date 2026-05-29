// src/modules/loans/loans.controller.ts
import type { Response, NextFunction } from 'express';
import { loansService } from './loans.service';
import { HTTP, ROLE } from '@/config/constants';
import {
    successResponse,
    paginatedResponse,
} from '@/types/common.types';
import {
    getValidatedBody,
    getValidatedQuery,
    getValidatedParams,
    getAuthUser,
} from '@/types/express';
import type { AuthRequest } from '@/types/express';
import type {
    CreateLoanApplicationInput,
    ApproveLoanInput,
    RejectLoanInput,
    ListLoansInput,
    EmiPreviewInput,
} from './loans.types';

export const loansController = {

    // GET /loans/emi-preview?amount=X&tenureMonths=Y&interestRate=Z
    async emiPreview(req: AuthRequest, res: Response, next: NextFunction) {
        try {
            const query = getValidatedQuery<EmiPreviewInput>(req);
            const result = loansService.previewEmi(query);
            res.status(HTTP.OK).json(successResponse(result));
        } catch (err) { next(err); }
    },

    // POST /loans
    async create(req: AuthRequest, res: Response, next: NextFunction) {
        try {
            const user = getAuthUser(req);
            const body = getValidatedBody<Omit<CreateLoanApplicationInput,
                'userId' | 'agentId'>>(req);

            const input: CreateLoanApplicationInput = {
                ...body,
                userId: user.id,
                agentId: user.role === ROLE.AGENT ? (user.agentId ?? null) : null,
            };

            const result = await loansService.createApplication(input, req);
            res.status(HTTP.CREATED).json(
                successResponse(result, 'Loan application created'),
            );
        } catch (err) { next(err); }
    },

    // POST /loans/:id/submit
    async submit(req: AuthRequest, res: Response, next: NextFunction) {
        try {
            const user = getAuthUser(req);
            const { id } = getValidatedParams<{ id: string }>(req);
            const result = await loansService.submitApplication(id, user.id, req);
            res.status(HTTP.OK).json(
                successResponse(result, 'Application submitted for processing'),
            );
        } catch (err) { next(err); }
    },

    // GET /loans/:id
    async getOne(req: AuthRequest, res: Response, next: NextFunction) {
        try {
            const user = getAuthUser(req);
            const { id } = getValidatedParams<{ id: string }>(req);
            const result = await loansService.getApplication(id, user.id, user.role);
            res.status(HTTP.OK).json(successResponse(result));
        } catch (err) { next(err); }
    },

    // GET /loans
    async list(req: AuthRequest, res: Response, next: NextFunction) {
        try {
            const user = getAuthUser(req);
            const query = getValidatedQuery<ListLoansInput>(req);

            // Customers only see their own — staff can filter by userId
            const filters: ListLoansInput = {
                ...query,
                userId: user.role === ROLE.CUSTOMER ? user.id : query.userId,
            };

            const result = await loansService.listApplications(filters);
            res.status(HTTP.OK).json(paginatedResponse(result));
        } catch (err) { next(err); }
    },

    // POST /loans/:id/approve
    async approve(req: AuthRequest, res: Response, next: NextFunction) {
        try {
            const user = getAuthUser(req);
            const { id } = getValidatedParams<{ id: string }>(req);
            const body = getValidatedBody<{
                approvedAmount: number;
                interestRate: number;
                processingFee: number;
            }>(req);

            const input: ApproveLoanInput = {
                loanId: id,
                approvedBy: user.id,
                approvedAmount: body.approvedAmount,
                interestRate: body.interestRate,
                processingFee: body.processingFee,
            };

            const result = await loansService.approveLoan(input, req);
            res.status(HTTP.OK).json(successResponse(result, 'Loan approved'));
        } catch (err) { next(err); }
    },

    // POST /loans/:id/reject
    async reject(req: AuthRequest, res: Response, next: NextFunction) {
        try {
            const user = getAuthUser(req);
            const { id } = getValidatedParams<{ id: string }>(req);
            const body = getValidatedBody<{ reason: string }>(req);

            const input: RejectLoanInput = {
                loanId: id,
                rejectedBy: user.id,
                reason: body.reason,
            };

            const result = await loansService.rejectLoan(input, req);
            res.status(HTTP.OK).json(successResponse(result, 'Loan rejected'));
        } catch (err) { next(err); }
    },

    // GET /loans/accounts/:id
    async getAccount(req: AuthRequest, res: Response, next: NextFunction) {
        try {
            const user = getAuthUser(req);
            const { id } = getValidatedParams<{ id: string }>(req);
            const result = await loansService.getLoanAccount(id, user.id, user.role);
            res.status(HTTP.OK).json(successResponse(result));
        } catch (err) { next(err); }
    },

    // GET /loans/my-accounts
    async myAccounts(req: AuthRequest, res: Response, next: NextFunction) {
        try {
            const user = getAuthUser(req);
            const result = await loansService.getCustomerAccounts(
                user.id, req.query,
            );
            res.status(HTTP.OK).json(paginatedResponse(result));
        } catch (err) { next(err); }
    },
};
