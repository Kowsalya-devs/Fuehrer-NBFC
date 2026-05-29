// src/errors/RateLimitError.ts
import { AppError } from './AppError';
import { HTTP } from '@/config/constants';

export class RateLimitError extends AppError {
    public readonly retryAfterSeconds: number;

    constructor(
        message = 'Too many requests',
        retryAfterSeconds = 60,
        context?: string,
    ) {
        super({
            message: context ? `${message} for ${context}` : message,
            statusCode: HTTP.TOO_MANY_REQUESTS,
            errorCode: 'RATE_LIMIT_EXCEEDED',
            details: { retryAfterSeconds, context: context ?? null },
        });

        this.retryAfterSeconds = retryAfterSeconds;
    }
}

export const RATE_LIMIT_ERRORS = {
    general: (retryAfter: number) =>
        new RateLimitError('Too many requests', retryAfter),

    kyc: () =>
        new RateLimitError(
            'KYC verification attempts exceeded',
            3600, // 1 hour cooldown — each KYC call costs real money
            'KYC',
        ),

    webhook: (retryAfter: number) =>
        new RateLimitError('Webhook rate limit exceeded', retryAfter, 'webhook'),
} as const;
