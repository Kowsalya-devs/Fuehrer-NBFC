// src/modules/underwriting/underwriting.types.ts
import type { Rupees } from '@/types/common.types';

// ─── Underwriting decision outcomes ───────────────────────────────────────────

export type UnderwritingDecision =
    | 'APPROVED'          // All rules passed — proceed to credit manager
    | 'REJECTED'          // Hard rule failed — no override possible
    | 'REFERRED'          // Soft rules flagged — needs manual credit manager review
    | 'PENDING';          // Still running checks

// ─── Individual rule result ────────────────────────────────────────────────────
// Every rule produces one of these. The full list is stored for audit.

export interface RuleResult {
    ruleId: string;         // e.g. 'CREDIT_SCORE_MINIMUM'
    ruleName: string;         // Human-readable
    category: RuleCategory;
    weight: number;         // 0–100, used for scoring
    passed: boolean;
    hardFail: boolean;        // If true and failed → immediate REJECTED
    value: number | string | boolean | null;  // Actual value checked
    threshold: number | string | boolean | null;  // The rule's threshold
    message: string;         // What the rule checked and why it passed/failed
}

export type RuleCategory =
    | 'CREDIT_HISTORY'
    | 'INCOME'
    | 'OBLIGATIONS'
    | 'FRAUD_RISK'
    | 'BUREAU'
    | 'IDENTITY'
    | 'LOAN_SPECIFIC';

// ─── Underwriting report — the full credit assessment ─────────────────────────

export interface UnderwritingReport {
    id: string;
    loanId: string;
    userId: string;

    decision: UnderwritingDecision;

    // Scores
    creditScore: number | null;
    internalScore: number;           // 0–100 composite score from all rules
    fraudScore: number | null;

    // Financial metrics
    monthlyIncome: Rupees | null;
    existingEmiPerMonth: Rupees | null;
    requestedEmi: Rupees;
    foir: number | null;    // Fixed Obligation to Income Ratio (0–1)
    dti: number | null;    // Debt to Income ratio (0–1)

    // Rule evaluation
    ruleResults: RuleResult[];
    passedRules: number;
    failedRules: number;
    hardFailRules: string[];         // ruleIds that caused hard rejection

    // Recommended terms (populated on APPROVED / REFERRED)
    recommendedAmount: Rupees | null;
    recommendedRate: number | null;   // Annual %
    recommendedTenure: number | null;   // Months
    maxEligibleAmount: Rupees | null;

    rejectionReasons: string[];
    referralReasons: string[];
    notes: string | null;   // Credit manager notes on REFERRED

    completedAt: Date;
    createdAt: Date;
    updatedAt: Date;
}

// ─── Inputs ───────────────────────────────────────────────────────────────────

export interface RunUnderwritingInput {
    loanId: string;
    userId: string;
    requestedAmount: Rupees;
    tenureMonths: number;
    productType: string;
}

export interface CreditManagerReviewInput {
    reportId: string;
    reviewedBy: string;
    decision: 'APPROVED' | 'REJECTED';
    notes: string;
    // Override terms (only when approving a REFERRED case)
    overrideAmount?: Rupees;
    overrideRate?: number;
    overrideTenure?: number;
}

// ─── Rule engine config ────────────────────────────────────────────────────────
// All thresholds in one place — can be overridden from env for A/B testing

export interface UnderwritingConfig {
    minCreditScore: number;
    maxFoir: number;    // 0–1
    maxDti: number;    // 0–1
    minMonthlyIncome: Rupees;
    maxEnquiries90Days: number;
    maxOverdueAccounts: number;
    maxBounces: number;
    maxFraudScore: number;    // 0–100 (higher = riskier)
    minBankMonthsAnalysed: number;
    // Rate grid — interestRate = base + spread based on score
    rateGrid: Array<{
        minScore: number;
        maxScore: number;
        rate: number;   // Annual %
    }>;
}

// ─── List / history ───────────────────────────────────────────────────────────

export interface ListUnderwritingReportsInput {
    loanId?: string;
    userId?: string;
    decision?: UnderwritingDecision;
    page: number;
    limit: number;
}

// ─── Public response shape ────────────────────────────────────────────────────

export interface UnderwritingReportResponse {
    id: string;
    loanId: string;
    decision: UnderwritingDecision;
    internalScore: number;
    creditScore: number | null;
    foir: number | null;
    monthlyIncome: Rupees | null;
    requestedEmi: Rupees;
    recommendedAmount: Rupees | null;
    recommendedRate: number | null;
    recommendedTenure: number | null;
    maxEligibleAmount: Rupees | null;
    rejectionReasons: string[];
    referralReasons: string[];
    ruleResults: RuleResult[];
    completedAt: Date;
}
