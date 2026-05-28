// src/errors/AppError.ts

export interface AppErrorOptions {
    message: string;
    statusCode: number;
    errorCode: string;
    details?: Record<string, unknown> | null;
    cause?: Error | unknown;
    isOperational?: boolean; // true = expected business error | false = programmer bug
}

export class AppError extends Error {
    public readonly statusCode: number;
    public readonly errorCode: string;
    public readonly details: Record<string, unknown> | null;
    public readonly isOperational: boolean;
    public readonly cause?: Error | unknown;
    public readonly timestamp: string;

    constructor(options: AppErrorOptions) {
        super(options.message);

        // Restore prototype chain — required when extending built-ins in TypeScript
        Object.setPrototypeOf(this, new.target.prototype);

        this.name = new.target.name; // e.g. "NotFoundError", not "Error"
        this.statusCode = options.statusCode;
        this.errorCode = options.errorCode;
        this.details = options.details ?? null;
        this.isOperational = options.isOperational ?? true;
        this.cause = options.cause;
        this.timestamp = new Date().toISOString();

        // Capture clean stack trace — excludes the AppError constructor frame itself
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, new.target);
        }
    }

    // ─── Serialization ────────────────────────────────────────────────────────
    // What the API sends to the client — never expose stack traces

    toJSON(): Record<string, unknown> {
        return {
            success: false,
            errorCode: this.errorCode,
            message: this.message,
            details: this.details,
            timestamp: this.timestamp,
        };
    }

    // ─── Logging shape ────────────────────────────────────────────────────────
    // What Winston logs internally — includes stack + cause

    toLog(): Record<string, unknown> {
        return {
            name: this.name,
            errorCode: this.errorCode,
            message: this.message,
            statusCode: this.statusCode,
            isOperational: this.isOperational,
            details: this.details,
            stack: this.stack,
            cause: this.cause instanceof Error
                ? { message: this.cause.message, stack: this.cause.stack }
                : this.cause,
        };
    }

    // ─── Type guard ───────────────────────────────────────────────────────────
    // Use this everywhere instead of instanceof checks on raw Error

    static isAppError(error: unknown): error is AppError {
        return error instanceof AppError;
    }

    static isOperationalError(error: unknown): boolean {
        if (AppError.isAppError(error)) return error.isOperational;
        return false;
    }
}
