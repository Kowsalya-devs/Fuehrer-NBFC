// src/modules/audit/audit.repository.ts
//
// APPEND-ONLY design contract:
//   - create()  → the only write method
//   - No update() method — audit records never change
//   - No delete() method — audit records are never deleted
//   - All queries return records ordered by createdAt DESC by default
//
// RBI data retention: 5 years minimum.
// Deletion is handled at the infrastructure level (RDS automated snapshots,
// S3 lifecycle rules on exports) — never in application code.

import { prisma } from '@/config/database';
import { createModuleLogger } from '@/config/logger';
import {
    toPrismaPage,
    buildPaginationMeta,
} from '@/types/common.types';
import type { PaginatedResult } from '@/types/common.types';
import { NotFoundError } from '@/errors';
import type {
    AuditLogEntry,
    CreateAuditLogInput,
    ListAuditLogsInput,
    AuditTrailInput,
    AuditStatsSummary,
} from './audit.types';

const log = createModuleLogger('audit.repository');

// ─── Mapper ───────────────────────────────────────────────────────────────────

function mapEntry(row: Record<string, unknown>): AuditLogEntry {
    return {
        id: row.id as string,
        action: row.action as string,
        entityType: row.entity_type as string | null,
        entityId: row.entity_id as string | null,
        userId: row.user_id as string | null,
        role: row.role as string | null,
        requestId: row.request_id as string,
        ipAddress: row.ip_address as string | null,
        userAgent: row.user_agent as string | null,
        httpMethod: row.http_method as string | null,
        httpPath: row.http_path as string | null,
        statusCode: row.status_code as number | null,
        beforeState: row.before_state
            ? safeJsonParse(row.before_state as string)
            : null,
        afterState: row.after_state
            ? safeJsonParse(row.after_state as string)
            : null,
        metadata: row.metadata
            ? safeJsonParse(row.metadata as string) as Record<string, unknown>
            : null,
        createdAt: row.created_at as Date,
    };
}

function safeJsonParse(value: string | unknown): unknown {
    if (typeof value !== 'string') return value;
    try {
        return JSON.parse(value);
    } catch {
        return value;
    }
}

// ─── Repository ────────────────────────────────────────────────────────────────

