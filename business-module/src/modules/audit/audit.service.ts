// src/modules/audit/audit.service.ts
import { auditRepository } from './audit.repository';
import { createModuleLogger } from '@/config/logger';
import { ForbiddenError } from '@/errors';
import type {
    AuditLogEntry,
    AuditLogResponse,
    CreateAuditLogInput,
    ListAuditLogsInput,
    AuditTrailInput,
    AuditExportInput,
    AuditStatsSummary,
} from './audit.types';
import type { PaginatedResult } from '@/types/common.types';

const log = createModuleLogger('audit.service');

// ─── Response shaper ──────────────────────────────────────────────────────────

function toResponse(entry: AuditLogEntry): AuditLogResponse {
    return {
        id: entry.id,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        userId: entry.userId,
        role: entry.role,
        requestId: entry.requestId,
        ipAddress: entry.ipAddress,
        httpMethod: entry.httpMethod,
        httpPath: entry.httpPath,
        statusCode: entry.statusCode,
        beforeState: entry.beforeState,
        afterState: entry.afterState,
        metadata: entry.metadata,
        createdAt: entry.createdAt,
    };
}

// ─── CSV serialiser ───────────────────────────────────────────────────────────

function toCsvRow(entry: AuditLogEntry): string {
    const fields = [
        entry.id,
        entry.createdAt.toISOString(),
        entry.action,
        entry.entityType ?? '',
        entry.entityId ?? '',
        entry.userId ?? '',
        entry.role ?? '',
        entry.requestId,
        entry.ipAddress ?? '',
        entry.httpMethod ?? '',
        entry.httpPath ?? '',
        String(entry.statusCode ?? ''),
        // Escape JSON fields — double-quote and escape inner quotes
        JSON.stringify(entry.beforeState ?? '').replace(/"/g, '""'),
        JSON.stringify(entry.afterState ?? '').replace(/"/g, '""'),
    ];

    return fields
        .map((f) => `"${String(f).replace(/"/g, '""')}"`)
        .join(',');
}

const CSV_HEADER = [
    'id',
    'created_at',
    'action',
    'entity_type',
    'entity_id',
    'user_id',
    'role',
    'request_id',
    'ip_address',
    'http_method',
    'http_path',
    'status_code',
    'before_state',
    'after_state',
].join(',');

// ─── Service ───────────────────────────────────────────────────────────────────

export const auditService = {

    // ── 1. Write audit entry ───────────────────────────────────────────────────
    // The primary write method used by:
    //   - auditTrail middleware (on every mutating HTTP request)
    //   - Service-layer direct writes for critical operations
    //
    // Error-suppressed — audit failures must NEVER propagate to the caller.
    // A failed audit write is logged as an error but does not crash the request.
    // This is an intentional trade-off: availability > auditability for
    // individual transient failures. Bulk audit integrity is monitored via
    // CloudWatch metrics on the audit_write_failures counter.

    async log(input: CreateAuditLogInput): Promise<void> {
        try {
            await auditRepository.create(input);
        } catch (err) {
            // Log the failure but never throw — never block business operations
            log.error('Failed to write audit log', {
                action: input.action,
                entityId: input.entityId,
                requestId: input.requestId,
                error: (err as Error).message,
            });
        }
    },

    // ── 2. Direct write — throws on failure ───────────────────────────────────
    // Use when audit write failure should abort the operation.
    // Example: RBI-mandated actions where the audit entry IS the compliance proof.

    async logStrict(input: CreateAuditLogInput): Promise<AuditLogEntry> {
        return auditRepository.create(input);
    },

    // ── 3. List audit logs ────────────────────────────────────────────────────

    async list(
        input: ListAuditLogsInput,
        role: string,
    ): Promise<PaginatedResult<AuditLogResponse>> {
        assertComplianceAccess(role);
        const result = await auditRepository.list(input);
        return {
            ...result,
            data: result.data.map(toResponse),
        };
    },

    // ── 4. Entity audit trail ─────────────────────────────────────────────────
    // Full chronological history of a specific record.
    // "What happened to loan FHR-2026-000042?"

    async getEntityTrail(
        input: AuditTrailInput,
        role: string,
    ): Promise<PaginatedResult<AuditLogResponse>> {
        assertComplianceAccess(role);
        const result = await auditRepository.getEntityTrail(input);
        return {
            ...result,
            data: result.data.map(toResponse),
        };
    },

    // ── 5. User activity ──────────────────────────────────────────────────────
    // "What did this credit manager do yesterday?"

    async getUserActivity(
        params: {
            userId: string;
            page: number;
            limit: number;
            fromDate?: Date;
            toDate?: Date;
        },
        requestingRole: string,
    ): Promise<PaginatedResult<AuditLogResponse>> {
        assertComplianceAccess(requestingRole);
        const result = await auditRepository.getUserActivity(
            params.userId,
            params.page,
            params.limit,
            params.fromDate,
            params.toDate,
        );
        return {
            ...result,
            data: result.data.map(toResponse),
        };
    },

    // ── 6. Request trace ──────────────────────────────────────────────────────
    // Correlates all audit entries for a single HTTP request by its requestId.
    // Used for incident investigation: "what exactly happened in request abc123?"

    async getRequestTrace(
        requestId: string,
        requestingRole: string,
    ): Promise<AuditLogResponse[]> {
        assertComplianceAccess(requestingRole);
        const entries = await auditRepository.getRequestTrace(requestId);
        return entries.map(toResponse);
    },

    // ── 7. Single entry ───────────────────────────────────────────────────────

    async getEntry(
        id: string,
        role: string,
    ): Promise<AuditLogResponse> {
        assertComplianceAccess(role);
        const entry = await auditRepository.findByIdOrThrow(id);
        return toResponse(entry);
    },

    // ── 8. Statistics ─────────────────────────────────────────────────────────

    async getStats(role: string): Promise<AuditStatsSummary> {
        assertComplianceAccess(role);
        return auditRepository.getStats();
    },

    // ── 9. Compliance export ──────────────────────────────────────────────────
    // Streams audit records for a date range as CSV or JSON.
    // Returns a readable stream that the controller pipes to res.
    // For large exports, this uses cursor-based batching to avoid OOM.

    async streamExport(
        input: AuditExportInput,
        role: string,
        onChunk: (chunk: string) => void,
    ): Promise<{ totalRows: number }> {
        assertComplianceAccess(role);

        // Validate date range — max 90 days per export request
        const diffDays =
            (input.toDate.getTime() - input.fromDate.getTime()) /
            (1000 * 60 * 60 * 24);

        if (diffDays > 90) {
            throw new Error(
                'Export date range cannot exceed 90 days. ' +
                'Split into multiple requests for larger ranges.',
            );
        }

        if (input.format === 'csv') {
            onChunk(CSV_HEADER + '\n');
        } else {
            onChunk('[\n');
        }

        let firstRow = true;

        const result = await auditRepository.getForExport({
            fromDate: input.fromDate,
            toDate: input.toDate,
            entityType: input.entityType,
            action: input.action,
            batchSize: 500,
            onBatch: async (rows) => {
                for (const row of rows) {
                    if (input.format === 'csv') {
                        onChunk(toCsvRow(row) + '\n');
                    } else {
                        // JSON: emit comma-separated objects
                        if (!firstRow) onChunk(',\n');
                        onChunk(JSON.stringify(toResponse(row)));
                        firstRow = false;
                    }
                }
            },
        });

        if (input.format === 'json') {
            onChunk('\n]');
        }

        log.info('Audit export completed', {
            fromDate: input.fromDate.toISOString(),
            toDate: input.toDate.toISOString(),
            format: input.format,
            totalRows: result.totalRows,
        });

        return result;
    },
};

// ─── Access guard ──────────────────────────────────────────────────────────────
// Audit logs contain sensitive PII context (IP addresses, user IDs, state
// snapshots). Only compliance-designated roles may read them.

function assertComplianceAccess(role: string): void {
    const ALLOWED = new Set(['SUPER_ADMIN', 'FINANCE']);
    if (!ALLOWED.has(role)) {
        throw new ForbiddenError(
            'Audit logs are only accessible to Super Admin and Finance roles',
        );
    }
}
