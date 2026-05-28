// src/errors/ValidationError.ts
import { AppError } from './AppError';
import { HTTP } from '@/config/constants';

export interface ValidationErrorDetail {
    field: string;
    message: string;
    value?: unknown;
}

export class ValidationError extends AppError {
    public readonly validationErrors: ValidationErrorDetail[];

    constructor(
        errors: ValidationErrorDetail[] | string,
        message = 'Validation failed',
    ) {
        const validationErrors: ValidationErrorDetail[] =
            typeof errors === 'string'
                ? [{ field: 'request', message: errors }]
                : errors;

        super({
            message,
            statusCode: HTTP.BAD_REQUEST,
            errorCode: 'VALIDATION_ERROR',
            details: { errors: validationErrors },
        });

        this.validationErrors = validationErrors;
    }

    // ─── Build from Joi ValidationError ──────────────────────────────────────
    // Used by the validate middleware — converts Joi details to our format

    static fromJoi(joiError: {
        details: Array<{ path: Array<string | number>; message: string; context?: { value?: unknown } }>;
    }): ValidationError {
        const errors: ValidationErrorDetail[] = joiError.details.map((d) => ({
            field: d.path.join('.') || 'request',
            message: d.message.replace(/['"]/g, ''), // Remove Joi's surrounding quotes
            value: d.context?.value,
        }));

        return new ValidationError(errors);
    }

    // ─── Single field shorthand ───────────────────────────────────────────────

    static field(field: string, message: string, value?: unknown): ValidationError {
        return new ValidationError([{ field, message, value }]);
    }
}
