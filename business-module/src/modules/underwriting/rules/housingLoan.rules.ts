// src/modules/underwriting/rules/housingLoan.rules.ts

import type { RuleContext, RuleDefinition } from '../underwriting.rules';
import type { RuleResult } from '../underwriting.types';
import type { Rupees } from '@/types/common.types';

const HOUSING_LOAN = {
    MAX_AMOUNT_RUPEES:    50_00_000,
    MIN_AMOUNT_RUPEES:     5_00_000,
    MAX_TENURE_MONTHS:         360,
    MIN_TENURE_MONTHS:          60,
    MAX_LTV_RATIO:            0.80,
    MIN_CREDIT_SCORE:          650,
    MAX_FOIR:                 0.50,
    MIN_MONTHLY_INCOME:    25_000,
    MIN_PROPERTY_VALUE:    6_25_000,
    PMAY_EWS_MAX_INCOME:    3_00_000,
    PMAY_LIG_MAX_INCOME:    6_00_000,
    PMAY_MIG1_MAX_INCOME:  12_00_000,
    PMAY_MIG2_MAX_INCOME:  18_00_000,
    PMAY_EWS_SUBSIDY:    2_67_280,
    PMAY_LIG_SUBSIDY:    2_67_280,
    PMAY_MIG1_SUBSIDY:   2_35_068,
    PMAY_MIG2_SUBSIDY:   2_30_156,
} as const;

function pass(def: Omit<RuleDefinition, 'evaluate'>, value: RuleResult['value'], threshold: RuleResult['threshold'], message: string): RuleResult {
    return { ruleId: def.id, ruleName: def.name, category: def.category, weight: def.weight, hardFail: def.hardFail, passed: true, value, threshold, message };
}

function fail(def: Omit<RuleDefinition, 'evaluate'>, value: RuleResult['value'], threshold: RuleResult['threshold'], message: string): RuleResult {
    return { ruleId: def.id, ruleName: def.name, category: def.category, weight: def.weight, hardFail: def.hardFail, passed: false, value, threshold, message };
}

export const HOUSING_LOAN_RULES: RuleDefinition[] = [
    {
        id: 'HL_MAX_LOAN_AMOUNT', name: 'Housing loan maximum amount',
        category: 'LOAN_SPECIFIC', weight: 20, hardFail: true,
        evaluate(ctx: RuleContext) {
            const amount = Number(ctx.requestedAmount);
            const max = HOUSING_LOAN.MAX_AMOUNT_RUPEES;
            return amount > max
                ? fail(this, amount, max, `Requested ₹${amount.toLocaleString('en-IN')} exceeds max ₹${max.toLocaleString('en-IN')}`)
                : pass(this, amount, max, `Loan amount within housing limit`);
        },
    },
    {
        id: 'HL_MIN_LOAN_AMOUNT', name: 'Housing loan minimum amount',
        category: 'LOAN_SPECIFIC', weight: 10, hardFail: true,
        evaluate(ctx: RuleContext) {
            const amount = Number(ctx.requestedAmount);
            const min = HOUSING_LOAN.MIN_AMOUNT_RUPEES;
            return amount < min
                ? fail(this, amount, min, `Requested ₹${amount.toLocaleString('en-IN')} below min ₹${min.toLocaleString('en-IN')}`)
                : pass(this, amount, min, `Loan amount above housing minimum`);
        },
    },
    {
        id: 'HL_MAX_TENURE', name: 'Housing loan maximum tenure',
        category: 'LOAN_SPECIFIC', weight: 10, hardFail: true,
        evaluate(ctx: RuleContext) {
            const tenure = ctx.tenureMonths;
            const max = HOUSING_LOAN.MAX_TENURE_MONTHS;
            return tenure > max
                ? fail(this, tenure, max, `Tenure ${tenure} months exceeds max ${max} months`)
                : pass(this, tenure, max, `Tenure within housing limit`);
        },
    },
    {
        id: 'HL_LTV_RATIO', name: 'Housing loan LTV ratio',
        category: 'LOAN_SPECIFIC', weight: 25, hardFail: true,
        evaluate(ctx: RuleContext) {
            const propertyValue = (ctx.kyc as unknown as { propertyValue?: number }).propertyValue;
            if (!propertyValue || propertyValue <= 0) {
                return fail(this, null, HOUSING_LOAN.MAX_LTV_RATIO, 'Property value not provided — cannot calculate LTV');
            }
            const ltv = Number(ctx.requestedAmount) / propertyValue;
            const maxLtv = HOUSING_LOAN.MAX_LTV_RATIO;
            return ltv > maxLtv
                ? fail(this, Math.round(ltv * 100), Math.round(maxLtv * 100), `LTV ${(ltv * 100).toFixed(1)}% exceeds RBI cap of ${maxLtv * 100}%`)
                : pass(this, Math.round(ltv * 100), Math.round(maxLtv * 100), `LTV within RBI limit`);
        },
    },
    {
        id: 'HL_CREDIT_SCORE', name: 'Housing loan minimum credit score',
        category: 'BUREAU', weight: 25, hardFail: false,
        evaluate(ctx: RuleContext) {
            const score = ctx.kyc.creditScore;
            const min = HOUSING_LOAN.MIN_CREDIT_SCORE;
            if (score === null) return fail(this, null, min, 'No credit score — manual review required');
            return score < min
                ? fail(this, score, min, `Credit score ${score} below housing minimum of ${min}`)
                : pass(this, score, min, `Credit score ${score} meets housing minimum`);
        },
    },
    {
        id: 'HL_MIN_INCOME', name: 'Housing loan minimum monthly income',
        category: 'INCOME', weight: 15, hardFail: false,
        evaluate(ctx: RuleContext) {
            // KycUnderwritingData field is averageMonthlyIncome
            const income = ctx.kyc.averageMonthlyIncome;
            const min = HOUSING_LOAN.MIN_MONTHLY_INCOME;
            if (income === null) return fail(this, null, min, 'Monthly income not verified');
            return income < min
                ? fail(this, income, min, `Income ₹${income.toLocaleString('en-IN')} below housing minimum ₹${min.toLocaleString('en-IN')}`)
                : pass(this, income, min, `Income meets housing minimum`);
        },
    },
    {
        id: 'HL_FOIR', name: 'Housing loan FOIR check',
        category: 'OBLIGATIONS', weight: 20, hardFail: false,
        evaluate(ctx: RuleContext) {
            // KycUnderwritingData field is averageMonthlyIncome
            const income = ctx.kyc.averageMonthlyIncome;
            const existEmi = ctx.kyc.existingEmiPerMonth ?? 0;
            const newEmi = Number(ctx.requestedEmi);
            const maxFoir = HOUSING_LOAN.MAX_FOIR;
            if (!income || income <= 0) return fail(this, null, maxFoir, 'Cannot compute FOIR — monthly income not available');
            const foir = (existEmi + newEmi) / income;
            return foir > maxFoir
                ? fail(this, Math.round(foir * 100), Math.round(maxFoir * 100), `FOIR ${(foir * 100).toFixed(1)}% exceeds housing limit of ${maxFoir * 100}%`)
                : pass(this, Math.round(foir * 100), Math.round(maxFoir * 100), `FOIR within housing limit`);
        },
    },
];

