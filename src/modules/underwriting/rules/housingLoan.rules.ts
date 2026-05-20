// src/modules/underwriting/rules/housingLoan.rules.ts
//
// Underwriting rules specific to Affordable Housing Loans.
//
// These rules run IN ADDITION to the base CDL rules in underwriting.rules.ts
// when product_type === 'affordable_housing'.
//
// Housing loan specific constraints (RBI Housing Finance norms):
//   - Loan amount: up to ₹50 lakhs
//   - Tenure: up to 30 years (360 months)
//   - LTV cap: 80% of property value
//   - Minimum credit score: 650 (higher than CDL at 600)
//   - Maximum FOIR: 0.50 (50% of income)
//   - PMAY subsidy: up to ₹2.67L for eligible EWS/LIG/MIG applicants
//
// Rule design follows the same pattern as underwriting.rules.ts:
//   - Pure functions: (ctx) → RuleResult
//   - Hard fails = immediate rejection, no override
//   - Soft fails = referred to credit manager
//   - All rules run even after hard fail — complete audit record

import { computeMonthlyEmi } from '@/modules/emi/emi.calculator';
import type { RuleContext, RuleDefinition } from '../underwriting.rules';
import type { RuleResult } from '../underwriting.types';
import type { Rupees } from '@/types/common.types';

// ─── Housing loan constants ───────────────────────────────────────────────────

const HOUSING_LOAN = {
    MAX_AMOUNT_RUPEES: 50_00_000,   // ₹50 lakhs
    MIN_AMOUNT_RUPEES: 5_00_000,   // ₹5 lakhs minimum
    MAX_TENURE_MONTHS: 360,   // 30 years
    MIN_TENURE_MONTHS: 60,   // 5 years minimum
    MAX_LTV_RATIO: 0.80,   // 80% of property value
    MIN_CREDIT_SCORE: 650,   // Higher than CDL minimum
    MAX_FOIR: 0.50,   // 50% fixed obligation to income ratio
    MIN_MONTHLY_INCOME: 25_000,   // ₹25,000 minimum for housing loans
    MIN_PROPERTY_VALUE: 6_25_000,  // ₹6.25L (80% LTV of ₹5L min loan)

    // PMAY (Pradhan Mantri Awas Yojana) income limits
    PMAY_EWS_MAX_INCOME: 3_00_000,  // EWS: up to ₹3L annual
    PMAY_LIG_MAX_INCOME: 6_00_000,  // LIG: ₹3L–₹6L annual
    PMAY_MIG1_MAX_INCOME: 12_00_000,  // MIG-I: ₹6L–₹12L annual
    PMAY_MIG2_MAX_INCOME: 18_00_000,  // MIG-II: ₹12L–₹18L annual

    // PMAY subsidy amounts (CLSSs — Credit Linked Subsidy Scheme)
    PMAY_EWS_SUBSIDY: 2_67_280,   // ₹2,67,280
    PMAY_LIG_SUBSIDY: 2_67_280,   // ₹2,67,280
    PMAY_MIG1_SUBSIDY: 2_35_068,   // ₹2,35,068
    PMAY_MIG2_SUBSIDY: 2_30_156,   // ₹2,30,156
} as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pass(
    def: Omit<RuleDefinition, 'evaluate'>,
    value: RuleResult['value'],
    threshold: RuleResult['threshold'],
    message: string,
): RuleResult {
    return {
        ruleId: def.id,
        ruleName: def.name,
        category: def.category,
        weight: def.weight,
        hardFail: def.hardFail,
        passed: true,
        value,
        threshold,
        message,
    };
}

function fail(
    def: Omit<RuleDefinition, 'evaluate'>,
    value: RuleResult['value'],
    threshold: RuleResult['threshold'],
    message: string,
): RuleResult {
    return {
        ruleId: def.id,
        ruleName: def.name,
        category: def.category,
        weight: def.weight,
        hardFail: def.hardFail,
        passed: false,
        value,
        threshold,
        message,
    };
}

// ─── Housing loan rule definitions ────────────────────────────────────────────

