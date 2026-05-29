// src/modules/kyc/kyc.controller.ts
import type { Response, NextFunction } from 'express';
import { kycService } from './kyc.service';
import { HTTP } from '@/config/constants';
import {
    successResponse,
} from '@/types/common.types';
import {
    getValidatedBody,
    getValidatedParams,
    getAuthUser,
} from '@/types/express';
import type { AuthRequest } from '@/types/express';
import type {
    InitiateKycInput,
    AadhaarOtpRequestInput,
    AadhaarOtpVerifyInput,
    RequestESignInput,
    ManualKycOverrideInput,
} from './kyc.types';

export const kycController = {

    // POST /kyc/initiate
    async initiate(req: AuthRequest, res: Response, next: NextFunction) {
        try {
            const body = getValidatedBody<Omit<InitiateKycInput, 'userId'>>(req);
            const input: InitiateKycInput = { ...body, userId: req.user.id };
            const result = await kycService.initiateKyc(input, req);
            res.status(HTTP.CREATED).json(successResponse(result, 'KYC initiated'));
        } catch (err) { next(err); }
    },

    // GET /kyc/status
    async getStatus(req: AuthRequest, res: Response, next: NextFunction) {
        try {
            const result = await kycService.getStatus(req.user.id);
            res.status(HTTP.OK).json(successResponse(result));
        } catch (err) { next(err); }
    },

    // GET /kyc/:userId/status  (staff — view any user's KYC)
    async getStatusByUserId(req: AuthRequest, res: Response, next: NextFunction) {
        try {
            const { userId } = getValidatedParams<{ userId: string }>(req);
            const result = await kycService.getStatus(userId);
            res.status(HTTP.OK).json(successResponse(result));
        } catch (err) { next(err); }
    },

    // POST /kyc/aadhaar/otp-request
    async requestAadhaarOtp(req: AuthRequest, res: Response, next: NextFunction) {
        try {
            const body = getValidatedBody<{ aadhaarNumber: string }>(req);
            const input: AadhaarOtpRequestInput = {
                userId: req.user.id,
                aadhaarNumber: body.aadhaarNumber,
            };
            const result = await kycService.requestAadhaarOtp(input, req);
            res.status(HTTP.OK).json(successResponse(result));
        } catch (err) { next(err); }
    },

    // POST /kyc/aadhaar/otp-verify
    async verifyAadhaarOtp(req: AuthRequest, res: Response, next: NextFunction) {
        try {
            const body = getValidatedBody<{ otp: string; shareCode: string }>(req);
            const input: AadhaarOtpVerifyInput = {
                userId: req.user.id,
                ...body,
            };
            const result = await kycService.verifyAadhaarOtp(input, req);
            res.status(HTTP.OK).json(successResponse(result, 'Aadhaar verified'));
        } catch (err) { next(err); }
    },

    // POST /kyc/documents/upload  (multipart — multer runs before this)
    async uploadDocument(req: AuthRequest, res: Response, next: NextFunction) {
        try {
            const body = getValidatedBody<{ documentType: string }>(req);
            const file = req.file;

            if (!file) {
                return next(new Error('No file uploaded'));
            }

            const result = await kycService.uploadDocument({
                userId: req.user.id,
                documentType: body.documentType as any,
                fileBuffer: file.buffer,
                mimeType: file.mimetype,
                fileName: file.originalname,
            }, req);

            res.status(HTTP.CREATED).json(
                successResponse(result, 'Document uploaded successfully'),
            );
        } catch (err) { next(err); }
    },

    // POST /kyc/face-checks
    async runFaceChecks(req: AuthRequest, res: Response, next: NextFunction) {
        try {
            const result = await kycService.runFaceChecks(req.user.id, req);
            res.status(HTTP.OK).json(successResponse(result));
        } catch (err) { next(err); }
    },

    // POST /kyc/finalise
    async finalise(req: AuthRequest, res: Response, next: NextFunction) {
        try {
            const result = await kycService.finaliseKyc(req.user.id, req);
            res.status(HTTP.OK).json(successResponse(result, 'KYC finalised'));
        } catch (err) { next(err); }
    },

    // POST /kyc/esign/request
    async requestESign(req: AuthRequest, res: Response, next: NextFunction) {
        try {
            const body = getValidatedBody<{ loanId: string }>(req);
            const loan = await getLoanForESign(body.loanId); // Helper below
            const input: RequestESignInput = {
                userId: req.user.id,
                loanId: body.loanId,
                loanAmount: loan.amount,
                tenureMonths: loan.tenureMonths,
                interestRate: loan.interestRate,
                monthlyEmi: loan.monthlyEmi,
            };
            const result = await kycService.requestESign(input, req);
            res.status(HTTP.CREATED).json(
                successResponse(result, 'eSign request created'),
            );
        } catch (err) { next(err); }
    },

    // POST /kyc/:userId/override  (Super Admin only)
    async manualOverride(req: AuthRequest, res: Response, next: NextFunction) {
        try {
            const { userId } = getValidatedParams<{ userId: string }>(req);
            const body = getValidatedBody<{ newStatus: string; reason: string }>(req);
            const input: ManualKycOverrideInput = {
                userId,
                overriddenBy: req.user.id,
                newStatus: body.newStatus as any,
                reason: body.reason,
            };
            const result = await kycService.manualOverride(input, req);
            res.status(HTTP.OK).json(successResponse(result, 'KYC status overridden'));
        } catch (err) { next(err); }
    },
};

// Lazy import — avoids circular dep on loans module at startup
async function getLoanForESign(loanId: string) {
    const { prisma } = await import('@/config/database');
    const loan = await prisma.loan_applications.findUnique({
        where: { id: loanId },
        select: {
            amount_requested: true,
            tenure_months: true,
            interest_rate: true,
            monthly_emi: true,
        },
    });
    if (!loan) throw new Error(`Loan ${loanId} not found`);
    return {
        amount: Number(loan.amount_requested),
        tenureMonths: loan.tenure_months,
        interestRate: Number(loan.interest_rate ?? 0),
        monthlyEmi: Number(loan.monthly_emi ?? 0),
    };
}
