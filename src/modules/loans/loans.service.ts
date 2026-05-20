// src/modules/loans/loans.service.ts
import type { Request } from 'express';
import { loansRepository } from './loans.repository';
import { loanEvents } from './loans.events';
import { setAuditContext } from '@/middlewares';
import { kycRepository } from '@/modules/kyc';
import {
    LOAN_STATUS,
    AUDIT_ACTION,
    BUSINESS_RULES,
    LOAN_TRANSITIONS,
} from '@/config/constants';
import type { LoanStatus } from '@/config/constants';
import {
    LoanStateError,
    LoanAmountOutOfRangeError,
    TenureOutOfRangeError,
    KycIncompleteError,
    CONFLICT_ERRORS,
    NotFoundError,
    ForbiddenError,
} from '@/errors';
import {
    roundRupees,
    ceilRupees,
    parsePagination,
} from '@/types/common.types';
import { env } from '@/config/env';
import { createModuleLogger } from '@/config/logger';
import type {
    LoanApplication,
    LoanAccount,
    CreateLoanApplicationInput,
    ApproveLoanInput,
    RejectLoanInput,
    ListLoansInput,
    LoanApplicationResponse,
    LoanAccountResponse,
    EmiPreviewInput,
    EmiPreviewResult,
    StatusTransitionResult,
} from './loans.types';

const log = createModuleLogger('loans.service');

// ─── EMI formula ───────────────────────────────────────────────────────────────
// Reducing balance — flat interest is non-compliant under RBI guidelines.
// PMT = P × r(1+r)^n / ((1+r)^n − 1)

function calculateEmi(
    principal: number,
    annualRatePct: number,
    tenureMonths: number,
): { emi: number; totalInterest: number; totalAmount: number } {
    const r = annualRatePct / 12 / 100;

    let emi: number;
    if (r === 0) {
        emi = principal / tenureMonths;
    } else {
        const power = Math.pow(1 + r, tenureMonths);
        emi = (principal * r * power) / (power - 1);
    }

    emi = ceilRupees(emi);   // Always round UP — customer never underpays

    const totalAmount = roundRupees(emi * tenureMonths);
    const totalInterest = roundRupees(totalAmount - principal);

    return { emi, totalInterest, totalAmount };
}

// ─── APR calculation ───────────────────────────────────────────────────────────
// Effective annual rate including processing fee using Newton-Raphson approximation

function calculateApr(
    principal: number,
    emi: number,
    tenureMonths: number,
    processingFee: number,
): number {
    const netDisbursed = principal - processingFee;
    // Newton-Raphson to find monthly rate that prices EMIs on net disbursed amount
    let r = 0.01;
    for (let i = 0; i < 100; i++) {
        const power = Math.pow(1 + r, tenureMonths);
        const f = (netDisbursed * r * power) / (power - 1) - emi;
        const df = netDisbursed * (
            (power * (1 + r * tenureMonths) - power) / Math.pow(power - 1, 2)
        );
        const rNew = r - f / df;
        if (Math.abs(rNew - r) < 1e-10) break;
        r = rNew;
    }
    return roundRupees(r * 12 * 100);
}

// ─── Response shapers ──────────────────────────────────────────────────────────

function toApplicationResponse(
    app: LoanApplication,
): LoanApplicationResponse {
    const terms = app.approvedAmount && app.interestRate && app.tenureMonths
        ? calculateEmi(app.approvedAmount, app.interestRate, app.tenureMonths)
        : null;

    return {
        id: app.id,
        status: app.status,
        amountRequested: app.amountRequested,
        approvedAmount: app.approvedAmount,
        tenureMonths: app.tenureMonths,
        interestRate: app.interestRate,
        monthlyEmi: terms?.emi ?? null,
        processingFee: app.processingFee ?? null,
        productType: app.productType,
        purpose: app.purpose,
        storeName: app.storeName,
        storeCity: app.storeCity,
        rejectionReason: app.rejectionReason,
        appliedAt: app.appliedAt,
        updatedAt: app.updatedAt,
        reviewedAt: app.reviewedAt,
    };
}

