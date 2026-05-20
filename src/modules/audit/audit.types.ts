// src/modules/audit/audit.types.ts
import type { AuditAction } from '@/config/constants';
import type { SortOrder } from '@/types/common.types';

// ─── Core audit log entry ──────────────────────────────────────────────────────

export interface AuditLogEntry {
    id: string;

    // What happened
    action: string;          // From AUDIT_ACTION constants
    entityType: string | null;   // 'loan_application' | 'payment' | etc.
    entityId: string | null;   // UUID of the affected record

    // Who did it
    userId: string | null;   // The authenticated user who triggered the action
    role: string | null;   // Their role at the time of the action

    // HTTP context
    requestId: string;          // Ties this log to the full request log chain
    ipAddress: string | null;
    userAgent: string | null;
    httpMethod: string | null;
    httpPath: string | null;
    statusCode: number | null;

    // State snapshot — what changed
    beforeState: unknown | null;  // JSON snapshot before mutation
    afterState: unknown | null;  // JSON snapshot after mutation
    metadata: Record<string, unknown> | null;

    createdAt: Date;
}

// ─── Immutable write input ────────────────────────────────────────────────────
// Used by the auditTrail middleware and service-layer direct writes

export interface CreateAuditLogInput {
    action: string;
    entityType?: string;
    entityId?: string;
    userId?: string;
    role?: string;
    requestId: string;
    ipAddress?: string;
    userAgent?: string;
    httpMethod?: string;
    httpPath?: string;
    statusCode?: number;
    before?: unknown;
    after?: unknown;
    metadata?: Record<string, unknown>;
}

// ─── Query / filter inputs ────────────────────────────────────────────────────

export interface ListAuditLogsInput {
    // Filters
    entityType?: string;
    entityId?: string;
    userId?: string;
    action?: string;
    fromDate?: Date;
    toDate?: Date;

    // Pagination
    page: number;
    limit: number;
    sortOrder?: SortOrder;
}

export interface AuditTrailInput {
    entityType: string;
    entityId: string;
    page: number;
    limit: number;
}

// ─── Compliance export types ──────────────────────────────────────────────────

export type AuditExportFormat = 'json' | 'csv';

export interface AuditExportInput {
    fromDate: Date;
    toDate: Date;
    entityType?: string;
    action?: string;
    format: AuditExportFormat;
}

// ─── Response shapes ──────────────────────────────────────────────────────────

export interface AuditLogResponse {
    id: string;
    action: string;
    entityType: string | null;
    entityId: string | null;
    userId: string | null;
    role: string | null;
    requestId: string;
    ipAddress: string | null;
    httpMethod: string | null;
    httpPath: string | null;
    statusCode: number | null;
    beforeState: unknown | null;
    afterState: unknown | null;
    metadata: Record<string, unknown> | null;
    createdAt: Date;
}

// ─── Statistics ───────────────────────────────────────────────────────────────

export interface AuditStatsSummary {
    totalEntries: number;
    entriesLast24h: number;
    entriesLast7Days: number;
    actionBreakdown: Array<{ action: string; count: number }>;
    topEntities: Array<{ entityType: string; count: number }>;
}