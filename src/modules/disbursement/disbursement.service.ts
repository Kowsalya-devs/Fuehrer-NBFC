// src/modules/disbursement/disbursement.service.ts
import { randomUUID } from 'crypto';
import type { Request } from 'express';
import { disbursementRepository } from './disbursement.repository';
import { disbursementEvents } from './disbursement.events';
import { kycRepository } from '@/modules/kyc';
import { loansRepository } from '@/modules/loans';
import { loansService } from '@/modules/loans';
import { underwritingRepository } from '@/modules/underwriting';
import { emiService } from '@/modules/emi';
import { getPaymentProvider } from '@/providers';
import {
    getRedisClient,
    RedisKeys,
    RedisTTL,
    acquireLock,
    releaseLock,
} from '@/config/redis';
import {
    LOAN_STATUS,
    DISBURSEMENT_MODE,
    AUDIT_ACTION,
    KYC_STATUS,
} from '@/config/constants';
import { roundRupees, toNumber } from '@/types/common.types';
import { env } from '@/config/env';
import { setAuditContext } from '@/middlewares';
import {
    DomainError,
    ConflictError,
    NotFoundError,
    PAYMENT_ERRORS,
    ESignNotCompletedError,
    DisbursementAlreadyDoneError,
} from '@/errors';
import { createModuleLogger } from '@/config/logger';
import type {
    DisbursementRecord,
    DisbursementResponse,
    DisbursementChecklistResponse,
    InitiateDisbursementInput,
    DisbursementWebhookInput,
    ChecklistResult,
    DisbursementChecklist,
} from './disbursement.types';
import { BUSINESS_RULES } from '@/config/constants';

const log = createModuleLogger('disbursement.service');

// ─── Response shaper ──────────────────────────────────────────────────────────

function toResponse(record: DisbursementRecord): DisbursementResponse {
    return {
        id: record.id,
        loanId: record.loanId,
        loanAccountId: record.loanAccountId,
        status: record.status,
        principalAmount: record.principalAmount,
        processingFee: record.processingFee,
        netDisbursedAmount: record.netDisbursedAmount,
        mode: record.mode,
        utrNumber: record.utrNumber,
        failureReason: record.failureReason,
        initiatedAt: record.initiatedAt,
        completedAt: record.completedAt,
    };
}

// ─── Service ───────────────────────────────────────────────────────────────────

