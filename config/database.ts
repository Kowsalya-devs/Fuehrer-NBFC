// src/config/database.ts
import { PrismaClient } from '@prisma/client';
import { env } from './env';
import { logger } from './logger';

// ─── Singleton pattern ─────────────────────────────────────────────────────────
// Prevents multiple PrismaClient instances during hot-reload in development
// In production there is only ever one instance per container

declare global {
    // eslint-disable-next-line no-var
    var __prisma: PrismaClient | undefined;
}

function createPrismaClient(): PrismaClient {
    const client = new PrismaClient({
        datasources: {
            db: { url: env.db.url },
        },

        log: env.isProd
            ? [
                { emit: 'event', level: 'error' },
                { emit: 'event', level: 'warn' },
            ]
            : [
                { emit: 'event', level: 'error' },
                { emit: 'event', level: 'warn' },
                { emit: 'event', level: 'info' },
                { emit: 'event', level: 'query' },
            ],

        errorFormat: env.isProd ? 'minimal' : 'pretty',
    });

    // Forward Prisma events to Winston so everything lands in CloudWatch
    client.$on('error' as never, (e: { message: string; target: string }) => {
        logger.error('Prisma error', { message: e.message, target: e.target });
    });

    client.$on('warn' as never, (e: { message: string }) => {
        logger.warn('Prisma warning', { message: e.message });
    });

    if (!env.isProd) {
        client.$on('query' as never, (e: { query: string; duration: number }) => {
            logger.debug('Prisma query', {
                query: e.query,
                duration_ms: e.duration,
            });
        });
    }

    return client;
}

export const prisma: PrismaClient =
    global.__prisma ?? createPrismaClient();

// Persist the instance across hot-reloads in development only
if (!env.isProd) {
    global.__prisma = prisma;
}

// ─── Connection health check ───────────────────────────────────────────────────

export async function connectDatabase(): Promise<void> {
    try {
        await prisma.$connect();
        // Raw query is faster than any model query for a health check
        await prisma.$queryRaw`SELECT 1`;
        logger.info('Database connected', {
            url: env.db.url.replace(/:[^:@]+@/, ':***@'), // mask password in logs
        });
    } catch (error) {
        logger.error('Database connection failed', { error });
        throw error; // Let server.ts handle the fatal exit
    }
}

export async function disconnectDatabase(): Promise<void> {
    await prisma.$disconnect();
    logger.info('Database disconnected');
}

// ─── Transaction helper with automatic retry on serialization failures ────────
// PostgreSQL throws code 40001 on serialization conflicts — retry is correct

type TransactionCallback<T> = (
    tx: Omit<
        PrismaClient,
        '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
    >,
) => Promise<T>;

export async function withTransaction<T>(
    callback: TransactionCallback<T>,
    maxRetries = 3,
): Promise<T> {
    let attempt = 0;

    while (attempt < maxRetries) {
        try {
            return await prisma.$transaction(callback, {
                isolationLevel: 'ReadCommitted',
                timeout: 10_000, // 10s max per transaction
                maxWait: 5_000,  // 5s max queue wait
            });
        } catch (error: any) {
            // PostgreSQL serialization failure — safe to retry
            if (error?.code === 'P2034' && attempt < maxRetries - 1) {
                attempt++;
                logger.warn('Transaction serialization conflict, retrying', { attempt });
                await sleep(50 * attempt); // Brief backoff
                continue;
            }
            throw error;
        }
    }

    throw new Error('Transaction failed after max retries');
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}