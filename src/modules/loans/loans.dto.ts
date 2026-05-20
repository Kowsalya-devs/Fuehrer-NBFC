// src/modules/loans/loans.dto.ts
import Joi from 'joi';
import { commonSchemas } from '@/middlewares';
import {
    LOAN_STATUS,
    PRODUCT_TYPE,
} from '@/config/constants';
import { env } from '@/config/env';

// ─── Create loan application ───────────────────────────────────────────────────

export const createLoanSchema = Joi.object({
    amount: commonSchemas.amount
        .min(env.business.minLoanAmount)
        .max(env.business.maxLoanAmount)
        .required()
        .messages({
            'number.min': `Loan amount must be at least ₹${env.business.minLoanAmount.toLocaleString('en-IN')}`,
            'number.max': `Loan amount cannot exceed ₹${env.business.maxLoanAmount.toLocaleString('en-IN')}`,
        }),

    tenureMonths: commonSchemas.tenureMonths
        .min(env.business.minTenureMonths)
        .max(env.business.maxTenureMonths)
        .required()
        .messages({
            'number.min': `Minimum tenure is ${env.business.minTenureMonths} months`,
            'number.max': `Maximum tenure is ${env.business.maxTenureMonths} months`,
        }),

    productType: Joi.string()
        .valid(...Object.values(PRODUCT_TYPE))
        .required(),

    purpose: Joi.string()
        .trim()
        .min(5)
        .max(200)
        .required(),

    storeName: Joi.string()
        .trim()
        .min(2)
        .max(100)
        .required(),

    storeCity: Joi.string()
        .trim()
        .min(2)
        .max(100)
        .required(),
});

// ─── EMI preview (no auth needed) ─────────────────────────────────────────────

export const emiPreviewSchema = Joi.object({
    amount: commonSchemas.amount.required(),

    tenureMonths: commonSchemas.tenureMonths.required(),

    interestRate: Joi.number()
        .positive()
        .max(60)     // 60% p.a. absolute ceiling
        .precision(2)
        .required(),
});

// ─── Approve loan ──────────────────────────────────────────────────────────────

export const approveLoanSchema = Joi.object({
    approvedAmount: commonSchemas.amount
        .required()
        .messages({
            'number.base': 'Approved amount must be a valid number',
        }),

    interestRate: Joi.number()
        .positive()
        .max(36)
        .precision(2)
        .required()
        .messages({
            'number.max': 'Interest rate cannot exceed 36% per annum',
        }),

    processingFee: commonSchemas.amount
        .required(),
});

// ─── Reject loan ───────────────────────────────────────────────────────────────

export const rejectLoanSchema = Joi.object({
    reason: Joi.string()
        .trim()
        .min(10)
        .max(500)
        .required()
        .messages({
            'string.min': 'Rejection reason must be at least 10 characters',
        }),
});

// ─── List loans query ──────────────────────────────────────────────────────────

export const listLoansQuerySchema = Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    status: Joi.string().valid(...Object.values(LOAN_STATUS)).optional(),
    productType: Joi.string().valid(...Object.values(PRODUCT_TYPE)).optional(),
    sortBy: Joi.string().valid('appliedAt', 'amount', 'updatedAt').default('appliedAt'),
    sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
    fromDate: Joi.date().iso().optional(),
    toDate: Joi.date().iso().min(Joi.ref('fromDate')).optional(),
});

// ─── Loan ID param ─────────────────────────────────────────────────────────────

export const loanIdParamSchema = Joi.object({
    id: Joi.string().uuid({ version: 'uuidv4' }).required(),
});