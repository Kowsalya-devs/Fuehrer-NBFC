// src/modules/collections/collections.repository.ts
import { prisma } from '@/config/database';
import { withTransaction } from '@/config/database';
import { createModuleLogger } from '@/config/logger';
import { toNumber, toPrismaPage, buildPaginationMeta } from '@/types/common.types';
import type { PaginatedResult } from '@/types/common.types';
import { NotFoundError } from '@/errors';
import type {
    CollectionCase,
    ContactLog,
    CollectionCaseStatus,
    ContactOutcome,
    DpdBucket,
    ListCasesInput,
    CollectionPortfolioSummary,
} from './collections.types';
import { classifyDpd } from './collections.types';
import type { Rupees } from '@/types/common.types';

const log = createModuleLogger('collections.repository');

// ─── Mappers ───────────────────────────────────────────────────────────────────

function mapCase(row: Record<string, unknown>): CollectionCase {
    const overdueDays = row.overdue_days as number;
    return {
        id: row.id as string,
        loanAccountId: row.loan_account_id as string,
        userId: row.user_id as string,
        assignedTo: row.assigned_to as string | null,
        overdueDays,
        overdueAmount: toNumber(row.overdue_amount as number),
        penaltyAmount: toNumber(row.penalty_amount as number),
        totalDue: toNumber(row.total_due as number),
        dpdBucket: classifyDpd(overdueDays),
        status: row.status as CollectionCaseStatus,
        ptpDate: row.ptp_date as Date | null,
        ptpAmount: row.ptp_amount
            ? toNumber(row.ptp_amount as number) : null,
        ptpBroken: (row.ptp_broken as boolean) ?? false,
        openedAt: row.opened_at as Date,
        resolvedAt: row.resolved_at as Date | null,
        closedAt: row.closed_at as Date | null,
        closeReason: row.close_reason as string | null,
        lastContactAt: row.last_contact_at as Date | null,
        contactCount: (row.contact_count as number) ?? 0,
        escalationLevel: (row.escalation_level as number) ?? 0,
        escalatedAt: row.escalated_at as Date | null,
        escalationReason: row.escalation_reason as string | null,
        notes: row.notes as string | null,
        createdAt: row.created_at as Date,
        updatedAt: row.updated_at as Date,
    };
}

function mapContact(row: Record<string, unknown>): ContactLog {
    return {
        id: row.id as string,
        caseId: row.case_id as string,
        loggedBy: row.logged_by as string,
        outcome: row.outcome as ContactOutcome,
        channel: row.channel as string,
        ptpDate: row.ptp_date as Date | null,
        ptpAmount: row.ptp_amount
            ? toNumber(row.ptp_amount as number) : null,
        paymentReceived: row.payment_received
            ? toNumber(row.payment_received as number) : null,
        notes: row.notes as string,
        contactedAt: row.contacted_at as Date,
        createdAt: row.created_at as Date,
    };
}

// ─── Repository ────────────────────────────────────────────────────────────────

