// src/config/logger.ts
import winston from 'winston';
import { env } from './env';

// ─── Custom log levels ─────────────────────────────────────────────────────────
// http level sits between info and debug — captures all HTTP traffic

const levels = {
    error: 0,
    warn: 1,
    info: 2,
    http: 3,
    debug: 4,
};

// ─── Formatters ────────────────────────────────────────────────────────────────

// Production: structured JSON — CloudWatch can index and query every field
const jsonFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DDTHH:mm:ss.SSSZ' }),
    winston.format.errors({ stack: true }),    // Include stack traces
    winston.format.json(),
);

// Development: human-readable coloured output
const prettyFormat = winston.format.combine(
    winston.format.colorize({ all: true }),
    winston.format.timestamp({ format: 'HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
        const metaStr = Object.keys(meta).length
            ? '\n' + JSON.stringify(meta, null, 2)
            : '';
        return `${timestamp} [${level}] ${message}${metaStr}`;
    }),
);

// ─── Transports ────────────────────────────────────────────────────────────────

const transports: winston.transport[] = [
    // Always write to stdout — App Runner / CloudWatch captures this
    new winston.transports.Console({
        format: env.logging.pretty ? prettyFormat : jsonFormat,
    }),
];

// In production, also write errors to a separate stream
// (useful for CloudWatch filter metrics on error volume)
if (env.isProd) {
    transports.push(
        new winston.transports.Console({
            level: 'error',
            format: winston.format.combine(
                winston.format.label({ label: 'ERROR_STREAM' }),
                jsonFormat,
            ),
        }),
    );
}

// ─── Logger instance ───────────────────────────────────────────────────────────

export const logger = winston.createLogger({
    level: env.logging.level,
    levels,
    transports,
    // Never crash the process on uncaught logger errors
    exitOnError: false,
    // Default fields added to every log entry
    defaultMeta: {
        service: env.appName,
        env: env.nodeEnv,
    },
});

// ─── Child logger factory ──────────────────────────────────────────────────────
// Use child loggers in each module for automatic context tagging
// e.g. const log = createModuleLogger('loans');
// log.info('Loan created') → { service, env, module: 'loans', message: '...' }

export function createModuleLogger(module: string) {
    return logger.child({ module });
}

// ─── Request logger factory ────────────────────────────────────────────────────
// Creates a per-request child logger with requestId bound
// Used by requestLogger middleware — every log in a request chain
// carries the same requestId for CloudWatch log correlation

export function createRequestLogger(requestId: string, userId?: string) {
    return logger.child({
        requestId,
        ...(userId ? { userId } : {}),
    });
}

// ─── Unhandled rejection / exception capture ───────────────────────────────────
// These should NEVER happen in production — log them before the process crashes

logger.exceptions.handle(
    new winston.transports.Console({
        format: jsonFormat,
    }),
);

logger.rejections.handle(
    new winston.transports.Console({
        format: jsonFormat,
    }),
);

export type Logger = ReturnType<typeof createModuleLogger>;