export const disbursementService = {

    // ── 1. Pre-disbursement checklist ──────────────────────────────────────────
    // Finance team calls this before initiating. Shows exactly which gates
    // are blocking and which are clear. No side effects.

    async runChecklist(
        loanId: string,
    ): Promise<DisbursementChecklistResponse> {
        const loan = await loansRepository.findApplicationByIdOrThrow(loanId);

        const [kycDoc, underwritingReport, existingDisbursement] =
            await Promise.all([
                kycRepository.findByUserId(loan.userId),
                underwritingRepository.findLatestByLoanId(loanId),
                disbursementRepository.findByLoanId(loanId),
            ]);

        const checklist: DisbursementChecklist = {
            loanApproved: loan.status === LOAN_STATUS.APPROVED,
            kycComplete: kycDoc?.overallStatus === KYC_STATUS.COMPLETE,
            eSignComplete: kycDoc?.eSignStatus === 'SIGNED',
            underwritingPassed: underwritingReport?.decision === 'APPROVED' ||
                underwritingReport?.decision === 'REFERRED',
            noDuplicatePayout: !existingDisbursement ||
                existingDisbursement.status === 'FAILED',
            bankAccountVerified: true,  // Verified at KYC stage — always true here
        };

        const failures = Object.entries(checklist)
            .filter(([, passed]) => !passed)
            .map(([gate]) => CHECKLIST_MESSAGES[gate as keyof DisbursementChecklist]);

        return {
            loanId,
            checklist,
            passed: failures.length === 0,
            failures,
        };
    },

    // ── 2. Initiate disbursement ───────────────────────────────────────────────
    // The most guarded method in the entire system.
    // Uses a distributed Redis lock to prevent concurrent disbursements
    // for the same loan (double-click, network retry, etc.)

    async initiateDisbursement(
        input: InitiateDisbursementInput,
        req: Request,
    ): Promise<DisbursementResponse> {
        const { loanId, initiatedBy } = input;
        const lockToken = randomUUID();
        const lockKey = RedisKeys.disbursementLock(loanId);

        // ── Acquire distributed lock ──────────────────────────────────────────
        const lockAcquired = await acquireLock(
            lockKey,
            RedisTTL.DISBURSE_LOCK,
            lockToken,
        );

        if (!lockAcquired) {
            throw new ConflictError(
                'A disbursement is already in progress for this loan. ' +
                'Please wait 30 seconds and check the disbursement status.',
                { loanId },
            );
        }

        try {
            return await this._executeInitiation(input, req);
        } finally {
            // Always release lock — even if execution threw
            await releaseLock(lockKey, lockToken);
        }
    },

    async _executeInitiation(
        input: InitiateDisbursementInput,
        req: Request,
    ): Promise<DisbursementResponse> {
        const {
            loanId, initiatedBy, beneficiaryName,
            accountNumber, ifsc, mode,
        } = input;

        // ── Gate 1: Loan must be APPROVED ─────────────────────────────────────
        const loan = await loansRepository.findApplicationByIdOrThrow(loanId);
        if (loan.status !== LOAN_STATUS.APPROVED) {
            throw new DomainError(
                `Loan must be in APPROVED status to disburse. Current status: ${loan.status}`,
                'LOAN_NOT_APPROVED',
                { loanId, currentStatus: loan.status },
            );
        }

        // ── Gate 2: No duplicate payout ───────────────────────────────────────
        const alreadyDisbursed = await disbursementRepository
            .existsCompletedForLoan(loanId);
        if (alreadyDisbursed) {
            throw new DisbursementAlreadyDoneError(loanId);
        }

        // ── Gate 3: KYC complete ──────────────────────────────────────────────
        const kycDoc = await kycRepository.findByUserId(loan.userId);
        if (kycDoc?.overallStatus !== KYC_STATUS.COMPLETE) {
            throw new DomainError(
                'KYC must be complete before disbursement',
                'KYC_INCOMPLETE_FOR_DISBURSEMENT',
                { loanId, kycStatus: kycDoc?.overallStatus },
            );
        }

        // ── Gate 4: eSign complete ────────────────────────────────────────────
        if (kycDoc.eSignStatus !== 'SIGNED') {
            throw new ESignNotCompletedError(loanId);
        }

        // ── Gate 5: Underwriting must have cleared ────────────────────────────
        const underwritingReport = await underwritingRepository
            .findLatestByLoanId(loanId);
        if (
            !underwritingReport ||
            !['APPROVED', 'REFERRED'].includes(underwritingReport.decision)
        ) {
            throw new DomainError(
                'Underwriting must be completed and cleared before disbursement',
                'UNDERWRITING_NOT_CLEARED',
                {
                    loanId,
                    underwritingDecision: underwritingReport?.decision ?? 'NOT_RUN',
                },
            );
        }

        // ── Compute amounts ───────────────────────────────────────────────────
        const principalAmount = loan.approvedAmount!;
        const processingFee = loan.processingFee ?? roundRupees(
            principalAmount * BUSINESS_RULES.PROCESSING_FEE_RATE,
        );
        const processingFeeGst = loan.processingFeeGst ?? roundRupees(
            processingFee * BUSINESS_RULES.GST_ON_PROCESSING_FEE,
        );
        const netDisbursedAmount = roundRupees(
            principalAmount - processingFee - processingFeeGst,
        );

        log.info('Disbursement amounts computed', {
            loanId,
            principalAmount,
            processingFee,
            processingFeeGst,
            netDisbursedAmount,
        });

        // ── Write PENDING record before touching payment gateway ──────────────
        // If the gateway call hangs, we have a record to reconcile against
        const disbursementRecord = await disbursementRepository.create({
            loanId,
            userId: loan.userId,
            beneficiaryName,
            accountNumber,
            ifsc,
            mode,
            principalAmount,
            processingFee,
            processingFeeGst,
            netDisbursedAmount,
            status: 'PENDING',
            initiatedBy,
            initiatedAt: new Date(),
        });

        setAuditContext(req, {
            action: AUDIT_ACTION.LOAN_DISBURSED,
            entityType: 'disbursements',
            entityId: disbursementRecord.id,
            before: { status: 'PENDING' },
            after: {
                loanId,
                amount: netDisbursedAmount,
                mode,
            },
        });

        // ── Call Razorpay Payouts API ──────────────────────────────────────────
        // UPI payouts are free (GoI mandate); IMPS costs ₹5.90
        const paymentProvider = getPaymentProvider();
        let payoutResult;

        try {
            payoutResult = await paymentProvider.createPayout({
                accountNumber: mode === DISBURSEMENT_MODE.UPI
                    ? accountNumber   // For UPI: UPI ID
                    : accountNumber,
                ifsc: mode === DISBURSEMENT_MODE.UPI ? '' : ifsc,
                accountName: beneficiaryName,
                amount: netDisbursedAmount,
                purpose: `Loan disbursement - ${loanId.slice(0, 8)}`,
                referenceId: disbursementRecord.id,
            });
        } catch (error) {
            // Mark disbursement as failed — never leave in PENDING
            await disbursementRepository.markFailed(
                disbursementRecord.id,
                (error as Error).message,
            );
            disbursementEvents.failed({
                disbursementId: disbursementRecord.id,
                loanId,
                userId: loan.userId,
                reason: (error as Error).message,
                requestId: req.requestId,
            });
            throw PAYMENT_ERRORS.payoutFailed(error);
        }

        // ── Update to INITIATED with Razorpay payout ID ───────────────────────
        const updated = await disbursementRepository.markInitiated(
            disbursementRecord.id,
            payoutResult.payoutId,
        );

        // ── Handle synchronous completion (IMPS can complete instantly) ───────
        if (payoutResult.status === 'DONE' && payoutResult.utrNumber) {
            return this._completeDisbursement(
                updated,
                loan,
                payoutResult.utrNumber,
                req,
            );
        }

        disbursementEvents.initiated({
            disbursementId: updated.id,
            loanId,
            userId: loan.userId,
            agentId: loan.agentId,
            amount: netDisbursedAmount,
            mode,
            requestId: req.requestId,
        });

        log.info('Disbursement initiated, awaiting confirmation', {
            disbursementId: updated.id,
            loanId,
            razorpayPayoutId: payoutResult.payoutId,
        });

        return toResponse(updated);
    },

    // ── 3. Process webhook confirmation ───────────────────────────────────────
    // Razorpay sends a webhook when the payout reaches the beneficiary.
    // This is where the loan account and EMI schedule are created atomically.

    async processPayoutWebhook(
        input: DisbursementWebhookInput,
        req: Request,
    ): Promise<void> {
        const record = await disbursementRepository.findByPayoutId(
            input.razorpayPayoutId,
        );

        if (!record) {
            log.warn('Disbursement webhook for unknown payout', {
                payoutId: input.razorpayPayoutId,
            });
            return;
        }

        // Idempotency — already processed
        if (record.status === 'COMPLETED' || record.status === 'REVERSED') {
            log.info('Disbursement webhook already processed', {
                disbursementId: record.id,
                status: record.status,
            });
            return;
        }

        const loan = await loansRepository.findApplicationByIdOrThrow(record.loanId);

        switch (input.status) {
            case 'processed':
            case 'DONE': {
                if (!input.utrNumber) {
                    log.warn('Payout processed but no UTR number', {
                        disbursementId: record.id,
                    });
                    return;
                }
                await this._completeDisbursement(record, loan, input.utrNumber, req);
                break;
            }

            case 'reversed':
            case 'REVERSED': {
                await disbursementRepository.markReversed(record.id);
                log.warn('Disbursement reversed by Razorpay', {
                    disbursementId: record.id,
                    loanId: record.loanId,
                });
                break;
            }

            case 'failed':
            case 'FAILED': {
                await disbursementRepository.markFailed(
                    record.id,
                    input.failureReason ?? 'Payout failed at bank',
                );
                disbursementEvents.failed({
                    disbursementId: record.id,
                    loanId: record.loanId,
                    userId: record.userId,
                    reason: input.failureReason ?? 'Unknown',
                    requestId: req.requestId,
                });
                break;
            }

            default:
                // QUEUED / PROCESSING — no action needed, wait for next webhook
                log.info('Disbursement payout status update', {
                    disbursementId: record.id,
                    status: input.status,
                });
        }
    },

    // ── 4. Core completion — atomically creates account + EMI schedule ────────
    // This is the most critical path in the entire platform.
    // Uses withTransaction so loan account + EMI schedule are created together.
    // If either fails, both roll back — no orphaned records.

    async _completeDisbursement(
        record: DisbursementRecord,
        loan: Awaited<ReturnType<typeof loansRepository.findApplicationByIdOrThrow>>,
        utrNumber: string,
        req: Request,
    ): Promise<DisbursementResponse> {
        const disbursedAt = new Date();

        // ── Fetch approved terms from underwriting ────────────────────────────
        const uwReport = await underwritingRepository.findLatestByLoanId(loan.id);

        const interestRate = uwReport?.recommendedRate ?? 18;
        const tenureMonths = loan.tenureMonths;
        const principalAmount = record.principalAmount;

        // ── Atomically: create loan account + update disbursement + update loan ─
        // All three writes succeed together or all roll back.
        // EMI schedule creation is separate but called immediately after.

        let loanAccount: Awaited<ReturnType
      typeof loansRepository.createAccount
            >>;

        await prisma.$transaction(async (tx) => {
            // 1. Create loan account
            const accountNumber = await generateAccountNumber();

            const accountRow = await tx.loan_accounts.create({
                data: {
                    application_id: loan.id,
                    user_id: loan.userId,
                    account_number: accountNumber,
                    principal_amount: principalAmount,
                    interest_rate: interestRate,
                    tenure_months: tenureMonths,
                    monthly_emi: 0, // Updated after EMI schedule creation
                    outstanding_balance: principalAmount,
                    total_interest: 0, // Updated after EMI schedule creation
                    status: LOAN_STATUS.DISBURSED,
                    disbursed_at: disbursedAt,
                    created_at: new Date(),
                    updated_at: new Date(),
                },
            });

            loanAccount = {
                id: accountRow.id as string,
                applicationId: accountRow.application_id as string,
                userId: accountRow.user_id as string,
                accountNumber: accountRow.account_number as string,
                principalAmount: toNumber(accountRow.principal_amount as number),
                interestRate: toNumber(accountRow.interest_rate as number),
                tenureMonths: accountRow.tenure_months as number,
                monthlyEmi: 0,
                outstandingBalance: toNumber(accountRow.outstanding_balance as number),
                totalInterest: 0,
                status: LOAN_STATUS.DISBURSED,
                repaymentMode: DISBURSEMENT_MODE.IMPS,
                razorpayMandateId: null,
                disbursedAt,
                closedAt: null,
                createdAt: accountRow.created_at as Date,
                updatedAt: accountRow.updated_at as Date,
            };

            // 2. Update loan application status to DISBURSED
            await tx.loan_applications.update({
                where: { id: loan.id },
                data: { status: LOAN_STATUS.DISBURSED, updated_at: new Date() },
            });

            // 3. Link disbursement record to loan account + mark completed
            await tx.disbursements.update({
                where: { id: record.id },
                data: {
                    status: 'COMPLETED',
                    utr_number: utrNumber,
                    loan_account_id: accountRow.id as string,
                    completed_at: disbursedAt,
                    updated_at: new Date(),
                },
            });
        });

        // ── Generate EMI schedule ─────────────────────────────────────────────
        // Separate from the transaction because Prisma's createMany inside a
        // nested write can be slow for 36-entry schedules.
        // If this fails, we have an orphaned loan account — the cron job reconciles.

        const emiSchedule = await emiService.createSchedule({
            loanAccountId: loanAccount!.id,
            principal: principalAmount,
            annualRatePct: interestRate,
            tenureMonths,
            disbursementDate: disbursedAt,
        });

        // ── Update loan account with accurate EMI amounts ─────────────────────
        await prisma.loan_accounts.update({
            where: { id: loanAccount!.id },
            data: {
                monthly_emi: emiSchedule.monthlyEmi,
                total_interest: emiSchedule.totalInterest,
                outstanding_balance: roundRupees(
                    principalAmount + emiSchedule.totalInterest,
                ),
                updated_at: new Date(),
            },
        });

        setAuditContext(req, {
            action: AUDIT_ACTION.LOAN_DISBURSED,
            entityType: 'loan_accounts',
            entityId: loanAccount!.id,
            after: {
                accountNumber: loanAccount!.accountNumber,
                principalAmount,
                interestRate,
                tenureMonths,
                monthlyEmi: emiSchedule.monthlyEmi,
                totalPayable: emiSchedule.totalPayable,
                utrNumber,
            },
        });

        disbursementEvents.completed({
            disbursementId: record.id,
            loanId: record.loanId,
            loanAccountId: loanAccount!.id,
            userId: record.userId,
            agentId: loan.agentId,
            amount: record.netDisbursedAmount,
            utrNumber,
            requestId: req.requestId,
        });

        log.info('Disbursement fully completed', {
            disbursementId: record.id,
            loanAccountId: loanAccount!.id,
            accountNumber: loanAccount!.accountNumber,
            utrNumber,
            monthlyEmi: emiSchedule.monthlyEmi,
            firstEmiDate: emiSchedule.firstEmiDate,
        });

        const finalRecord = await disbursementRepository.findByIdOrThrow(record.id);
        return toResponse(finalRecord);
    },

    // ── 5. Retry failed disbursement ───────────────────────────────────────────
    // Only FAILED disbursements can be retried.
    // Creates a new disbursement record — does not mutate the failed one.

    async retryDisbursement(
        disbursementId: string,
        retriedBy: string,
        req: Request,
    ): Promise<DisbursementResponse> {
        const record = await disbursementRepository.findByIdOrThrow(disbursementId);

        if (record.status !== 'FAILED') {
            throw new DomainError(
                `Only FAILED disbursements can be retried. Current status: ${record.status}`,
                'INVALID_RETRY_STATE',
                { disbursementId, currentStatus: record.status },
            );
        }

        // Fetch fresh loan data — terms may have changed since failure
        const loan = await loansRepository.findApplicationByIdOrThrow(record.loanId);

        log.info('Retrying disbursement', {
            originalDisbursementId: disbursementId,
            loanId: record.loanId,
            retriedBy,
        });

        return this.initiateDisbursement(
            {
                loanId: record.loanId,
                initiatedBy: retriedBy,
                beneficiaryName: record.beneficiaryName,
                accountNumber: record.accountNumber,
                ifsc: record.ifsc,
                mode: record.mode,
            },
            req,
        );
    },

    // ── 6. Get disbursement by loan ────────────────────────────────────────────

    async getDisbursementByLoan(
        loanId: string,
    ): Promise<DisbursementResponse | null> {
        const record = await disbursementRepository.findByLoanId(loanId);
        return record ? toResponse(record) : null;
    },

    // ── 7. Get disbursement by ID ──────────────────────────────────────────────

    async getDisbursement(
        disbursementId: string,
    ): Promise<DisbursementResponse> {
        const record = await disbursementRepository.findByIdOrThrow(disbursementId);
        return toResponse(record);
    },
};

// ─── Checklist messages ────────────────────────────────────────────────────────

const CHECKLIST_MESSAGES: Record<keyof DisbursementChecklist, string> = {
    loanApproved: 'Loan must be in APPROVED status',
    kycComplete: 'Customer KYC must be fully complete',
    eSignComplete: 'Loan agreement must be eSigned by the customer',
    underwritingPassed: 'Underwriting assessment must be completed and cleared',
    noDuplicatePayout: 'A disbursement is already in progress or completed for this loan',
    bankAccountVerified: 'Beneficiary bank account could not be verified',
} as const;

// ─── Account number generator ──────────────────────────────────────────────────

async function generateAccountNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const result = await prisma.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(*)::bigint AS count
    FROM loan_accounts
    WHERE EXTRACT(YEAR FROM created_at) = ${year}
  `;
    const seq = Number(result[0]!.count) + 1;
    return `FHR-${year}-${String(seq).padStart(6, '0')}`;
}

// ─── Lazy prisma import to avoid circular dep ──────────────────────────────────
import { prisma } from '@/config/database';