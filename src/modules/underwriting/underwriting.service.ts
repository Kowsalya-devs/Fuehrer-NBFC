// src/modules/underwriting/underwriting.service.ts
import type { Request } from 'express';
import { underwritingRepository } from './underwriting.repository';
import { underwritingEvents } from './underwriting.events';
import {
    runRuleEngine,
    lookupInterestRate,
    computeMaxEligibleAmount,
} from './underwriting.rules';
import { kycRepository } from '@/modules/kyc';
import { loansService } from '@/modules/loans';
import { loansRepository } from '@/modules/loans';
import { computeMonthlyEmi } from '@/modules/emi/emi.calculator';
import { setAuditContext } from '@/middlewares';
import {
    LOAN_STATUS,
    AUDIT_ACTION,
    BUSINESS_RULES,
} from '@/config/constants';
import {
    roundRupees,
    toNumber,
} from '@/types/common.types';
import { env } from '@/config/env';
import {
    NotFoundError,
    DomainError,
    KycIncompleteError,
    ForbiddenError,
} from '@/errors';
import { createModuleLogger } from '@/config/logger';
import type {
    UnderwritingReport,
    UnderwritingConfig,
    RunUnderwritingInput,
    CreditManagerReviewInput,
    UnderwritingReportResponse,
    UnderwritingDecision,
    ListUnderwritingReportsInput,
} from './underwriting.types';
import type { RuleContext } from './underwriting.rules';

const log = createModuleLogger('underwriting.service');

// ─── Default underwriting configuration ───────────────────────────────────────
// Sourced from env.business — can be overridden per product type in future

function buildConfig(): UnderwritingConfig {
    return {
        minCreditScore: env.business.minCreditScore,
        maxFoir: BUSINESS_RULES.MAX_FOIR,
        maxDti: 0.60,
        minMonthlyIncome: 15_000,     // ₹15K/month minimum
        maxEnquiries90Days: 3,
        maxOverdueAccounts: 0,
        maxBounces: 2,
        maxFraudScore: 60,         // 0–100 scale; above 60 = hard reject
        minBankMonthsAnalysed: 3,
        rateGrid: [
            { minScore: 800, maxScore: 900, rate: 14.00 },
            { minScore: 750, maxScore: 799, rate: 16.00 },
            { minScore: 700, maxScore: 749, rate: 18.00 },
            { minScore: 650, maxScore: 699, rate: 21.00 },
            { minScore: 600, maxScore: 649, rate: 24.00 },
            { minScore: 300, maxScore: 599, rate: 28.00 }, // Below minimum — referred
        ],
    };
}

// ─── Response shaper ──────────────────────────────────────────────────────────

function toResponse(report: UnderwritingReport): UnderwritingReportResponse {
    return {
        id: report.id,
        loanId: report.loanId,
        decision: report.decision,
        internalScore: report.internalScore,
        creditScore: report.creditScore,
        foir: report.foir,
        monthlyIncome: report.monthlyIncome,
        requestedEmi: report.requestedEmi,
        recommendedAmount: report.recommendedAmount,
        recommendedRate: report.recommendedRate,
        recommendedTenure: report.recommendedTenure,
        maxEligibleAmount: report.maxEligibleAmount,
        rejectionReasons: report.rejectionReasons,
        referralReasons: report.referralReasons,
        ruleResults: report.ruleResults,
        completedAt: report.completedAt,
    };
}

// ─── Decision logic ────────────────────────────────────────────────────────────
//
// APPROVED  → all rules pass, score ≥ 70, no hard fails
// REJECTED  → any hard fail rule triggered
// REFERRED  → no hard fail, but soft fails or score < 70
//             credit manager must review before the loan moves forward

function deriveDecision(params: {
    hasHardFail: boolean;
    internalScore: number;
    failedRules: number;
}): UnderwritingDecision {
    if (params.hasHardFail) return 'REJECTED';
    if (params.internalScore >= 70 && params.failedRules === 0) return 'APPROVED';
    return 'REFERRED';
}

// ─── Service ───────────────────────────────────────────────────────────────────

