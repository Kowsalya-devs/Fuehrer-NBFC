// src/modules/collections/collections.dto.ts
import Joi from 'joi';

export const logContactSchema = Joi.object({
    contactType: Joi.string()
        .valid('CALL', 'SMS', 'FIELD_VISIT', 'EMAIL', 'WHATSAPP')
        .required(),
    outcome: Joi.string()
        .valid('NO_ANSWER', 'PROMISED_TO_PAY', 'DISPUTE', 'PAID', 'REFUSED', 'NOT_REACHABLE')
        .required(),
    ptpDate: Joi.date().iso().optional(),
    ptpAmount: Joi.number().positive().optional(),
    notes: Joi.string().max(1000).optional(),
});

export const assignCaseSchema = Joi.object({
    assignedTo: Joi.string().uuid({ version: 'uuidv4' }).required(),
});

export const escalateCaseSchema = Joi.object({
    reason: Joi.string().max(500).required(),
    escalateTo: Joi.string().uuid({ version: 'uuidv4' }).optional(),
});

export const closeCaseSchema = Joi.object({
    resolution: Joi.string()
        .valid('PAID_FULL', 'PAID_PARTIAL', 'WRITE_OFF', 'LEGAL', 'OTHER')
        .required(),
    notes: Joi.string().max(500).optional(),
});

export const listCasesSchema = Joi.object({
    status: Joi.string()
        .valid('OPEN', 'ESCALATED', 'CLOSED', 'LEGAL')
        .optional(),
    dpdMin: Joi.number().integer().min(0).optional(),
    dpdMax: Joi.number().integer().min(0).optional(),
    assignedTo: Joi.string().uuid({ version: 'uuidv4' }).optional(),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(200).default(50),
});

export const caseIdParamSchema = Joi.object({
    caseId: Joi.string().uuid({ version: 'uuidv4' }).required(),
});

export const loanAccountParamSchema = Joi.object({
    loanAccountId: Joi.string().uuid({ version: 'uuidv4' }).required(),
});
