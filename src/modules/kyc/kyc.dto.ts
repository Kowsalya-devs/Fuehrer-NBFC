// src/modules/kyc/kyc.dto.ts
import Joi from 'joi';
import { commonSchemas } from '@/middlewares';
import { KYC_STATUS } from '@/config/constants';

// ─── Initiate KYC ─────────────────────────────────────────────────────────────

export const initiateKycSchema = Joi.object({
    fullName: Joi.string()
        .trim()
        .min(2)
        .max(100)
        .pattern(/^[a-zA-Z\s.'-]+$/)
        .required()
        .messages({
            'string.pattern.base': 'Full name must contain only letters, spaces, dots, hyphens and apostrophes',
        }),

    dob: Joi.string()
        .pattern(/^\d{4}-\d{2}-\d{2}$/)
        .required()
        .custom((value, helpers) => {
            const dob = new Date(value);
            const now = new Date();
            const age = now.getFullYear() - dob.getFullYear();
            if (isNaN(dob.getTime())) return helpers.error('date.invalid');
            if (age < 18) return helpers.error('date.tooYoung');
            if (age > 75) return helpers.error('date.tooOld');
            return value;
        })
        .messages({
            'date.invalid': 'Date of birth must be a valid date',
            'date.tooYoung': 'Applicant must be at least 18 years old',
            'date.tooOld': 'Applicant must be under 75 years old',
        }),

    phone: commonSchemas.phone.required(),

    pan: commonSchemas.pan.required(),

    aadhaarLast4: Joi.string()
        .pattern(/^\d{4}$/)
        .required()
        .messages({
            'string.pattern.base': 'Aadhaar last 4 digits must be exactly 4 numbers',
        }),
});

// ─── Aadhaar OTP request ───────────────────────────────────────────────────────

export const aadhaarOtpRequestSchema = Joi.object({
    aadhaarNumber: commonSchemas.aadhaar.required(),
});

// ─── Aadhaar OTP verify ────────────────────────────────────────────────────────

export const aadhaarOtpVerifySchema = Joi.object({
    otp: Joi.string()
        .length(6)
        .pattern(/^\d{6}$/)
        .required()
        .messages({
            'string.pattern.base': 'OTP must be exactly 6 digits',
        }),

    shareCode: Joi.string()
        .length(4)
        .pattern(/^\d{4}$/)
        .required()
        .messages({
            'string.pattern.base': 'Share code must be exactly 4 digits',
        }),
});

// ─── Document upload ───────────────────────────────────────────────────────────

export const uploadDocumentSchema = Joi.object({
    documentType: Joi.string()
        .valid('selfie', 'aadhaar_front', 'aadhaar_back', 'pan', 'bank_statement')
        .required(),
});

// ─── eSign request ─────────────────────────────────────────────────────────────

export const requestESignSchema = Joi.object({
    loanId: Joi.string().uuid({ version: 'uuidv4' }).required(),
});

// ─── Manual override (admin) ───────────────────────────────────────────────────

export const manualOverrideSchema = Joi.object({
    newStatus: Joi.string()
        .valid(KYC_STATUS.COMPLETE, KYC_STATUS.REJECTED)
        .required(),

    reason: Joi.string()
        .trim()
        .min(10)
        .max(500)
        .required()
        .messages({
            'string.min': 'Override reason must be at least 10 characters',
        }),
});

// ─── User ID param ─────────────────────────────────────────────────────────────

export const userIdParamSchema = Joi.object({
    userId: Joi.string().uuid({ version: 'uuidv4' }).required(),
});