export const underwritingService = {

    // ── 1. Run underwriting ────────────────────────────────────────────────────
    // Called by the loan lifecycle when status moves to UNDERWRITING.
    // Produces an underwriting report, updates the loan status, and returns.

    async runUnderwriting(
        input: RunUnderwritingInput,
        req: Request,
    ): Promise<UnderwritingReportResponse> {
        const { loanId, userId, requestedAmount, tenureMonths } = input;

        log.info('Starting underwriting', { loanId, userId, requestedAmount });

        // ── Fetch KYC underwriting data ─────────────────────────────────────────
        const kycData = await kycRepository.getUnderwritingData(userId);

        if (!kycData) {
            throw new KycIncompleteError(userId, ['KYC data not available']);
        }

        const config = buildConfig();

        // ── Compute requested EMI ──────────────────────────────────────────────
        // Use the rate from the grid before we know credit score
        // (conservative estimate — will be refined at approval stage)
        const estimatedRate = lookupInterestRate(kycData.creditScore, config);
        const requestedEmi = computeMonthlyEmi(
            requestedAmount, estimatedRate, tenureMonths,
        );

        // ── Build rule context ─────────────────────────────────────────────────
        const ctx: RuleContext = {
            loanId,
            requestedAmount,
            tenureMonths,
            productType: input.productType,
            requestedEmi,
            kyc: kycData,
            config,
        };

        // ── Run all rules ──────────────────────────────────────────────────────
        const engineResult = runRuleEngine(ctx);

        // ── Derive decision ────────────────────────────────────────────────────
        const decision = deriveDecision({
            hasHardFail: engineResult.hasHardFail,
            internalScore: engineResult.internalScore,
            failedRules: engineResult.failedRules,
        });

        // ── FOIR ───────────────────────────────────────────────────────────────
        const income = kycData.averageMonthlyIncome;
        const existingEmis = kycData.existingEmiPerMonth ?? 0;

        const foir = income && income > 0
            ? roundRupees((existingEmis + requestedEmi) / income)
            : null;

        const dti = income && income > 0 && kycData.existingEmiPerMonth
            ? roundRupees(kycData.existingEmiPerMonth / income)
            : null;

        // ── Recommended terms (for APPROVED and REFERRED) ──────────────────────
        let recommendedAmount: number | null = null;
        let recommendedRate: number | null = null;
        let recommendedTenure: number | null = null;
        let maxEligibleAmount: number | null = null;

        if (decision !== 'REJECTED') {
            recommendedRate = lookupInterestRate(kycData.creditScore, config);
            recommendedTenure = tenureMonths;
            maxEligibleAmount = computeMaxEligibleAmount({
                monthlyIncome: income,
                existingEmis,
                interestRate: recommendedRate,
                tenureMonths,
                maxFoir: config.maxFoir,
                maxLoanAmount: env.business.maxLoanAmount,
            });

            // Recommend the lesser of requested amount and max eligible
            recommendedAmount = Math.min(requestedAmount, maxEligibleAmount);
        }

        // ── Collect rejection / referral reasons ───────────────────────────────
        const failedRuleResults = engineResult.ruleResults.filter((r) => !r.passed);
        const rejectionReasons = engineResult.hasHardFail
            ? failedRuleResults
                .filter((r) => r.hardFail)
                .map((r) => r.message)
            : [];
        const referralReasons = decision === 'REFERRED'
            ? failedRuleResults
                .filter((r) => !r.hardFail)
                .map((r) => r.message)
            : [];

        // ── Persist report ─────────────────────────────────────────────────────
        const report = await underwritingRepository.create({
            loanId,
            userId,
            decision,
            creditScore: kycData.creditScore,
            internalScore: engineResult.internalScore,
            fraudScore: kycData.fraudScore,
            monthlyIncome: income,
            existingEmiPerMonth: existingEmis || null,
            requestedEmi,
            foir,
            dti,
            ruleResults: engineResult.ruleResults,
            passedRules: engineResult.passedRules,
            failedRules: engineResult.failedRules,
            hardFailRules: engineResult.hardFailRules,
            recommendedAmount,
            recommendedRate,
            recommendedTenure,
            maxEligibleAmount,
            rejectionReasons,
            referralReasons,
            notes: null,
            completedAt: new Date(),
        });

        // ── Update loan status based on decision ───────────────────────────────
        setAuditContext(req, {
            action: 'UNDERWRITING_COMPLETED',
            entityType: 'underwriting_reports',
            entityId: report.id,
            after: {
                decision,
                internalScore: engineResult.internalScore,
                creditScore: kycData.creditScore,
            },
        });

        switch (decision) {
            case 'APPROVED':
            case 'REFERRED':
                // Both advance to PENDING_APPROVAL —
                // REFERRED means credit manager must review before approving
                await loansService.submitForApproval(loanId, req);
                break;

            case 'REJECTED':
                await loansService.rejectLoan(
                    {
                        loanId,
                        rejectedBy: 'system:underwriting',
                        reason: rejectionReasons.join('; '),
                    },
                    req,
                );
                underwritingEvents.autoRejected({
                    loanId,
                    userId,
                    hardFailRules: engineResult.hardFailRules,
                    rejectionReasons,
                    requestId: req.requestId,
                });
                break;
        }

        underwritingEvents.completed({
            loanId,
            userId,
            reportId: report.id,
            decision,
            internalScore: engineResult.internalScore,
            creditScore: kycData.creditScore,
            requestId: req.requestId,
        });

        log.info('Underwriting completed', {
            loanId,
            reportId: report.id,
            decision,
            internalScore: engineResult.internalScore,
            passedRules: engineResult.passedRules,
            failedRules: engineResult.failedRules,
            hardFails: engineResult.hardFailRules,
        });

        return toResponse(report);
    },

    // ── 2. Credit manager review (REFERRED loans) ─────────────────────────────
    // The credit manager reviews a REFERRED report and approves or rejects.
    // Override terms are validated against the max eligible amount.

    async creditManagerReview(
        input: CreditManagerReviewInput,
        req: Request,
    ): Promise<UnderwritingReportResponse> {
        const report = await underwritingRepository.findByIdOrThrow(input.reportId);

        if (report.decision !== 'REFERRED') {
            throw new DomainError(
                `Only REFERRED reports can be reviewed. This report is: ${report.decision}`,
                'INVALID_REVIEW_STATE',
                { reportId: input.reportId, currentDecision: report.decision },
            );
        }

        // Validate override terms if provided
        if (input.overrideAmount && report.maxEligibleAmount) {
            if (input.overrideAmount > report.maxEligibleAmount) {
                throw new DomainError(
                    `Override amount ₹${input.overrideAmount.toLocaleString('en-IN')} ` +
                    `exceeds maximum eligible ₹${report.maxEligibleAmount.toLocaleString('en-IN')}`,
                    'OVERRIDE_EXCEEDS_ELIGIBLE',
                    {
                        overrideAmount: input.overrideAmount,
                        maxEligibleAmount: report.maxEligibleAmount,
                    },
                );
            }
        }

        const newDecision: UnderwritingDecision =
            input.decision === 'APPROVED' ? 'APPROVED' : 'REJECTED';

        const updated = await underwritingRepository.updateDecision(
            report.id,
            newDecision,
            input.notes,
            {
                recommended_amount: input.overrideAmount ?? report.recommendedAmount,
                recommended_rate: input.overrideRate ?? report.recommendedRate,
                recommended_tenure: input.overrideTenure ?? report.recommendedTenure,
            },
        );

        setAuditContext(req, {
            action: AUDIT_ACTION.ADMIN_OVERRIDE,
            entityType: 'underwriting_reports',
            entityId: report.id,
            before: { decision: report.decision },
            after: {
                decision: newDecision,
                reviewedBy: input.reviewedBy,
                notes: input.notes,
            },
        });

        // Advance or reject the loan
        if (input.decision === 'APPROVED') {
            await loansService.submitForApproval(report.loanId, req);
        } else {
            await loansService.rejectLoan(
                {
                    loanId: report.loanId,
                    rejectedBy: input.reviewedBy,
                    reason: input.notes,
                },
                req,
            );
        }

        log.info('Credit manager review completed', {
            reportId: report.id,
            loanId: report.loanId,
            decision: newDecision,
            reviewedBy: input.reviewedBy,
        });

        return toResponse(updated);
    },

    // ── 3. Get report by loan ──────────────────────────────────────────────────

    async getReportByLoan(
        loanId: string,
        userId: string,
        role: string,
    ): Promise<UnderwritingReportResponse> {
        const staffRoles = new Set([
            'OPS_EXECUTIVE', 'CREDIT_MANAGER', 'FINANCE', 'SUPER_ADMIN',
        ]);

        const report = await underwritingRepository.findLatestByLoanIdOrThrow(loanId);

        // Customers cannot access underwriting reports — this is internal data
        if (!staffRoles.has(role)) {
            throw new ForbiddenError(
                'Underwriting reports are only accessible to internal staff',
            );
        }

        return toResponse(report);
    },

    // ── 4. Get report by ID ────────────────────────────────────────────────────

    async getReport(
        reportId: string,
        role: string,
    ): Promise<UnderwritingReportResponse> {
        const staffRoles = new Set([
            'OPS_EXECUTIVE', 'CREDIT_MANAGER', 'FINANCE', 'SUPER_ADMIN',
        ]);

        if (!staffRoles.has(role)) {
            throw new ForbiddenError('Access denied');
        }

        const report = await underwritingRepository.findByIdOrThrow(reportId);
        return toResponse(report);
    },

    // ── 5. List reports ────────────────────────────────────────────────────────

    async listReports(input: ListUnderwritingReportsInput) {
        return underwritingRepository.list(input);
    },

    // ── 6. Re-run underwriting ─────────────────────────────────────────────────
    // Used when KYC data changes after initial run (e.g. updated bank statement).
    // Creates a new report — previous reports are preserved for audit.

    async rerunUnderwriting(
        loanId: string,
        req: Request,
    ): Promise<UnderwritingReportResponse> {
        const loan = await loansRepository.findApplicationByIdOrThrow(loanId);

        // Only REFERRED or UNDERWRITING loans can be re-run
        const rerunableStatuses = [LOAN_STATUS.UNDERWRITING, LOAN_STATUS.PENDING_APPROVAL];
        if (!rerunableStatuses.includes(loan.status)) {
            throw new DomainError(
                `Underwriting cannot be re-run for a loan in status: ${loan.status}`,
                'INVALID_RERUN_STATE',
                { loanId, currentStatus: loan.status },
            );
        }

        log.info('Re-running underwriting', { loanId });

        return this.runUnderwriting(
            {
                loanId,
                userId: loan.userId,
                requestedAmount: loan.amountRequested,
                tenureMonths: loan.tenureMonths,
                productType: loan.productType,
            },
            req,
        );
    },
};