export const auditRepository = {

    // ── Create — the ONLY write method ────────────────────────────────────────
    // Fire-and-forget safe — callers should not await this in hot paths.
    // Use auditService.log() which wraps this with error suppression.

    async create(input: CreateAuditLogInput): Promise<AuditLogEntry> {
        const row = await prisma.audit_logs.create({
            data: {
                action: input.action,
                entity_type: input.entityType ?? null,
                entity_id: input.entityId ?? null,
                user_id: input.userId ?? null,
                role: input.role ?? null,
                request_id: input.requestId,
                ip_address: input.ipAddress ?? null,
                user_agent: input.userAgent ?? null,
                http_method: input.httpMethod ?? null,
                http_path: input.httpPath ?? null,
                status_code: input.statusCode ?? null,
                before_state: input.before
                    ? JSON.stringify(input.before) : null,
                after_state: input.after
                    ? JSON.stringify(input.after) : null,
                metadata: input.metadata
                    ? JSON.stringify(input.metadata) : null,
                created_at: new Date(),
            },
        });

        return mapEntry(row as unknown as Record<string, unknown>);
    },

    // ── Find by ID ────────────────────────────────────────────────────────────

    async findById(id: string): Promise<AuditLogEntry | null> {
        const row = await prisma.audit_logs.findUnique({ where: { id } });
        return row ? mapEntry(row as unknown as Record<string, unknown>) : null;
    },

    async findByIdOrThrow(id: string): Promise<AuditLogEntry> {
        const entry = await this.findById(id);
        if (!entry) throw new NotFoundError('Audit log entry', id);
        return entry;
    },

    // ── List with full filter support ──────────────────────────────────────────

    async list(
        input: ListAuditLogsInput,
    ): Promise<PaginatedResult<AuditLogEntry>> {
        const where: Record<string, unknown> = {};

        if (input.entityType) where.entity_type = input.entityType;
        if (input.entityId) where.entity_id = input.entityId;
        if (input.userId) where.user_id = input.userId;
        if (input.action) where.action = input.action;

        if (input.fromDate || input.toDate) {
            where.created_at = {
                ...(input.fromDate ? { gte: input.fromDate } : {}),
                ...(input.toDate ? { lte: input.toDate } : {}),
            };
        }

        const [rows, total] = await prisma.$transaction([
            prisma.audit_logs.findMany({
                where,
                orderBy: { created_at: input.sortOrder ?? 'desc' },
                ...toPrismaPage({ page: input.page, limit: input.limit }),
            }),
            prisma.audit_logs.count({ where }),
        ]);

        return {
            data: rows.map(
                (r) => mapEntry(r as unknown as Record<string, unknown>),
            ),
            pagination: buildPaginationMeta(input.page, input.limit, total),
        };
    },

    // ── Entity audit trail — full history for one record ──────────────────────
    // The compliance officer view: "show me everything that happened to loan X"

    async getEntityTrail(
        input: AuditTrailInput,
    ): Promise<PaginatedResult<AuditLogEntry>> {
        return this.list({
            entityType: input.entityType,
            entityId: input.entityId,
            page: input.page,
            limit: input.limit,
            sortOrder: 'asc',  // Chronological for trail view
        });
    },

    // ── User activity log — everything a specific user has done ───────────────

    async getUserActivity(
        userId: string,
        page: number,
        limit: number,
        fromDate?: Date,
        toDate?: Date,
    ): Promise<PaginatedResult<AuditLogEntry>> {
        return this.list({
            userId,
            page,
            limit,
            fromDate,
            toDate,
            sortOrder: 'desc',
        });
    },

    // ── Request trace — all entries for one request ID ────────────────────────
    // Ties HTTP log → audit log → event log for a single request

    async getRequestTrace(
        requestId: string,
    ): Promise<AuditLogEntry[]> {
        const rows = await prisma.audit_logs.findMany({
            where: { request_id: requestId },
            orderBy: { created_at: 'asc' },
        });
        return rows.map(
            (r) => mapEntry(r as unknown as Record<string, unknown>),
        );
    },

    // ── Statistics ────────────────────────────────────────────────────────────

    async getStats(): Promise<AuditStatsSummary> {
        const now = new Date();
        const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

        const [total, last24hCount, last7dCount, actionBreakdown, topEntities] =
            await prisma.$transaction([

                prisma.audit_logs.count(),

                prisma.audit_logs.count({
                    where: { created_at: { gte: last24h } },
                }),

                prisma.audit_logs.count({
                    where: { created_at: { gte: last7d } },
                }),

                // Top 10 actions by frequency (last 30 days)
                prisma.$queryRaw<Array<{ action: string; count: bigint }>>`
          SELECT action, COUNT(*) AS count
          FROM audit_logs
          WHERE created_at >= NOW() - INTERVAL '30 days'
          GROUP BY action
          ORDER BY count DESC
          LIMIT 10
        `,

                // Top entity types (last 30 days)
                prisma.$queryRaw<Array<{ entity_type: string; count: bigint }>>`
          SELECT entity_type, COUNT(*) AS count
          FROM audit_logs
          WHERE
            entity_type IS NOT NULL
            AND created_at >= NOW() - INTERVAL '30 days'
          GROUP BY entity_type
          ORDER BY count DESC
          LIMIT 10
        `,
            ]);

        return {
            totalEntries: total,
            entriesLast24h: last24hCount,
            entriesLast7Days: last7dCount,
            actionBreakdown: (actionBreakdown as Array<{
                action: string; count: bigint;
            }>).map((r) => ({
                action: r.action,
                count: Number(r.count),
            })),
            topEntities: (topEntities as Array<{
                entity_type: string; count: bigint;
            }>).map((r) => ({
                entityType: r.entity_type,
                count: Number(r.count),
            })) as unknown as Array<{ entityType: string; count: number }>,
        } as AuditStatsSummary;
    },

    // ── CSV export — for compliance officers ──────────────────────────────────
    // Returns raw rows for streaming — no pagination, direct DB cursor.
    // Caller is responsible for streaming the response.

    async getForExport(params: {
        fromDate: Date;
        toDate: Date;
        entityType?: string;
        action?: string;
        batchSize?: number;
        onBatch: (rows: AuditLogEntry[]) => Promise<void>;
    }): Promise<{ totalRows: number }> {
        const where: Record<string, unknown> = {
            created_at: {
                gte: params.fromDate,
                lte: params.toDate,
            },
        };
        if (params.entityType) where.entity_type = params.entityType;
        if (params.action) where.action = params.action;

        const batchSize = params.batchSize ?? 1000;
        let offset = 0;
        let total = 0;

        // Cursor-based pagination to avoid loading millions of rows into memory
        while (true) {
            const rows = await prisma.audit_logs.findMany({
                where,
                orderBy: { created_at: 'asc' },
                skip: offset,
                take: batchSize,
            });

            if (rows.length === 0) break;

            await params.onBatch(
                rows.map((r) => mapEntry(r as unknown as Record<string, unknown>)),
            );

            total += rows.length;
            offset += rows.length;

            if (rows.length < batchSize) break;
        }

        return { totalRows: total };
    },
};
