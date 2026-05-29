// src/errors/UnauthorizedError.ts
import { AppError } from './AppError';
import { HTTP } from '@/config/constants';

// 401 — caller is not authenticated (no token or invalid token)

export class UnauthorizedError extends AppError {
    constructor(reason = 'Authentication required') {
        super({
            message: reason,
            statusCode: HTTP.UNAUTHORIZED,
            errorCode: 'UNAUTHORIZED',
        });
    }
}

export const AUTH_ERRORS = {
    missingToken: () =>
        new UnauthorizedError('No authorization token provided'),

    invalidToken: () =>
        new UnauthorizedError('Token is invalid or malformed'),

    expiredToken: () =>
        new UnauthorizedError('Token has expired'),

    tokenRevoked: () =>
        new UnauthorizedError('Token has been revoked'),
} as const;