export const HOUSING_LOAN_RULES: RuleDefinition[] = [

    // ── LOAN_SPECIFIC: Maximum loan amount ────────────────────────────────────
    {
        id: 'HL_MAX_LOAN_AMOUNT',
        name: 'Housing loan maximum amount',
        category: 'LOAN_SPECIFIC',
        weight: 20,
        hardFail: true,   // Hard fail — cannot exceed ₹50L without NHB licence
        evaluate(ctx) {
            const amount = Number(ctx.requestedAmount);
            const max = HOUSING_LOAN.MAX_AMOUNT_RUPEES;

            if (amount > max) {
                return fail(this, amount, max,
                    `Requested amount ₹${amount.toLocaleString('en-IN')} exceeds ` +
                    `housing loan maximum of ₹${max.toLocaleString('en-IN')}`,
                );
            }
            return pass(this, amount, max,
                `Loan amount ₹${amount.toLocaleString('en-IN')} within housing limit`,
            );
        },
    },

    // ── LOAN_SPECIFIC: Minimum loan amount ────────────────────────────────────
    {
        id: 'HL_MIN_LOAN_AMOUNT',
        name: 'Housing loan minimum amount',
        category: 'LOAN_SPECIFIC',
        weight: 10,
        hardFail: true,
        evaluate(ctx) {
            const amount = Number(ctx.requestedAmount);
            const min = HOUSING_LOAN.MIN_AMOUNT_RUPEES;

            if (amount < min) {
                return fail(this, amount, min,
                    `Requested amount ₹${amount.toLocaleString('en-IN')} below ` +
                    `housing loan minimum of ₹${min.toLocaleString('en-IN')}`,
                );
            }
            return pass(this, amount, min,
                `Loan amount ₹${amount.toLocaleString('en-IN')} above housing minimum`,
            );
        },
    },

    // ── LOAN_SPECIFIC: Maximum tenure ─────────────────────────────────────────
    {
        id: 'HL_MAX_TENURE',
        name: 'Housing loan maximum tenure',
        category: 'LOAN_SPECIFIC',
        weight: 10,
        hardFail: true,
        evaluate(ctx) {
            const tenure = ctx.tenureMonths;
            const max = HOUSING_LOAN.MAX_TENURE_MONTHS;

            if (tenure > max) {
                return fail(this, tenure, max,
                    `Requested tenure ${tenure} months exceeds maximum ${max} months (30 years)`,
                );
            }
            return pass(this, tenure, max,
                `Tenure ${tenure} months within housing loan limit`,
            );
        },
    },

    // ── LOAN_SPECIFIC: LTV ratio check ────────────────────────────────────────
    {
        id: 'HL_LTV_RATIO',
        name: 'Housing loan LTV ratio',
        category: 'LOAN_SPECIFIC',
        weight: 25,
        hardFail: true,   // LTV cap is an RBI mandate — no override
        evaluate(ctx) {
            const propertyValue = (ctx.kyc as unknown as {
                propertyValue?: number;
            }).propertyValue;

            if (!propertyValue || propertyValue <= 0) {
                return fail(this, null, HOUSING_LOAN.MAX_LTV_RATIO,
                    'Property value not provided — cannot calculate LTV',
                );
            }

            const loanAmount = Number(ctx.requestedAmount);
            const ltv = loanAmount / propertyValue;
            const maxLtv = HOUSING_LOAN.MAX_LTV_RATIO;

            if (ltv > maxLtv) {
                return fail(this, Math.round(ltv * 100), Math.round(maxLtv * 100),
                    `LTV ratio ${(ltv * 100).toFixed(1)}% exceeds RBI cap of ${maxLtv * 100}%`,
                );
            }
            return pass(this, Math.round(ltv * 100), Math.round(maxLtv * 100),
                `LTV ratio ${(ltv * 100).toFixed(1)}% within RBI limit of ${maxLtv * 100}%`,
            );
        },
    },

    // ── BUREAU: Higher minimum credit score for housing loans ─────────────────
    {
        id: 'HL_CREDIT_SCORE',
        name: 'Housing loan minimum credit score',
        category: 'BUREAU',
        weight: 25,
        hardFail: false,  // Soft fail — credit manager can override with justification
        evaluate(ctx) {
            const score = ctx.kyc.creditScore;
            const min = HOUSING_LOAN.MIN_CREDIT_SCORE;

            if (score === null) {
                return fail(this, null, min,
                    'No credit score — NTC applicants require enhanced manual review for housing loans',
                );
            }
            if (score < min) {
                return fail(this, score, min,
                    `Credit score ${score} below housing loan minimum of ${min}`,
                );
            }
            return pass(this, score, min,
                `Credit score ${score} meets housing loan minimum of ${min}`,
            );
        },
    },

    // ── INCOME: Minimum monthly income ────────────────────────────────────────
    {
        id: 'HL_MIN_INCOME',
        name: 'Housing loan minimum monthly income',
        category: 'INCOME',
        weight: 15,
        hardFail: false,
        evaluate(ctx) {
            const income = ctx.kyc.monthlyIncome;
            const min = HOUSING_LOAN.MIN_MONTHLY_INCOME;

            if (income === null) {
                return fail(this, null, min,
                    'Monthly income not verified — bank statement analysis required',
                );
            }
            if (income < min) {
                return fail(this, income, min,
                    `Monthly income ₹${income.toLocaleString('en-IN')} below ` +
                    `housing loan minimum of ₹${min.toLocaleString('en-IN')}`,
                );
            }
            return pass(this, income, min,
                `Monthly income ₹${income.toLocaleString('en-IN')} meets housing minimum`,
            );
        },
    },

    // ── OBLIGATIONS: FOIR check (stricter than CDL) ────────────────────────────
    {
        id: 'HL_FOIR',
        name: 'Housing loan FOIR check',
        category: 'OBLIGATIONS',
        weight: 20,
        hardFail: false,
        evaluate(ctx) {
            const income = ctx.kyc.monthlyIncome;
            const existEmi = ctx.kyc.existingEmiPerMonth ?? 0;
            const newEmi = Number(ctx.requestedEmi);
            const maxFoir = HOUSING_LOAN.MAX_FOIR;

            if (!income || income <= 0) {
                return fail(this, null, maxFoir,
                    'Cannot compute FOIR — monthly income not available',
                );
            }

            const totalObligation = existEmi + newEmi;
            const foir = totalObligation / income;

            if (foir > maxFoir) {
                return fail(this, Math.round(foir * 100), Math.round(maxFoir * 100),
                    `FOIR ${(foir * 100).toFixed(1)}% exceeds housing loan limit of ${maxFoir * 100}%`,
                );
            }
            return pass(this, Math.round(foir * 100), Math.round(maxFoir * 100),
                `FOIR ${(foir * 100).toFixed(1)}% within housing loan limit of ${maxFoir * 100}%`,
            );
        },
    },
];