export const collectionsRepository = {

    // ── Case CRUD ─────────────────────────────────────────────────────────────

    async createCase(data: {
        loanAccountId: string;
        userId: string;
        overdueDays: number;
        overdueAmount: Rupees;
        penaltyAmount: Rupees;
        assignedTo: string | null;
    }): Promise<CollectionCase> {
        const totalDue = toNumber(data.overdueAmount) + toNumber(data.penaltyAmount);

        const row = await prisma.collection_cases.create({
            data: {
                loan_account_id: data.loanAccountId,
                user_id: data.userId,
                assigned_to: data.assignedTo,
                overdue_days: data.overdueDays,
                overdue_amount: data.overdueAmount,
                penalty_amount: data.penaltyAmount,
                total_due: totalDue,
                status: 'OPEN',
                ptp_broken: false,
                contact_count: 0,
                escalation_level: 0,
                opened_at: new Date(),
                created_at: new Date(),
                updated_at: new Date(),
            },
        });

        log.info('Collection case created', {
            caseId: row.id,
            loanAccountId: data.loanAccountId,
            overdueDays: data.overdueDays,
            overdueAmount: data.overdueAmount,
            assignedTo: data.assignedTo,
        });

        return mapCase(row as unknown as Record<string, unknown>);
    },

    async findById(id: string): Promise<CollectionCase | null> {
        const row = await prisma.collection_cases.findUnique({ where: { id } });
        return row ? mapCase(row as unknown as Record<string, unknown>) : null;
    },

    async findByIdOrThrow(id: string): Promise<CollectionCase> {
        const c = await this.findById(id);
        if (!c) throw new NotFoundError('Collection case', id);
        return c;
    },

    async findOpenByLoanAccount(
        loanAccountId: string,
    ): Promise<CollectionCase | null> {
        const row = await prisma.collection_cases.findFirst({
            where: { loan_account_id: loanAccountId, status: 'OPEN' },
            orderBy: { opened_at: 'desc' },
        });
        return row ? mapCase(row as unknown as Record<string, unknown>) : null;
    },

    async list(input: ListCasesInput): Promise<PaginatedResult<CollectionCase>> {
        const where: Record<string, unknown> = {};

        if (input.status) where.status = input.status;
        if (input.assignedTo) where.assigned_to = input.assignedTo;
        if (input.userId) where.user_id = input.userId;

        // DPD bucket filtering via day ranges
        if (input.dpdBucket) {
            const ranges: Record<DpdBucket, { gte?: number; lte?: number }> = {
                CURRENT: { lte: 0 },
                BUCKET_1: { gte: 1, lte: 30 },
                BUCKET_2: { gte: 31, lte: 60 },
                BUCKET_3: { gte: 61, lte: 90 },
                NPA: { gte: 91, lte: 180 },
                WRITTEN_OFF: { gte: 181 },
            };
            where.overdue_days = ranges[input.dpdBucket];
        }

        const sortColumnMap: Record<string, string> = {
            overdueDays: 'overdue_days',
            overdueAmount: 'overdue_amount',
            openedAt: 'opened_at',
            lastContactAt: 'last_contact_at',
        };

        const orderBy = {
            [sortColumnMap[input.sortBy ?? 'overdueDays'] ?? 'overdue_days']:
                input.sortOrder ?? 'desc',
        };

        const [rows, total] = await prisma.$transaction([
            prisma.collection_cases.findMany({
                where,
                orderBy,
                ...toPrismaPage({ page: input.page, limit: input.limit }),
            }),
            prisma.collection_cases.count({ where }),
        ]);

        return {
            data: rows.map((r) => mapCase(r as unknown as Record<string, unknown>)),
            pagination: buildPaginationMeta(input.page, input.limit, total),
        };
    },

    async updateCase(
        id: string,
        data: Record<string, unknown>,
    ): Promise<CollectionCase> {
        const row = await prisma.collection_cases.update({
            where: { id },
            data: { ...data, updated_at: new Date() },
        });
        return mapCase(row as unknown as Record<string, unknown>);
    },

    // ── Refresh overdue amounts from current EMI state ────────────────────────
    // Called by the npaWatch job to keep overdue figures current

    async syncOverdueFigures(caseId: string): Promise<void> {
        const collCase = await this.findByIdOrThrow(caseId);

        const emiStats = await prisma.emi_schedule.aggregate({
            where: {
                loan_account_id: collCase.loanAccountId,
                status: { in: ['OVERDUE', 'BOUNCED', 'PENDING'] },
                due_date: { lt: new Date() },
            },
            _sum: { emi_amount: true, penalty_amount: true },
            _count: true,
        });

        // Find oldest overdue EMI for DPD calculation
        const oldest = await prisma.emi_schedule.findFirst({
            where: {
                loan_account_id: collCase.loanAccountId,
                status: { in: ['OVERDUE', 'BOUNCED'] },
            },
            orderBy: { due_date: 'asc' },
            select: { due_date: true },
        });

        const overdueDays = oldest
            ? Math.floor(
                (Date.now() - (oldest.due_date as Date).getTime()) /
                (1000 * 60 * 60 * 24),
            )
            : 0;

        const overdueAmount = toNumber(emiStats._sum.emi_amount ?? 0);
        const penaltyAmount = toNumber(emiStats._sum.penalty_amount ?? 0);

        await prisma.collection_cases.update({
            where: { id: caseId },
            data: {
                overdue_days: overdueDays,
                overdue_amount: overdueAmount,
                penalty_amount: penaltyAmount,
                total_due: overdueAmount + penaltyAmount,
                updated_at: new Date(),
            },
        });
    },

    // ── Contact logs ──────────────────────────────────────────────────────────

    async createContactLog(data: {
        caseId: string;
        loggedBy: string;
        outcome: ContactOutcome;
        channel: string;
        ptpDate: Date | null;
        ptpAmount: Rupees | null;
        paymentReceived: Rupees | null;
        notes: string;
    }): Promise<ContactLog> {
        // Atomic: create log + update case contact metadata
        return withTransaction(async (tx) => {
            const log = await tx.contact_logs.create({
                data: {
                    case_id: data.caseId,
                    logged_by: data.loggedBy,
                    outcome: data.outcome,
                    channel: data.channel,
                    ptp_date: data.ptpDate,
                    ptp_amount: data.ptpAmount,
                    payment_received: data.paymentReceived,
                    notes: data.notes,
                    contacted_at: new Date(),
                    created_at: new Date(),
                },
            });

            // Update case: last contact time + count + PTP
            const caseUpdate: Record<string, unknown> = {
                last_contact_at: new Date(),
                contact_count: { increment: 1 },
                updated_at: new Date(),
            };

            if (data.ptpDate) {
                caseUpdate.ptp_date = data.ptpDate;
                caseUpdate.ptp_amount = data.ptpAmount;
                caseUpdate.ptp_broken = false;  // New PTP resets broken flag
            }

            await tx.collection_cases.update({
                where: { id: data.caseId },
                data: caseUpdate,
            });

            return mapContact(log as unknown as Record<string, unknown>);
        });
    },

    async listContactLogs(
        caseId: string,
        page: number,
        limit: number,
    ): Promise<PaginatedResult<ContactLog>> {
        const [rows, total] = await prisma.$transaction([
            prisma.contact_logs.findMany({
                where: { case_id: caseId },
                orderBy: { contacted_at: 'desc' },
                ...toPrismaPage({ page, limit }),
            }),
            prisma.contact_logs.count({ where: { case_id: caseId } }),
        ]);

        return {
            data: rows.map(
                (r) => mapContact(r as unknown as Record<string, unknown>),
            ),
            pagination: buildPaginationMeta(page, limit, total),
        };
    },

    // ── Portfolio stats for dashboard ─────────────────────────────────────────

    async getPortfolioSummary(): Promise<CollectionPortfolioSummary> {
        const [
            statusCounts,
            bucketStats,
            ptpThisWeek,
            resolvedThisMonth,
            totalOverdueThisMonth,
        ] = await prisma.$transaction([

            // Case counts by status
            prisma.collection_cases.groupBy({
                by: ['status'],
                orderBy: { _count: { id: 'desc' } },
                _count: { id: true },
            }),

            // Overdue amounts by DPD range
            prisma.$queryRaw<Array<{
                bucket: string;
                cnt: bigint;
                total: number;
            }>>`
        SELECT
          CASE
            WHEN overdue_days <=  0 THEN 'CURRENT'
            WHEN overdue_days <= 30 THEN 'BUCKET_1'
            WHEN overdue_days <= 60 THEN 'BUCKET_2'
            WHEN overdue_days <= 90 THEN 'BUCKET_3'
            WHEN overdue_days <=180 THEN 'NPA'
            ELSE 'WRITTEN_OFF'
          END AS bucket,
          COUNT(*) AS cnt,
          COALESCE(SUM(total_due), 0) AS total
        FROM collection_cases
        WHERE status = 'OPEN'
        GROUP BY bucket
      `,

            // PTP promises due this week
            prisma.collection_cases.count({
                where: {
                    ptp_date: {
                        gte: new Date(),
                        lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                    },
                    status: 'OPEN',
                },
            }),

            // Cases resolved this month
            prisma.collection_cases.count({
                where: {
                    status: 'RESOLVED',
                    resolved_at: {
                        gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
                    },
                },
            }),

            // Total overdue opened this month
            prisma.collection_cases.aggregate({
                where: {
                    opened_at: {
                        gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
                    },
                },
                _sum: { overdue_amount: true },
            }),
        ]);

        // Build status map
        const statusMap = Object.fromEntries(
            (statusCounts as Array<{
                status: string;
                _count: { id: number };
            }>).map((s) => [s.status, s._count.id]),
        );

        const totalCases = Object.values(statusMap).reduce(
            (s, v) => s + (v as number), 0,
        );

        // Build bucket breakdown
        const bucketBreakdown = {} as CollectionPortfolioSummary['bucketBreakdown'];
        const allBuckets: DpdBucket[] = [
            'CURRENT', 'BUCKET_1', 'BUCKET_2', 'BUCKET_3', 'NPA', 'WRITTEN_OFF',
        ];

        for (const b of allBuckets) {
            bucketBreakdown[b] = { count: 0, amount: 0 };
        }

        for (const row of bucketStats as Array<{
            bucket: string; cnt: bigint; total: number;
        }>) {
            const b = row.bucket as DpdBucket;
            if (bucketBreakdown[b]) {
                bucketBreakdown[b] = {
                    count: Number(row.cnt),
                    amount: toNumber(row.total),
                };
            }
        }

        const totalOverdue = toNumber(
            totalOverdueThisMonth._sum.overdue_amount ?? 0,
        );

        const collectionRate = totalOverdue > 0
            ? Math.round((resolvedThisMonth / (resolvedThisMonth + (statusMap['OPEN'] ?? 0))) * 100)
            : 0;

        return {
            totalCases,
            openCases: (statusMap['OPEN'] ?? 0) as number,
            resolvedCases: (statusMap['RESOLVED'] ?? 0) as number,
            escalatedCases: (statusMap['ESCALATED'] ?? 0) as number,
            totalOverdue,
            bucketBreakdown,
            ptpThisWeek,
            collectionRate,
        };
    },

    // ── PTP broken check — called by npaWatch job ─────────────────────────────

    async markBrokenPtps(): Promise<number> {
        const result = await prisma.collection_cases.updateMany({
            where: {
                status: 'OPEN',
                ptp_date: { lt: new Date() },
                ptp_broken: false,
                ptp_amount: { gt: 0 },
            },
            data: {
                ptp_broken: true,
                updated_at: new Date(),
            },
        });
        return result.count;
    },

    // ── Find least-loaded active collection agent ─────────────────────────────

    async findLeastLoadedAgent(): Promise<string | null> {
        const result = await prisma.$queryRaw<Array<{ user_id: string }>>`
      SELECT au.id AS user_id
      FROM admin_users au
      WHERE au.role   = 'COLLECTION_AGENT'
        AND au.status = 'ACTIVE'
      ORDER BY (
        SELECT COUNT(*) FROM collection_cases cc
        WHERE cc.assigned_to = au.id AND cc.status = 'OPEN'
      ) ASC
      LIMIT 1
    `;
        return result[0]?.user_id ?? null;
    },
};
