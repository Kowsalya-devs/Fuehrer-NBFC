// src/modules/health/health.controller.ts
//
// Three endpoints:
//
//   GET /health/live  — Liveness probe
//     Returns 200 if the process is running and not deadlocked.
//     App Runner restarts the container if this returns non-200.
//     Must be FAST — never hit the database here.
//
//   GET /health/ready — Readiness probe
//     Returns 200 only if the app is ready to serve traffic.
//     App Runner stops routing traffic if this returns non-200.
//     Checks DB + Redis connectivity.
//
//   GET /health       — Full status
//     Detailed diagnostics for ops team. Not used by load balancer.
//     Returns detailed check results for each dependency.
//     No auth required — but only useful from within the VPC.

import type { Request, Response } from 'express';
import { prisma } from '@/config/database';
import { getRedisClient } from '@/config/redis';
import { env } from '@/config/env';
import { createModuleLogger } from '@/config/logger';

const log = createModuleLogger('health');

// ─── Individual dependency checks ─────────────────────────────────────────────

async function checkDatabase(): Promise<{
    status: 'ok' | 'error';
    latencyMs: number;
    error?: string;
}> {
    const start = Date.now();
    try {
        await prisma.$queryRaw`SELECT 1`;
        return { status: 'ok', latencyMs: Date.now() - start };
    } catch (err) {
        return {
            status: 'error',
            latencyMs: Date.now() - start,
            error: (err as Error).message,
        };
    }
}

async function checkRedis(): Promise<{
    status: 'ok' | 'error';
    latencyMs: number;
    error?: string;
}> {
    const start = Date.now();
    try {
        const redis = getRedisClient();
        await redis.ping();
        return { status: 'ok', latencyMs: Date.now() - start };
    } catch (err) {
        return {
            status: 'error',
            latencyMs: Date.now() - start,
            error: (err as Error).message,
        };
    }
}

async function checkDiskSpace(): Promise<{
    status: 'ok' | 'warn';
    freePercent: number;
}> {
    // App Runner containers don't have persistent disk — always ok
    return { status: 'ok', freePercent: 100 };
}

// ─── Controller ───────────────────────────────────────────────────────────────

export const healthController = {

    // GET /health/live
    // Used by App Runner liveness probe. Must respond within 2s.
    // Returns 200 as long as the Node.js process is alive.
    live(_req: Request, res: Response): void {
        res.status(200).json({
            status: 'alive',
            ts: new Date().toISOString(),
        });
    },

    // GET /health/ready
    // Used by App Runner readiness probe.
    // Returns 200 only when DB and Redis are reachable.
    async ready(_req: Request, res: Response): Promise<void> {
        const [db, redis] = await Promise.all([
            checkDatabase(),
            checkRedis(),
        ]);

        const isReady = db.status === 'ok' && redis.status === 'ok';

        res.status(isReady ? 200 : 503).json({
            status: isReady ? 'ready' : 'not_ready',
            checks: { db, redis },
            ts: new Date().toISOString(),
        });

        if (!isReady) {
            log.warn('Readiness check failed', { db, redis });
        }
    },

    // GET /health
    // Full detailed health status. Not exposed to internet — VPC only.
    async full(_req: Request, res: Response): Promise<void> {
        const start = Date.now();

        const [db, redis, disk] = await Promise.all([
            checkDatabase(),
            checkRedis(),
            checkDiskSpace(),
        ]);

        const allOk =
            db.status === 'ok' &&
            redis.status === 'ok';

        // Memory usage
        const memUsage = process.memoryUsage();
        const heapUsedMb = Math.round(memUsage.heapUsed / 1024 / 1024);
        const heapTotalMb = Math.round(memUsage.heapTotal / 1024 / 1024);
        const rssMb = Math.round(memUsage.rss / 1024 / 1024);

        // Process uptime
        const uptimeSeconds = Math.floor(process.uptime());
        const uptimeHuman = formatUptime(uptimeSeconds);

        res.status(allOk ? 200 : 503).json({
            status: allOk ? 'healthy' : 'degraded',
            version: process.env.npm_package_version ?? 'unknown',
            env: env.nodeEnv,

            checks: {
                database: {
                    ...db,
                    host: env.db.url.replace(/:[^:@]+@/, ':***@'),
                },
                redis: {
                    ...redis,
                    url: env.redis.url.replace(/:\/\/.*@/, '://***@'),
                },
                disk,
            },

            process: {
                pid: process.pid,
                uptime: uptimeHuman,
                uptimeSeconds,
                memory: {
                    heapUsedMb,
                    heapTotalMb,
                    rssMb,
                    heapUsagePercent: Math.round((heapUsedMb / heapTotalMb) * 100),
                },
                nodeVersion: process.version,
            },

            totalCheckMs: Date.now() - start,
            ts: new Date().toISOString(),
        });
    },
};

// ─── Uptime formatter ──────────────────────────────────────────────────────────

function formatUptime(seconds: number): string {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;

    const parts: string[] = [];
    if (d > 0) parts.push(`${d}d`);
    if (h > 0) parts.push(`${h}h`);
    if (m > 0) parts.push(`${m}m`);
    parts.push(`${s}s`);

    return parts.join(' ');
}