function toAccountResponse(acc: LoanAccount): LoanAccountResponse {
    return {
        id: acc.id,
        accountNumber: acc.accountNumber,
        principalAmount: acc.principalAmount,
        interestRate: acc.interestRate,
        tenureMonths: acc.tenureMonths,
        monthlyEmi: acc.monthlyEmi,
        outstandingBalance: acc.outstandingBalance,
        totalInterest: acc.totalInterest,
        status: acc.status,
        disbursedAt: acc.disbursedAt,
        closedAt: acc.closedAt,
    };
}

// ─── Service ───────────────────────────────────────────────────────────────────

export const loansService = {

    // ── 1. EMI preview (no auth — shown on product page) ─────────────────────

    previewEmi(input: EmiPreviewInput): EmiPreviewResult {
        const { amount, tenureMonths, interestRate } = input;

        const processingFee = roundRupees(
            amount * BUSINESS_RULES.PROCESSING_FEE_RATE,
        );

        const { emi, totalInterest, totalAmount } = calculateEmi(
            amount, interestRate, tenureMonths,
        );

        const effectiveRate = calculateApr(amount, emi, tenureMonths, processingFee);

        return {
            monthlyEmi: emi,
            totalAmount: roundRupees(totalAmount + processingFee),
            totalInterest,
            processingFee,
            effectiveRate,
        };
    },

    // ── 2. Create loan application (DRAFT) ───────────────────────────────────

    async createApplication(
        input: CreateLoanApplicationInput,
        req: Request,
    ): Promise<LoanApplicationResponse> {
        const { userId, amount, tenureMonths } = input;

        // ── Business rule validations ────────────────────────────────────────────
        if (
            amount < env.business.minLoanAmount ||
            amount > env.business.maxLoanAmount
        ) {
            throw new LoanAmountOutOfRangeError(
                amount,
                env.business.minLoanAmount,
                env.business.maxLoanAmount,
            );
        }

        if (
            tenureMonths < env.business.minTenureMonths ||
            tenureMonths > env.business.maxTenureMonths
        ) {
            throw new TenureOutOfRangeError(
                tenureMonths,
                env.business.minTenureMonths,
                env.business.maxTenureMonths,
            );
        }

        // One active application per user — prevent duplicate pipeline entries
        const hasActive = await loansRepository.hasActiveApplication(userId);
        if (hasActive) throw CONFLICT_ERRORS.duplicateApplication(userId);

        const application = await loansRepository.createApplication({
            ...input,
            appliedAt: new Date(),
        });

        setAuditContext(req, {
            action: AUDIT_ACTION.LOAN_CREATED,
            entityType: 'loan_application',
            entityId: application.id,
            after: { status: LOAN_STATUS.DRAFT },
        });

        loanEvents.created(
            {
                id: application.id,
                userId: application.userId,
                agentId: application.agentId,
                amountRequested: application.amountRequested,
                tenureMonths: application.tenureMonths,
                productType: application.productType,
            },
            req,
        );

        log.info('Loan application created', {
            loanId: application.id,
            userId,
            amount,
        });

        return toApplicationResponse(application);
    },

    // ── 3. Submit for KYC (DRAFT → KYC_PENDING) ──────────────────────────────

    async submitApplication(
        loanId: string,
        userId: string,
        req: Request,
    ): Promise<LoanApplicationResponse> {
        const application = await loansRepository.findApplicationByIdOrThrow(loanId);

        // Ownership — customer can only submit their own application
        if (application.userId !== userId) {
            throw new ForbiddenError('You can only submit your own loan application');
        }

        // State machine check
        LoanStateError.assert(loanId, application.status, LOAN_STATUS.KYC_PENDING);

        // KYC must have been initiated — not necessarily complete at this stage
        // (KYC completes async; the loan moves to UNDERWRITING once KYC is done)
        const kycDoc = await kycRepository.findByUserId(userId);
        if (!kycDoc) {
            throw new KycIncompleteError(userId, ['KYC not initiated']);
        }

        const updated = await loansRepository.updateApplicationStatus(
            loanId,
            LOAN_STATUS.KYC_PENDING,
        );

        setAuditContext(req, {
            action: AUDIT_ACTION.LOAN_SUBMITTED,
            entityType: 'loan_application',
            entityId: loanId,
            before: { status: application.status },
            after: { status: LOAN_STATUS.KYC_PENDING },
        });

        loanEvents.statusChanged(
            application, application.status, LOAN_STATUS.KYC_PENDING, userId, req,
        );

        log.info('Loan submitted for KYC', { loanId, userId });
        return toApplicationResponse(updated);
    },

    // ── 4. Progress to UNDERWRITING (KYC_PENDING → UNDERWRITING) ────────────
    // Called by the KYC module's 'kyc.completed' event handler
    // (not a direct controller action — internal use only)

    async progressToUnderwriting(
        loanId: string,
        userId: string,
    ): Promise<void> {
        const application = await loansRepository.findApplicationByIdOrThrow(loanId);

        if (application.status !== LOAN_STATUS.KYC_PENDING) return;

        LoanStateError.assert(loanId, application.status, LOAN_STATUS.UNDERWRITING);

        const kycComplete = await kycRepository.isComplete(userId);
        if (!kycComplete) {
            log.warn('progressToUnderwriting called but KYC not complete', {
                loanId, userId,
            });
            return;
        }

        await loansRepository.updateApplicationStatus(
            loanId, LOAN_STATUS.UNDERWRITING,
        );

        log.info('Loan progressed to underwriting', { loanId, userId });
    },

    // ── 5. Submit for approval (UNDERWRITING → PENDING_APPROVAL) ─────────────
    // Called by underwriting.service after completing risk assessment

    async submitForApproval(
        loanId: string,
        req?: Request,
    ): Promise<void> {
        const application = await loansRepository.findApplicationByIdOrThrow(loanId);

        LoanStateError.assert(
            loanId, application.status, LOAN_STATUS.PENDING_APPROVAL,
        );

        await loansRepository.updateApplicationStatus(
            loanId, LOAN_STATUS.PENDING_APPROVAL,
        );

        if (req) {
            loanEvents.statusChanged(
                application,
                application.status,
                LOAN_STATUS.PENDING_APPROVAL,
                'system:underwriting',
                req,
            );
        }

        log.info('Loan submitted for credit manager approval', { loanId });
    },

    // ── 6. Approve loan (PENDING_APPROVAL → APPROVED) ────────────────────────

    async approveLoan(
        input: ApproveLoanInput,
        req: Request,
    ): Promise<LoanApplicationResponse> {
        const { loanId, approvedBy, approvedAmount, interestRate, processingFee } = input;
        const application = await loansRepository.findApplicationByIdOrThrow(loanId);

        LoanStateError.assert(loanId, application.status, LOAN_STATUS.APPROVED);

        // Processing fee GST
        const processingFeeGst = roundRupees(
            processingFee * BUSINESS_RULES.GST_ON_PROCESSING_FEE,
        );

        // Calculate EMI at approval stage
        const { emi } = calculateEmi(approvedAmount, interestRate, application.tenureMonths);

        const updated = await loansRepository.updateApplicationStatus(
            loanId,
            LOAN_STATUS.APPROVED,
            {
                approved_amount: approvedAmount,
                interest_rate: interestRate,
                processing_fee: processingFee,
                processing_fee_gst: processingFeeGst,
                reviewed_by: approvedBy,
                reviewed_at: new Date(),
            },
        );

        setAuditContext(req, {
            action: AUDIT_ACTION.LOAN_APPROVED,
            entityType: 'loan_application',
            entityId: loanId,
            before: { status: application.status },
            after: {
                status: LOAN_STATUS.APPROVED,
                approvedAmount,
                interestRate,
                processingFee,
            },
        });

        loanEvents.approved(
            application,
            {
                approvedAmount, interestRate,
                tenureMonths: application.tenureMonths, monthlyEmi: emi
            },
            approvedBy,
            req,
        );

        log.info('Loan approved', {
            loanId,
            approvedBy,
            approvedAmount,
            interestRate,
        });

        return toApplicationResponse(updated);
    },

    // ── 7. Reject loan ────────────────────────────────────────────────────────

    async rejectLoan(
        input: RejectLoanInput,
        req: Request,
    ): Promise<LoanApplicationResponse> {
        const { loanId, rejectedBy, reason } = input;
        const application = await loansRepository.findApplicationByIdOrThrow(loanId);

        // Rejection is allowed from multiple states
        const rejectableStates: LoanStatus[] = [
            LOAN_STATUS.KYC_PENDING,
            LOAN_STATUS.UNDERWRITING,
            LOAN_STATUS.PENDING_APPROVAL,
            LOAN_STATUS.APPROVED,
        ];

        if (!rejectableStates.includes(application.status)) {
            throw new LoanStateError(loanId, application.status, LOAN_STATUS.REJECTED);
        }

        const updated = await loansRepository.updateApplicationStatus(
            loanId,
            LOAN_STATUS.REJECTED,
            {
                rejection_reason: reason,
                reviewed_by: rejectedBy,
                reviewed_at: new Date(),
            },
        );

        setAuditContext(req, {
            action: AUDIT_ACTION.LOAN_REJECTED,
            entityType: 'loan_application',
            entityId: loanId,
            before: { status: application.status },
            after: { status: LOAN_STATUS.REJECTED, reason },
        });

        loanEvents.rejected(application, reason, rejectedBy, req);

        log.info('Loan rejected', { loanId, rejectedBy, reason });
        return toApplicationResponse(updated);
    },

    // ── 8. Mark as ACTIVE (DISBURSED → ACTIVE) ───────────────────────────────
    // Called after eNACH mandate is registered — loan is now in repayment mode

    async activateLoan(
        accountId: string,
        mandateId: string,
        req: Request,
    ): Promise<void> {
        const account = await loansRepository.findAccountByIdOrThrow(accountId);

        LoanStateError.assert(accountId, account.status, LOAN_STATUS.ACTIVE);

        await loansRepository.updateAccountStatus(
            accountId,
            LOAN_STATUS.ACTIVE,
        );
        await loansRepository.updateMandateId(accountId, mandateId);

        log.info('Loan activated', { accountId, mandateId });
    },

    // ── 9. Mark NPA ────────────────────────────────────────────────────────────

    async markNpa(
        accountId: string,
        overdueDays: number,
        overdueAmount: number,
        req: Request,
    ): Promise<void> {
        const account = await loansRepository.findAccountByIdOrThrow(accountId);

        if (account.status === LOAN_STATUS.NPA) return; // Already NPA

        LoanStateError.assert(accountId, account.status, LOAN_STATUS.NPA);

        await loansRepository.updateAccountStatus(accountId, LOAN_STATUS.NPA);

        setAuditContext(req, {
            action: AUDIT_ACTION.LOAN_NPA,
            entityType: 'loan_account',
            entityId: accountId,
            before: { status: account.status },
            after: { status: LOAN_STATUS.NPA, overdueDays, overdueAmount },
        });

        loanEvents.npa(account, overdueDays, overdueAmount, req);

        log.warn('Loan marked NPA', { accountId, overdueDays, overdueAmount });
    },

    // ── 10. Get single application ────────────────────────────────────────────

    async getApplication(
        loanId: string,
        userId: string,
        role: string,
    ): Promise<LoanApplicationResponse> {
        const application = await loansRepository.findApplicationByIdOrThrow(loanId);

        // Customers can only view their own applications
        const staffRoles = ['OPS_EXECUTIVE', 'CREDIT_MANAGER', 'FINANCE', 'SUPER_ADMIN', 'COLLECTION_AGENT'];
        if (!staffRoles.includes(role) && application.userId !== userId) {
            throw new ForbiddenError('You can only view your own loan applications');
        }

        return toApplicationResponse(application);
    },

    // ── 11. List applications ─────────────────────────────────────────────────

    async listApplications(
        filters: ListLoansInput,
    ) {
        return loansRepository.listApplications(filters);
    },

    // ── 12. Get loan account ───────────────────────────────────────────────────

    async getLoanAccount(
        accountId: string,
        userId: string,
        role: string,
    ): Promise<LoanAccountResponse> {
        const account = await loansRepository.findAccountByIdOrThrow(accountId);

        const staffRoles = ['OPS_EXECUTIVE', 'CREDIT_MANAGER', 'FINANCE', 'SUPER_ADMIN', 'COLLECTION_AGENT'];
        if (!staffRoles.includes(role) && account.userId !== userId) {
            throw new ForbiddenError('You can only view your own loan account');
        }

        return toAccountResponse(account);
    },

    // ── 13. Get customer's loan accounts ──────────────────────────────────────

    async getCustomerAccounts(
        userId: string,
        query: { page?: unknown; limit?: unknown },
    ) {
        const pagination = parsePagination(query);
        return loansRepository.findAccountsByUserId(userId, pagination);
    },

    // ── 14. EMI calculation helper (used by disbursement.service) ─────────────

    calculateEmi,
};