// src/errors/NotFoundError.ts
import { AppError } from './AppError';
import { HTTP } from '@/config/constants';

export class NotFoundError extends AppError {
    constructor(
        resource: string,
        identifier?: string | Record<string, unknown>,
    ) {
        const identifierStr =
            typeof identifier === 'string'
                ? identifier
                : JSON.stringify(identifier);

        super({
            message: identifier
                ? `${resource} not found: ${identifierStr}`
                : `${resource} not found`,
            statusCode: HTTP.NOT_FOUND,
            errorCode: 'NOT_FOUND',
            details: {
                resource,
                ...(identifier ? { identifier } : {}),
            },
        });
    }
}

// ─── Typed resource constructors ──────────────────────────────────────────────
// These prevent scattered string literals like new NotFoundError('loan application')

export const Errors = {
    loanNotFound: (id: string) =>
        new NotFoundError('Loan application', id),

    loanAccountNotFound: (id: string) =>
        new NotFoundError('Loan account', id),

    emiNotFound: (id: string) =>
        new NotFoundError('EMI', id),

    kycNotFound: (userId: string) =>
        new NotFoundError('KYC document', userId),

    agentNotFound: (id: string) =>
        new NotFoundError('Agent', id),

    userNotFound: (id: string) =>
        new NotFoundError('User', id),

    paymentNotFound: (id: string) =>
        new NotFoundError('Payment', id),

    disbursementNotFound: (id: string) =>
        new NotFoundError('Disbursement', id),
};
