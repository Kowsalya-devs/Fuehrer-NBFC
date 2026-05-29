// src/modules/disbursement/disbursement.dto.ts
import Joi from 'joi';
import { commonSchemas } from '@/middlewares';
import { DISBURSEMENT_MODE } from '@/config/constants';

// ─── Initiate disbursement ─────────────────────────────────────────────────────

export const initiateDisbursementSchema = Joi.object({

    beneficiaryName: Joi.string()
        .trim()
        .min(2)
        .max(100)
        .required()
        .messages({
            'string.min': 'Beneficiary name must be at least 2 characters',
        }),

    accountNumber: Joi.string()
        .pattern(/^\d{9,18}$/)
        .required()
        .messages({
            'string.pattern.base': 'Account number must be 9–18 digits',
        }),

    ifsc: commonSchemas.ifsc.required(),

    mode: Joi.string()
        .valid(...Object.values(DISBURSEMENT_MODE))
        .default(DISBURSEMENT_MODE.IMPS),
});

// ─── Retry disbursement ────────────────────────────────────────────────────────

export const retryDisbursementSchema = Joi.object({
    disbursementId: Joi.string()
        .uuid({ version: 'uuidv4' })
        .required(),
});

// ─── Loan ID param ─────────────────────────────────────────────────────────────

export const loanIdParamSchema = Joi.object({
    loanId: Joi.string()
        .uuid({ version: 'uuidv4' })
        .required(),
});

export const disbursementIdParamSchema = Joi.object({
    disbursementId: Joi.string()
        .uuid({ version: 'uuidv4' })
        .required(),
});
