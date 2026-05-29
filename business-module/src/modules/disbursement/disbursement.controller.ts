// src/modules/disbursement/disbursement.controller.ts
import type { Response, NextFunction } from 'express';
import { disbursementService } from './disbursement.service';
import { HTTP } from '@/config/constants';
import { successResponse } from '@/types/common.types';
import {
    getValidatedBody,
    getValidatedParams,
    getAuthUser,
} from '@/types/express';
import type { AuthRequest } from '@/types/express';
import type { InitiateDisbursementInput } from './disbursement.types';
import { DISBURSEMENT_MODE } from '@/config/constants';

export const disbursementController = {

    // GET /disbursement/checklist/:loanId
    async checklist(req: AuthRequest, res: Response, next: NextFunction) {
        try {
            const { loanId } = getValidatedParams<{ loanId: string }>(req);
            const result = await disbursementService.runChecklist(loanId);
            res.status(HTTP.OK).json(successResponse(result));
        } catch (err) { next(err); }
    },

    // POST /disbursement/initiate/:loanId
    async initiate(req: AuthRequest, res: Response, next: NextFunction) {
        try {
            const user = getAuthUser(req);
            const { loanId } = getValidatedParams<{ loanId: string }>(req);
            const body = getValidatedBody<{
                beneficiaryName: string;
                accountNumber: string;
                ifsc: string;
                mode: string;
            }>(req);

            const input: InitiateDisbursementInput = {
                loanId,
                initiatedBy: user.id,
                beneficiaryName: body.beneficiaryName,
                accountNumber: body.accountNumber,
                ifsc: body.ifsc,
                mode: body.mode as typeof DISBURSEMENT_MODE[keyof typeof DISBURSEMENT_MODE],
            };

            const result = await disbursementService.initiateDisbursement(input, req);
            res.status(HTTP.CREATED).json(
                successResponse(result, 'Disbursement initiated'),
            );
        } catch (err) { next(err); }
    },

    // POST /disbursement/:disbursementId/retry
    async retry(req: AuthRequest, res: Response, next: NextFunction) {
        try {
            const user = getAuthUser(req);
            const { disbursementId } =
                getValidatedParams<{ disbursementId: string }>(req);

            const result = await disbursementService.retryDisbursement(
                disbursementId,
                user.id,
                req,
            );
            res.status(HTTP.CREATED).json(
                successResponse(result, 'Disbursement retry initiated'),
            );
        } catch (err) { next(err); }
    },

    // GET /disbursement/loan/:loanId
    async getByLoan(req: AuthRequest, res: Response, next: NextFunction) {
        try {
            const { loanId } = getValidatedParams<{ loanId: string }>(req);
            const result = await disbursementService.getDisbursementByLoan(loanId);

            if (!result) {
                res.status(HTTP.NOT_FOUND).json({
                    success: false,
                    errorCode: 'NOT_FOUND',
                    message: 'No disbursement found for this loan',
                });
                return;
            }

            res.status(HTTP.OK).json(successResponse(result));
        } catch (err) { next(err); }
    },

    // GET /disbursement/:disbursementId
    async getOne(req: AuthRequest, res: Response, next: NextFunction) {
        try {
            const { disbursementId } =
                getValidatedParams<{ disbursementId: string }>(req);
            const result = await disbursementService.getDisbursement(disbursementId);
            res.status(HTTP.OK).json(successResponse(result));
        } catch (err) { next(err); }
    },
};
