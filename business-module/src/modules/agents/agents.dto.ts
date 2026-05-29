// src/modules/agents/agents.dto.ts
import Joi from 'joi';
import { commonSchemas } from '@/middlewares';
import {
    AGENT_STATUS,
    COMMISSION_STATUS,
    BUSINESS_RULES,
} from '@/config/constants';

// ─── Onboard agent ────────────────────────────────────────────────────────────

export const onboardAgentSchema = Joi.object({
    fullName: Joi.string()
        .trim()
        .min(2)
        .max(100)
        .pattern(/^[a-zA-Z\s.'-]+$/)
        .required()
        .messages({
            'string.pattern.base':
                'Full name must contain only letters, spaces, dots, hyphens and apostrophes',
        }),

    phone: commonSchemas.phone.required(),

    email: Joi.string().email().lowercase().optional(),

    shopName: Joi.string().trim().min(2).max(100).required(),

    shopAddress: Joi.string().trim().min(10).max(300).required(),

    shopCity: Joi.string().trim().min(2).max(100).required(),

    shopPincode: Joi.string()
        .pattern(/^\d{6}$/)
        .required()
        .messages({
            'string.pattern.base': 'Pincode must be exactly 6 digits',
        }),

    bankAccountNo: Joi.string()
        .pattern(/^\d{9,18}$/)
        .required()
        .messages({
            'string.pattern.base': 'Bank account number must be 9–18 digits',
        }),

    bankIfsc: commonSchemas.ifsc.required(),

    bankAccountName: Joi.string().trim().min(2).max(100).required(),

    panNumber: commonSchemas.pan.required(),

    aadhaarLast4: Joi.string()
        .pattern(/^\d{4}$/)
        .required()
        .messages({
            'string.pattern.base': 'Aadhaar last 4 digits must be exactly 4 numbers',
        }),

    commissionRate: Joi.number()
        .min(0)
        .max(0.05)   // Max 5% commission rate
        .precision(4)
        .optional(),
});

// ─── Update agent profile ──────────────────────────────────────────────────────

export const updateAgentSchema = Joi.object({
    shopName: Joi.string().trim().min(2).max(100).optional(),
    shopAddress: Joi.string().trim().min(10).max(300).optional(),
    shopCity: Joi.string().trim().min(2).max(100).optional(),
    shopPincode: Joi.string().pattern(/^\d{6}$/).optional(),
    email: Joi.string().email().lowercase().optional(),
    bankAccountNo: Joi.string().pattern(/^\d{9,18}$/).optional(),
    bankIfsc: commonSchemas.ifsc.optional(),
    bankAccountName: Joi.string().trim().min(2).max(100).optional(),
}).min(1).messages({
    'object.min': 'At least one field must be provided for update',
});

// ─── Suspend agent ─────────────────────────────────────────────────────────────

export const suspendAgentSchema = Joi.object({
    reason: Joi.string()
        .trim()
        .min(10)
        .max(500)
        .required()
        .messages({
            'string.min': 'Suspension reason must be at least 10 characters',
        }),
});

// ─── List agents ──────────────────────────────────────────────────────────────

export const listAgentsSchema = Joi.object({
    status: Joi.string().valid(...Object.values(AGENT_STATUS)).optional(),
    shopCity: Joi.string().trim().optional(),
    search: Joi.string().trim().max(100).optional(),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    sortBy: Joi.string()
        .valid('onboardedAt', 'fullName', 'totalDisbursed')
        .default('onboardedAt'),
    sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
});

// ─── List commissions ──────────────────────────────────────────────────────────

export const listCommissionsSchema = Joi.object({
    status: Joi.string().valid(...Object.values(COMMISSION_STATUS)).optional(),
    fromDate: Joi.date().iso().optional(),
    toDate: Joi.date().iso().min(Joi.ref('fromDate')).optional(),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
});

// ─── Param schemas ─────────────────────────────────────────────────────────────

export const agentIdParamSchema = Joi.object({
    agentId: Joi.string().uuid({ version: 'uuidv4' }).required(),
});

export const commissionIdParamSchema = Joi.object({
    commissionId: Joi.string().uuid({ version: 'uuidv4' }).required(),
});
