// src/modules/payments/payments.controller.ts
import type { Response, NextFunction } from 'express';
import { paymentsService } from './payments.service';
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
import type {
    CreateMandateInput,
    ManualPaymentLinkInput,
    RecordCashPaymentInput,
    ListPaymentsInput,
} from './payments.types';

export const paymentsController = {

    // POST /payments/mandate
    async createMandate(req: AuthRequest, res: Response, next: NextFunction) {
        try {
            const user = getAuthUser(req);
            const body = getValidatedBody<Omit<CreateMandateInput, 'userId'>>(req);
            const result = await paymentsService.createMandate(
                { ...body, userId: user.id },
                req,
            );
            res.status(HTTP.CREATED).json(
                successResponse(result, 'eNACH mandate created'),
            );
        } catch (err) { next(err); }
    },

    // POST /payments/link
    async createPaymentLink(req: AuthRequest, res: Response, next: NextFunction) {
        try {
            const user = getAuthUser(req);
            const body = getValidatedBody<{
                emiId: string;
                customerName: string;
                customerPhone: string;
                expiryMinutes: number;
            }>(req);

            const account = await import('@/modules/loans')
                .then(({ loansRepository }) =>
                    loansRepository.findAccountByIdOrThrow(
                        body.emiId, // Will be resolved from EMI in service
                    ).catch(() => null),
                );

            const result = await paymentsService.createPaymentLink(
                {
                    loanAccountId: '',           // Resolved in service from emiId
                    userId: user.id,
                    emiId: body.emiId,
                    customerName: body.customerName,
                    customerPhone: body.customerPhone,
                    amount: 0,            // Resolved in service from EMI
                    description: `EMI payment`,
                    expiryMinutes: body.expiryMinutes,
                },
                req,
            );
            res.status(HTTP.CREATED).json(
                successResponse(result, 'Payment link created'),
            );
        } catch (err) { next(err); }
    },

    // POST /payments/cash
    async recordCash(req: AuthRequest, res: Response, next: NextFunction) {
        try {
            const user = getAuthUser(req);
            const body = getValidatedBody<{
                loanAccountId: string;
                emiId: string;
                amount: number;
                collectionId: string;
            }>(req);

            const input: RecordCashPaymentInput = {
                loanAccountId: body.loanAccountId,
                userId: user.id,
                emiId: body.emiId,
                amount: body.amount,
                collectedBy: user.id,
                collectionId: body.collectionId,
            };

            const result = await paymentsService.recordCashPayment(input, req);
            res.status(HTTP.CREATED).json(
                successResponse(result, 'Cash payment recorded'),
            );
        } catch (err) { next(err); }
    },

    // GET /payments/:loanAccountId
    async listByAccount(req: AuthRequest, res: Response, next: NextFunction) {
        try {
            const { loanAccountId } =
                getValidatedParams<{ loanAccountId: string }>(req);
            const query = getValidatedQuery<{ status?: string; page?: number; limit?: number }>(req);
            const pagination = parsePagination(query);

            const input: ListPaymentsInput = {
                loanAccountId,
                status: query.status as any,
                page: pagination.page,
                limit: pagination.limit,
            };

            const result = await paymentsService.listPayments(input);
            res.status(HTTP.OK).json(paginatedResponse(result));
        } catch (err) { next(err); }
    },

    // GET /payments/record/:paymentId
    async getOne(req: AuthRequest, res: Response, next: NextFunction) {
        try {
            const { paymentId } = getValidatedParams<{ paymentId: string }>(req);
            const result = await paymentsService.getPayment(paymentId);
            res.status(HTTP.OK).json(successResponse(result));
        } catch (err) { next(err); }
    },

    // GET /payments/mandate/:loanAccountId
    async getMandate(req: AuthRequest, res: Response, next: NextFunction) {
        try {
            const { loanAccountId } =
                getValidatedParams<{ loanAccountId: string }>(req);
            const result = await paymentsService.getMandateForAccount(loanAccountId);
            res.status(HTTP.OK).json(successResponse(result));
        } catch (err) { next(err); }
    },
};