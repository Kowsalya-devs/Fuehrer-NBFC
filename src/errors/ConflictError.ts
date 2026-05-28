// src/errors/ConflictError.ts
import { AppError } from './AppError';
import { HTTP } from '@/config/constants';

// 409 — the request conflicts with the current state of a resource

export class ConflictError extends AppError {
    constructor(message: string, details?: Record<string, unknown>) {
        super({
            message,
            statusCode: HTTP.CONFLICT,
            errorCode: 'CONFLICT',
            details: details ?? null,
        });
    }
}

export const CONFLICT_ERRORS = {
    duplicateApplication: (userId: string) =>
        new ConflictError(
            'An active loan application already exists for this user',
            { userId },
        ),

    duplicatePayment: (gatewayTxnId: string) =>
        new ConflictError('This payment has already been processed', {
            gatewayTxnId,
        }),

    duplicateAgent: (phone: string) =>
        new ConflictError('An agent with this phone number already exists', {
            phone,
        }),

    kycAlreadyComplete: (userId: string) =>
        new ConflictError('KYC is already complete for this user', { userId }),

    mandateAlreadyActive: (loanAccountId: string) =>
        new ConflictError('An eNACH mandate is already active for this loan', {
            loanAccountId,
        }),
} as const;
