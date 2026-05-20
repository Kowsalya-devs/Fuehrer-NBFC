// src/modules/admin/admin.dto.ts
import Joi from 'joi';
import { ROLE } from '@/config/constants';
import { commonSchemas } from '@/middlewares';

// ─── Create admin user ────────────────────────────────────────────────────────

export const createAdminUserSchema = Joi.object({
    fullName: Joi.string()
        .trim()
        .min(2)
        .max(100)
        .required(),

    email: Joi.string()
        .email()
        .lowercase()
        .required(),

    phone: commonSchemas.phone.required(),

    role: Joi.string()
        .valid(
            ROLE.OPS_EXECUTIVE,
            ROLE.CREDIT_MANAGER,
            ROLE.COLLECTION_AGENT,
            ROLE.FINANCE,
            ROLE.SUPER_ADMIN,
        )
        .required()
        .messages({
            'any.only':
                'Role must be one of: OPS_EXECUTIVE, CREDIT_MANAGER, ' +
                'COLLECTION_AGENT, FINANCE, SUPER_ADMIN',
        }),

    department: Joi.string()
        .trim()
        .min(2)
        .max(100)
        .required(),
});

// ─── Update admin user ────────────────────────────────────────────────────────

export const updateAdminUserSchema = Joi.object({
    fullName: Joi.string().trim().min(2).max(100).optional(),
    department: Joi.string().trim().min(2).max(100).optional(),
    status: Joi.string().valid('ACTIVE', 'INACTIVE', 'SUSPENDED').optional(),
}).min(1);

// ─── Update system config ──────────────────────────────────────────────────────

export const updateConfigSchema = Joi.object({
    value: Joi.string()
        .trim()
        .min(1)
        .max(500)
        .required()
        .messages({
            'string.empty': 'Config value cannot be empty',
        }),

    reason: Joi.string()
        .trim()
        .min(10)
        .max(500)
        .required()
        .messages({
            'string.min': 'Reason for config change must be at least 10 characters',
        }),
});

// ─── List admin users ──────────────────────────────────────────────────────────

export const listAdminUsersSchema = Joi.object({
    role: Joi.string()
        .valid(...Object.values(ROLE))
        .optional(),
    status: Joi.string()
        .valid('ACTIVE', 'INACTIVE', 'SUSPENDED')
        .optional(),
    search: Joi.string().trim().max(100).optional(),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
});

// ─── Param schemas ─────────────────────────────────────────────────────────────

export const adminUserIdParamSchema = Joi.object({
    userId: Joi.string().uuid({ version: 'uuidv4' }).required(),
});

export const configKeyParamSchema = Joi.object({
    key: Joi.string()
        .valid(
            'MAX_LOAN_AMOUNT',
            'MIN_LOAN_AMOUNT',
            'MAX_TENURE_MONTHS',
            'MIN_TENURE_MONTHS',
            'MIN_CREDIT_SCORE',
            'NPA_OVERDUE_DAYS',
            'MAX_FOIR',
            'DEFAULT_INTEREST_RATE',
            'PROCESSING_FEE_RATE',
            'AGENT_COMMISSION_RATE',
            'ENACH_RETRY_LIMIT',
            'KYC_PROVIDER',
            'SMS_PROVIDER',
            'MAINTENANCE_MODE',
            'MAINTENANCE_MESSAGE',
        )
        .required(),
});