// src/modules/payments/payments.dto.ts
import Joi from 'joi';

export const createMandateSchema = Joi.object({
    loanAccountId: Joi.string().uuid({ version: 'uuidv4' }).required(),
    bankAccountNumber: Joi.string().min(9).max(18).required(),
    ifscCode: Joi.string().length(11).uppercase().required(),
    accountHolderName: Joi.string().max(100).required(),
    maxAmount: Joi.number().positive().max(10_000_000).required(),
});

export const paymentLinkSchema = Joi.object({
    loanAccountId: Joi.string().uuid({ version: 'uuidv4' }).required(),
    amount: Joi.number().positive().required(),
    description: Joi.string().max(255).optional(),
});

export const recordCashPaymentSchema = Joi.object({
    loanAccountId: Joi.string().uuid({ version: 'uuidv4' }).required(),
    amount: Joi.number().positive().required(),
    collectedBy: Joi.string().uuid({ version: 'uuidv4' }).required(),
    referenceNumber: Joi.string().max(100).optional(),
    notes: Joi.string().max(500).optional(),
});

export const listPaymentsSchema = Joi.object({
    status: Joi.string()
        .valid('PENDING', 'SUCCESS', 'FAILED', 'REFUNDED')
        .optional(),
    fromDate: Joi.date().iso().optional(),
    toDate: Joi.date().iso().optional(),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(200).default(50),
});

export const loanAccountIdParamSchema = Joi.object({
    loanAccountId: Joi.string().uuid({ version: 'uuidv4' }).required(),
});

export const paymentIdParamSchema = Joi.object({
    paymentId: Joi.string().uuid({ version: 'uuidv4' }).required(),
});
