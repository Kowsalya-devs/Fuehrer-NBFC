// src/utils/apiResponse.util.ts
//
// API response builder utilities.
//
// successResponse() and paginatedResponse() live in common.types.ts alongside
// the ApiResponse type definitions. This util re-exports them so any module
// that imports from '@/utils/apiResponse.util' resolves correctly, and adds
// the requestId injection helper used by the error handler middleware.
//
// Import from here (not from common.types) in new code — it keeps the import
// paths consistent and makes it easy to centralise any future changes.

export {
    successResponse,
    paginatedResponse,
} from '@/types/common.types';

export type {
    ApiResponse,
    ApiErrorResponse,
    ResponseMeta,
    PaginationMeta,
    PaginatedResult,
} from '@/types/common.types';

import type { ApiErrorResponse } from '@/types/common.types';
import { AppError } from '@/errors/AppError';

// ─── Error response builder ───────────────────────────────────────────────────
// Used by errorHandler.middleware.ts to build consistent error envelopes.
// Never called directly from controllers — always goes through next(err).

export function errorResponse(
    err: AppError | Error,
    requestId?: string,
): ApiErrorResponse {
    if (err instanceof AppError) {
        return {
            success: false,
            errorCode: err.errorCode,
            message: err.message,
            details: err.details ?? null,
            timestamp: err.timestamp,
            ...(requestId ? { requestId } : {}),
        };
    }

    // Unexpected / unhandled error — mask internals from the client
    return {
        success: false,
        errorCode: 'SERVER_ERROR',
        message: 'An unexpected error occurred. Please try again.',
        details: null,
        timestamp: new Date().toISOString(),
        ...(requestId ? { requestId } : {}),
    };
}

// ─── No-content response ──────────────────────────────────────────────────────
// For DELETE and action endpoints that return 204 — keeps the pattern
// consistent so controllers don't build raw objects.

export function noContentResponse(): { success: true } {
    return { success: true };
}