export interface PmayEligibility {
    eligible:      boolean;
    category:      'EWS' | 'LIG' | 'MIG-I' | 'MIG-II' | null;
    subsidyAmount: Rupees;
    subsidyLabel:  string;
}

export function calculatePmayEligibility(annualIncomeRupees: number, _loanAmountRupees: number): PmayEligibility {
    if (annualIncomeRupees <= HOUSING_LOAN.PMAY_EWS_MAX_INCOME)  return { eligible: true,  category: 'EWS',    subsidyAmount: HOUSING_LOAN.PMAY_EWS_SUBSIDY,  subsidyLabel: `EWS — subsidy of ₹${HOUSING_LOAN.PMAY_EWS_SUBSIDY.toLocaleString('en-IN')}` };
    if (annualIncomeRupees <= HOUSING_LOAN.PMAY_LIG_MAX_INCOME)  return { eligible: true,  category: 'LIG',    subsidyAmount: HOUSING_LOAN.PMAY_LIG_SUBSIDY,  subsidyLabel: `LIG — subsidy of ₹${HOUSING_LOAN.PMAY_LIG_SUBSIDY.toLocaleString('en-IN')}` };
    if (annualIncomeRupees <= HOUSING_LOAN.PMAY_MIG1_MAX_INCOME) return { eligible: true,  category: 'MIG-I',  subsidyAmount: HOUSING_LOAN.PMAY_MIG1_SUBSIDY, subsidyLabel: `MIG-I — subsidy of ₹${HOUSING_LOAN.PMAY_MIG1_SUBSIDY.toLocaleString('en-IN')}` };
    if (annualIncomeRupees <= HOUSING_LOAN.PMAY_MIG2_MAX_INCOME) return { eligible: true,  category: 'MIG-II', subsidyAmount: HOUSING_LOAN.PMAY_MIG2_SUBSIDY, subsidyLabel: `MIG-II — subsidy of ₹${HOUSING_LOAN.PMAY_MIG2_SUBSIDY.toLocaleString('en-IN')}` };
    return { eligible: false, category: null, subsidyAmount: 0, subsidyLabel: 'Not eligible — annual income exceeds PMAY limit of ₹18L' };
}
