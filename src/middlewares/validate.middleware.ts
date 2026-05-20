// src/middlewares/validate.middleware.ts
import type { Schema, ValidationOptions } from 'joi';
import type { Request, Response, NextFunction } from 'express';
import { ValidationError } from '@/errors';

// ─── Validation target ─────────────────────────────────────────────────────────

type ValidationTarget = 'body' | 'query' | 'params';

// ─── Default Joi options ───────────────────────────────────────────────────────
// abortEarly: false → collect ALL errors, not just the first
// stripUnknown: true → silently remove keys not in schema (defence in depth)
// convert: true → coerce "123" to 123 where schema says number

const DEFAULT_OPTIONS: ValidationOptions = {
    abortEarly: false,
    stripUnknown: true,
    convert: true,
};

// ─── Core validate middleware factory ─────────────────────────────────────────

function validate(
    schema: Schema,
    target: ValidationTarget,
    options: ValidationOptions = {},
) {
    return (req: Request, _res: Response, next: NextFunction): void => {
        const source = req[target];
        const opts = { ...DEFAULT_OPTIONS, ...options };

        const { error, value } = schema.validate(source, opts);

        if (error) {
            return next(ValidationError.fromJoi(error));
        }

        // Attach the cleaned, cast value — controllers use these, never req.body directly
        switch (target) {
            case 'body': req.validatedBody = value; break;
            case 'query': req.validatedQuery = value; break;
            case 'params': req.validatedParams = value; break;
        }

        next();
    };
}

// ─── Public API ────────────────────────────────────────────────────────────────
// Use these in route definitions:
//   router.post('/', validateBody(createLoanSchema), controller)
//   router.get('/:id', validateParams(idParamSchema), controller)

export const validateBody = (
    schema: Schema,
    options?: ValidationOptions,
) => validate(schema, 'body', options);

export const validateQuery = (
    schema: Schema,
    options?: ValidationOptions,
) => validate(schema, 'query', options);

export const validateParams = (
    schema: Schema,
    options?: ValidationOptions,
) => validate(schema, 'params', options);

// ─── Compose multiple validations ─────────────────────────────────────────────
// When a route needs both params and body validated:
//   router.patch('/:id/status',
//     ...validateAll({ params: idParamSchema, body: updateStatusSchema }),
//     controller
//   )

export function validateAll(schemas: {
    body?: Schema;
    query?: Schema;
    params?: Schema;
}) {
    const middlewares = [];
    if (schemas.params) middlewares.push(validateParams(schemas.params));
    if (schemas.query) middlewares.push(validateQuery(schemas.query));
    if (schemas.body) middlewares.push(validateBody(schemas.body));
    return middlewares;
}

// ─── Common reusable schemas ───────────────────────────────────────────────────
// Import Joi schemas here — shared across all modules

import Joi from 'joi';

export const commonSchemas = {

    // UUID path param — used on virtually every route
    uuidParam: Joi.object({
        id: Joi.string().uuid({ version: 'uuidv4' }).required(),
    }),

    // userId path param
    userIdParam: Joi.object({
        userId: Joi.string().uuid({ version: 'uuidv4' }).required(),
    }),

    // Standard list query params with pagination + sorting
    listQuery: Joi.object({
        page: Joi.number().integer().min(1).default(1),
        limit: Joi.number().integer().min(1).max(100).default(20),
        sortBy: Joi.string().optional(),
        sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
        search: Joi.string().trim().max(100).optional(),
    }),

    // Indian phone number — accepts multiple formats, normalised downstream
    phone: Joi.string()
        .pattern(/^(\+91|91|0)?[6-9]\d{9}$/)
        .message('Phone number must be a valid Indian mobile number'),

    // PAN card
    pan: Joi.string()
        .pattern(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/)
        .message('PAN must be in format ABCDE1234F'),

    // Aadhaar (12 digits — do NOT log or store raw Aadhaar)
    aadhaar: Joi.string()
        .pattern(/^\d{12}$/)
        .message('Aadhaar must be exactly 12 digits'),

    // IFSC code
    ifsc: Joi.string()
        .pattern(/^[A-Z]{4}0[A-Z0-9]{6}$/)
        .message('IFSC code is invalid'),

    // Loan amount in rupees (positive, max 2 decimal places)
    amount: Joi.number()
        .positive()
        .precision(2)
        .max(10_000_000), // ₹1 crore absolute ceiling

    // Tenure in months
    tenureMonths: Joi.number().integer().min(1).max(360),

} as const;