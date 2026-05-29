// src/middlewares/auditTrail.middleware.ts
import type { Request, Response, NextFunction } from 'express';
import { prisma } from '@/config/database';
import { createModuleLogger } from '@/config/logger';
import type { AuditContext } from '@/types/express';

const log = createModuleLogger('auditTrail');

// ─── Routes that must always be audited ───────────────────────────────────────
// Even if the service layer forgets to populate req.auditContext,
// these routes get a basic audit entry from the HTTP-level data alone.

const ALWAYS_AUDIT_PATTERNS: RegExp[] = [
    /\/loans\/[^/]+\/approve/,
    /\/loans\/[^/]+\/reject/,
    /\/loans\/[^/]+\/disburse/,
    /\/kyc\/[^/]+\/complete/,
    /\/payments\/webhook/,
    /\/agents\/[^/]+\/suspend/,
    /\/admin\//,
];

function shouldAlwaysAudit(path: string): boolean {
    return ALWAYS_AUDIT_PATTERNS.some((p) => p.test(path));
}

// ─── Middleware ────────────────────────────────────────────────────────────────

export function auditTrail() {
    return (req: Request, res: Response, next: NextFunction): void => {
        // Initialise an empty audit context — service layer fills it in
        req.auditContext = {};

        res.on('finish', () => {
            // Only audit mutating requests and always-audit paths
            const isMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
            const isAlwaysAudit = shouldAlwaysAudit(req.path);

            if (!isMutation && !isAlwaysAudit) return;

            // Don't audit failed auth / validation — those aren't business events
            // Do audit 4xx on always-audit paths (e.g. attempted unauthorised approval)
            const statusCode = res.statusCode;
            if (statusCode < 200 && statusCode >= 300 && !isAlwaysAudit) return;
            if (statusCode === 401 || statusCode === 429) return;

            const ctx = req.auditContext ?? {};

            // If service layer didn't set an action, derive a best-effort one from HTTP
            const action = ctx.action ?? `${req.method}:${req.path}`;

            // Fire-and-forget — never block the response for audit writes
            writeAuditLog({
                action,
                entityType: ctx.entityType ?? null,
                entityId: ctx.entityId ?? null,
                userId: req.user?.id ?? null,
                role: req.user?.role ?? null,
                requestId: req.requestId,
                ipAddress: req.ip ?? null,
                userAgent: req.headers['user-agent'] ?? null,
                httpMethod: req.method,
                httpPath: req.path,
                statusCode,
                before: ctx.before ?? null,
                after: ctx.after ?? null,
                metadata: ctx.metadata ?? null,
            }).catch((err) => {
                // Audit failure must never crash the app — log and move on
                log.error('Failed to write audit log', {
                    error: (err as Error).message,
                    action,
                    requestId: req.requestId,
                });
            });
        });

        next();
    };
}

// ─── Audit log writer ──────────────────────────────────────────────────────────

interface AuditLogEntry {
    action: string;
    entityType: string | null;
    entityId: string | null;
    userId: string | null;
    role: string | null;
    requestId: string;
    ipAddress: string | null;
    userAgent: string | null;
    httpMethod: string;
    httpPath: string;
    statusCode: number;
    before: unknown;
    after: unknown;
    metadata: Record<string, unknown> | null;
}

async function writeAuditLog(entry: AuditLogEntry): Promise<void> {
    await prisma.audit_logs.create({
        data: {
            action: entry.action,
            entity_type: entry.entityType,
            entity_id: entry.entityId,
            user_id: entry.userId,
            role: entry.role,
            request_id: entry.requestId,
            ip_address: entry.ipAddress,
            user_agent: entry.userAgent,
            http_method: entry.httpMethod,
            http_path: entry.httpPath,
            status_code: entry.statusCode,
            before_state: entry.before ? JSON.stringify(entry.before) : null,
            after_state: entry.after ? JSON.stringify(entry.after) : null,
            metadata: entry.metadata ? JSON.stringify(entry.metadata) : null,
            created_at: new Date(),
        },
    });
}

// ─── Service-layer helper ──────────────────────────────────────────────────────
// Call this inside service methods to populate the audit context.
// The middleware flushes it automatically when the response finishes.
//
// Usage in loans.service.ts:
//   setAuditContext(req, {
//     action:     AUDIT_ACTION.LOAN_APPROVED,
//     entityType: 'loan_application',
//     entityId:   loan.id,
//     before:     { status: loan.status },
//     after:      { status: 'APPROVED' },
//   });

export function setAuditContext(
    req: Request,
    context: Partial<AuditContext>,
): void {
    req.auditContext = {
        ...req.auditContext,
        ...context,
    };
}