// ─── PMAY subsidy calculator ──────────────────────────────────────────────────
// Called separately from the rule engine — not a pass/fail rule but a
// benefit calculation used to show the customer their subsidy amount.

export interface PmayEligibility {
    eligible: boolean;
    category: 'EWS' | 'LIG' | 'MIG-I' | 'MIG-II' | null;
    subsidyAmount: Rupees;
    subsidyLabel: string;
}

export function calculatePmayEligibility(
    annualIncomeRupees: number,
    loanAmountRupees: number,
): PmayEligibility {
    // PMAY only applies to loans up to ₹18L income bracket
    // and property value up to ₹45L for MIG

    if (annualIncomeRupees <= HOUSING_LOAN.PMAY_EWS_MAX_INCOME) {
        return {
            eligible: true,
            category: 'EWS',
            subsidyAmount: HOUSING_LOAN.PMAY_EWS_SUBSIDY,
            subsidyLabel: `EWS — subsidy of ₹${HOUSING_LOAN.PMAY_EWS_SUBSIDY.toLocaleString('en-IN')}`,
        };
    }
    if (annualIncomeRupees <= HOUSING_LOAN.PMAY_LIG_MAX_INCOME) {
        return {
            eligible: true,
            category: 'LIG',
            subsidyAmount: HOUSING_LOAN.PMAY_LIG_SUBSIDY,
            subsidyLabel: `LIG — subsidy of ₹${HOUSING_LOAN.PMAY_LIG_SUBSIDY.toLocaleString('en-IN')}`,
        };
    }
    if (annualIncomeRupees <= HOUSING_LOAN.PMAY_MIG1_MAX_INCOME) {
        return {
            eligible: true,
            category: 'MIG-I',
            subsidyAmount: HOUSING_LOAN.PMAY_MIG1_SUBSIDY,
            subsidyLabel: `MIG-I — subsidy of ₹${HOUSING_LOAN.PMAY_MIG1_SUBSIDY.toLocaleString('en-IN')}`,
        };
    }
    if (annualIncomeRupees <= HOUSING_LOAN.PMAY_MIG2_MAX_INCOME) {
        return {
            eligible: true,
            category: 'MIG-II',
            subsidyAmount: HOUSING_LOAN.PMAY_MIG2_SUBSIDY,
            subsidyLabel: `MIG-II — subsidy of ₹${HOUSING_LOAN.PMAY_MIG2_SUBSIDY.toLocaleString('en-IN')}`,
        };
    }

    return {
        eligible: false,
        category: null,
        subsidyAmount: 0,
        subsidyLabel: 'Not eligible — annual income exceeds PMAY limit of ₹18L',
    };
}