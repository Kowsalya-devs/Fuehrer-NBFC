// src/errors/ForbiddenError.ts
import { AppError } from './AppError';
import { HTTP } from '@/config/constants';
import type { Role } from '@/config/constants';

// 403 — caller IS authenticated but lacks permission for this action

export class ForbiddenError extends AppError {
    constructor(message = 'You do not have permission to perform this action') {
        super({
            message,
            statusCode: HTTP.FORBIDDEN,
            errorCode: 'FORBIDDEN',
        });
    }
}

export const RBAC_ERRORS = {
    insufficientRole: (required: Role | Role[], actual: Role) => {
        const requiredStr = Array.isArray(required) ? required.join(' or ') : required;
        return new ForbiddenError(
            `This action requires role: ${requiredStr}. Your role: ${actual}`,
        );
    },

    ownResourceOnly: (resource: string) =>
        new ForbiddenError(`You can only access your own ${resource}`),

    actionNotAllowed: (action: string) =>
        new ForbiddenError(`Action '${action}' is not permitted for your role`),
} as const;
