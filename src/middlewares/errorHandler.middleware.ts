// src/middlewares/errorHandler.middleware.ts
import type { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { AppError } from '@/errors';
import { ValidationError } from '@/errors';
import { createModuleLogger } from '@/config/logger';
import { env } from '@/config/env';
import { HTTP } from '@/config/constants';

const log = createModuleLogger('errorHandler');

// ─── Prisma error mapper ───────────────────────────────────────────────────────
// Map Prisma's low-level error codes to meaningful AppErrors.
// Never let raw Prisma errors reach the client — they contain schema details.

function handlePrismaError(
    err: Prisma.PrismaClientKnownRequestError,
): AppError {
    switch (err.code) {
        // Unique constraint violation
        case 'P2002': {
            const fields = (err.meta?.target as string[] | undefined)?.join(', ') ?? 'field';
            return new AppError({
                message: `A record with this ${fields} already exists`,
                statusCode: HTTP.CONFLICT,
                errorCode: 'DUPLICATE_RECORD',
                details: { fields: err.meta?.target },
            });
        }

        // Record not found (e.g. update/delete on non-existent ID)
        case 'P2025':
            return new AppError({
                message: 'Record not found',
                statusCode: HTTP.NOT_FOUND,
                errorCode: 'NOT_FOUND',
                details: { cause: err.meta?.cause },
            });

        // Foreign key constraint
        case 'P2003':
            return new AppError({
                message: 'Related record does not exist',
                statusCode: HTTP.BAD_REQUEST,
                errorCode: 'FOREIGN_KEY_VIOLATION',
                details: { field: err.meta?.field_name },
            });

        // Required field is null
        case 'P2011':
            return new AppError({
                message: 'Required field is missing',
                statusCode: HTTP.BAD_REQUEST,
                errorCode: 'NULL_CONSTRAINT_VIOLATION',
                details: { constraint: err.meta?.constraint },
            });

        // Transaction conflict / deadlock — tell client to retry
        case 'P2034':
            return new AppError({
                message: 'Request conflict — please retry',
                statusCode: HTTP.CONFLICT,
                errorCode: 'TRANSACTION_CONFLICT',
                isOperational: true,
            });

        default:
            // Unknown Prisma error — treat as non-operational (bug)
            return new AppError({
                message: 'Database error',
                statusCode: HTTP.INTERNAL_ERROR,
                errorCode: 'DATABASE_ERROR',
                isOperational: false,
                cause: err,
            });
    }
}

// ─── Normalise any thrown value to AppError ────────────────────────────────────

function normalise(err: unknown): AppError {
    // Already an AppError — pass through
    if (AppError.isAppError(err)) return err;

    // Prisma known request error
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
        return handlePrismaError(err);
    }

    // Prisma validation error (bad query construction — programmer error)
    if (err instanceof Prisma.PrismaClientValidationError) {
        return new AppError({
            message: 'Invalid database query',
            statusCode: HTTP.INTERNAL_ERROR,
            errorCode: 'DATABASE_QUERY_ERROR',
            isOperational: false,
            cause: err,
        });
    }

    // Prisma connection error
    if (err instanceof Prisma.PrismaClientInitializationError) {
        return new AppError({
            message: 'Database connection failed',
            statusCode: HTTP.SERVICE_UNAVAILABLE,
            errorCode: 'DATABASE_UNAVAILABLE',
            isOperational: false,
            cause: err,
        });
    }

    // Standard Error — likely an unhandled throw somewhere
    if (err instanceof Error) {
        return new AppError({
            message: env.isProd ? 'An unexpected error occurred' : err.message,
            statusCode: HTTP.INTERNAL_ERROR,
            errorCode: 'INTERNAL_ERROR',
            isOperational: false,
            cause: err,
        });
    }

    // Completely unknown throw (string, object, etc.)
    return new AppError({
        message: 'An unexpected error occurred',
        statusCode: HTTP.INTERNAL_ERROR,
        errorCode: 'INTERNAL_ERROR',
        isOperational: false,
        details: { thrown: String(err) },
    });
}

// ─── Global error handler middleware ──────────────────────────────────────────
// MUST be registered last in app.ts — Express identifies error handlers by arity (4 params)

export function errorHandler() {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    return (err: unknown, req: Request, res: Response, _next: NextFunction): void => {

        const appError = normalise(err);

        // ── Logging ──────────────────────────────────────────────────────────────
        const logContext = {
            ...appError.toLog(),
            requestId: req.requestId,
            method: req.method,
            path: req.path,
            userId: req.user?.id,
        };

        if (!appError.isOperational) {
            // Non-operational = programmer bug — needs immediate attention
            log.error('Unhandled application error', logContext);
        } else if (appError.statusCode >= 500) {
            log.error('Operational server error', logContext);
        } else if (appError.statusCode >= 400) {
            log.warn('Client error', logContext);
        }

        // ── Response ─────────────────────────────────────────────────────────────
        // Headers already sent (streaming response) — can't send error response
        if (res.headersSent) {
            log.error('Error occurred after headers sent', {
                requestId: req.requestId,
                errorCode: appError.errorCode,
            });
            return;
        }

        // Attach Retry-After for rate limit errors
        if (appError.statusCode === HTTP.TOO_MANY_REQUESTS) {
            const retryAfter =
                (appError.details as { retryAfterSeconds?: number } | null)
                    ?.retryAfterSeconds ?? 60;
            res.setHeader('Retry-After', retryAfter);
        }

        // Build the response body
        const body = {
            ...appError.toJSON(),
            // Attach requestId so client can reference it in support tickets
            requestId: req.requestId,
            // Only include stack trace in development
            ...(env.isDev && !appError.isOperational
                ? { stack: appError.stack }
                : {}),
        };

        res.status(appError.statusCode).json(body);
    };
}

// ─── 404 handler ──────────────────────────────────────────────────────────────
// Register this BEFORE errorHandler but AFTER all routes in app.ts.
// Catches requests that matched no route.

export function notFoundHandler() {
    return (req: Request, _res: Response, next: NextFunction): void => {
        next(
            new AppError({
                message: `Route ${req.method} ${req.path} not found`,
                statusCode: HTTP.NOT_FOUND,
                errorCode: 'ROUTE_NOT_FOUND',
                details: { method: req.method, path: req.path },
            }),
        );
    };
}
