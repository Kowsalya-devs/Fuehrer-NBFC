// src/modules/reports/portfolioMIS.service.ts
import { prisma } from '@/config/database';
import { getRedisClient } from '@/config/redis';
import { createModuleLogger } from '@/config/logger';
import { toNumber, roundRupees } from '@/types/common.types';
import type {
    PortfolioMISReport,
    PortfolioSnapshot,
    MonthlyTrend,
    AgentPerformanceRow,
    PortfolioMISInput,
} from './reports.types';

const log = createModuleLogger('portfolioMIS');
const CACHE_TTL = 60 * 60; // 1 hour
const CACHE_KEY = (from: string, to: string) =>
    `report:portfolio:${from}:${to}`;

// ─── Asset classification ─────────────────────────────────────────────────────

function classifyAsset(overdueDays: number): string {
    if (overdueDays === 0) return 'STANDARD';
    if (overdueDays <= 90) return 'STANDARD';   // <90 DPD = standard with watch
    if (overdueDays <= 360) return 'SUB_STANDARD';
    if (overdueDays <= 1080) return 'DOUBTFUL';
    return 'LOSS';
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const portfolioMISService = {

    async generate(input: PortfolioMISInput): Promise<PortfolioMISReport> {
        const fromStr = input.fromDate.toISOString().slice(0, 10);
        const toStr = input.toDate.toISOString().slice(0, 10);
        const cacheKey = CACHE_KEY(fromStr, toStr);

        // ── Cache check ──────────────────────────────────────────────────────────
        if (!input.refresh) {
            const redis = getRedisClient();
            const cached = await redis.get(cacheKey).catch(() => null);
            if (cached) {
                log.debug('Portfolio MIS served from cache', { cacheKey });
                return JSON.parse(cached) as PortfolioMISReport;
            }
        }

        log.info('Generating Portfolio MIS', {
            from: fromStr, to: toStr,
        });

        const [
            snapshot,
            monthlyTrend,
            agentPerformance,
        ] = await Promise.all([
            this._buildSnapshot(input),
            this._buildMonthlyTrend(input),
            this._buildAgentPerformance(input),
        ]);

        const report: PortfolioMISReport = {
            generatedAt: new Date(),
            reportPeriod: { fromDate: input.fromDate, toDate: input.toDate },
            snapshot,
            monthlyTrend,
            agentPerformance,
        };

        // Cache the result
        const redis = getRedisClient();
        await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(report)).catch(() => { });

        return report;
    },

    async _buildSnapshot(
        input: PortfolioMISInput,
    ): Promise<PortfolioSnapshot> {
        const { toDate } = input;
        const monthStart = new Date(toDate.getFullYear(), toDate.getMonth(), 1);

        // Run all queries in parallel — $transaction cannot mix PrismaPromise
        // with $queryRaw (which returns a plain Promise), so we use Promise.all.
        const [
            loanCounts,
            amountStats,
            overdueStats,
            dpdDistribution,
            productBreakdown,
            cityBreakdown,
            emisDue,
            emisCollected,
            onTimePayments,
        ] = await Promise.all([

            // Loan status counts
            prisma.loan_applications.groupBy({
                by: ['status'],
                _count: { id: true },
                orderBy: { status: 'asc' },
            }),

            // Amount aggregates from loan accounts
            prisma.loan_accounts.aggregate({
                _sum: {
                    principal_amount: true,
                    outstanding_balance: true,
                },
                _count: { id: true },
            }),

            // Overdue amount
            prisma.emi_schedule.aggregate({
                where: { status: { in: ['OVERDUE', 'BOUNCED'] } },
                _sum: { emi_amount: true, penalty_amount: true },
                _count: { id: true },
            }),

            // DPD distribution via collection cases
            prisma.$queryRaw<Array<{
                bucket: string;
                cnt: bigint;
                amount: number;
            }>>`
        SELECT
          CASE
            WHEN overdue_days = 0   THEN 'CURRENT'
            WHEN overdue_days <= 30 THEN 'BUCKET_1'
            WHEN overdue_days <= 60 THEN 'BUCKET_2'
            WHEN overdue_days <= 90 THEN 'BUCKET_3'
            WHEN overdue_days <=180 THEN 'NPA'
            ELSE 'WRITTEN_OFF'
          END AS bucket,
          COUNT(*)::bigint AS cnt,
          COALESCE(SUM(overdue_amount), 0)::numeric AS amount
        FROM collection_cases
        WHERE status = 'OPEN'
        GROUP BY bucket
      `,

            // Product breakdown — raw SQL (groupBy on relation field not supported)
            prisma.$queryRaw<Array<{
                product_type: string;
                cnt: bigint;
                amount: number;
            }>>`
        SELECT
          la.product_type,
          COUNT(acc.id)::bigint AS cnt,
          COALESCE(SUM(acc.principal_amount), 0)::numeric AS amount
        FROM loan_accounts acc
        JOIN loan_applications la ON la.id = acc.application_id
        GROUP BY la.product_type
      `,

            // City breakdown
            prisma.$queryRaw<Array<{
                city: string;
                cnt: bigint;
                amount: number;
            }>>`
        SELECT
          la.store_city AS city,
          COUNT(acc.id)::bigint AS cnt,
          COALESCE(SUM(acc.principal_amount), 0)::numeric AS amount
        FROM loan_accounts acc
        JOIN loan_applications la ON la.id = acc.application_id
        GROUP BY la.store_city
        ORDER BY amount DESC
        LIMIT 20
      `,

            // EMIs due this month
            prisma.emi_schedule.count({
                where: {
                    due_date: { gte: monthStart, lte: toDate },
                },
            }),

            // EMIs collected this month
            prisma.emi_schedule.count({
                where: {
                    due_date: { gte: monthStart, lte: toDate },
                    status: 'PAID',
                },
            }),

            // On-time payments (paid on or before due date + 3 days grace)
            prisma.$queryRaw<[{ cnt: bigint }]>`
        SELECT COUNT(*)::bigint AS cnt
        FROM emi_schedule
        WHERE
          status   = 'PAID'
          AND paid_at  IS NOT NULL
          AND paid_at <= due_date + INTERVAL '3 days'
          AND due_date BETWEEN ${monthStart} AND ${toDate}
      `,
        ]);

        // Build status map
        const statusMap = Object.fromEntries(
            loanCounts.map((r) => [r.status, r._count.id]),
        );

        const totalDisbursed = toNumber(amountStats._sum.principal_amount ?? 0);
        const totalOutstanding = toNumber(amountStats._sum.outstanding_balance ?? 0);
        const totalOverdue = toNumber(overdueStats._sum.emi_amount ?? 0)
            + toNumber(overdueStats._sum.penalty_amount ?? 0);

        const npaAmount = totalOutstanding > 0
            ? (dpdDistribution as Array<{ bucket: string; cnt: bigint; amount: number }>)
                .filter((b) => b.bucket === 'NPA' || b.bucket === 'WRITTEN_OFF')
                .reduce((s, b) => s + toNumber(b.amount), 0)
            : 0;

        const npaRate = totalOutstanding > 0
            ? roundRupees((npaAmount / totalOutstanding) * 100)
            : 0;

        const collectionEfficiency = emisDue > 0
            ? roundRupees((emisCollected / emisDue) * 100)
            : 0;

        const onTimeCnt = Number((onTimePayments as [{ cnt: bigint }])[0]?.cnt ?? 0n);
        const onTimePaymentRate = emisCollected > 0
            ? roundRupees((onTimeCnt / emisCollected) * 100)
            : 0;

        // DPD buckets
        const bucketMap = Object.fromEntries(
            (dpdDistribution as Array<{ bucket: string; cnt: bigint; amount: number }>)
                .map((b) => [b.bucket, {
                    count: Number(b.cnt),
                    amount: toNumber(b.amount),
                }]),
        );

        const empty = { count: 0, amount: 0 };

        const prodData = productBreakdown as Array<{
            product_type: string; cnt: bigint; amount: number;
        }>;
        const prodTotal = prodData.reduce((s, r) => s + toNumber(r.amount), 0);

        // Disbursed this month
        const disbursedThisMonth = await prisma.loan_accounts.count({
            where: { disbursed_at: { gte: monthStart, lte: toDate } },
        });
        const disbursedThisMonthAmountResult = await prisma.loan_accounts.aggregate({
            where: { disbursed_at: { gte: monthStart, lte: toDate } },
            _sum: { principal_amount: true },
        });
        const closedThisMonth = await prisma.loan_accounts.count({
            where: { closed_at: { gte: monthStart, lte: toDate } },
        });

        return {
            asOfDate: toDate,
            totalLoans: amountStats._count.id,
            activeLoans: (statusMap['ACTIVE'] ?? 0) + (statusMap['DISBURSED'] ?? 0),
            disbursedThisMonth,
            closedThisMonth,
            npaLoans: (statusMap['NPA'] ?? 0),
            writtenOffLoans: (statusMap['WRITTEN_OFF'] ?? 0),
            totalDisbursed,
            totalOutstanding,
            totalOverdue,
            disbursedThisMonthAmount: toNumber(
                disbursedThisMonthAmountResult._sum.principal_amount ?? 0,
            ),
            npaAmount: roundRupees(npaAmount),
            npaRate,
            grossNpaRate: npaRate,
            collectionEfficiency,
            onTimePaymentRate,
            dpdBuckets: {
                current: bucketMap['CURRENT'] ?? empty,
                bucket1: bucketMap['BUCKET_1'] ?? empty,
                bucket2: bucketMap['BUCKET_2'] ?? empty,
                bucket3: bucketMap['BUCKET_3'] ?? empty,
                npa: bucketMap['NPA'] ?? empty,
                writtenOff: bucketMap['WRITTEN_OFF'] ?? empty,
            },
            productBreakdown: prodData.map((r) => ({
                productType: r.product_type,
                count: Number(r.cnt),
                amount: toNumber(r.amount),
                percentage: prodTotal > 0
                    ? roundRupees((toNumber(r.amount) / prodTotal) * 100)
                    : 0,
            })),
            cityBreakdown: (cityBreakdown as Array<{
                city: string; cnt: bigint; amount: number;
            }>).map((r) => ({
                city: r.city,
                count: Number(r.cnt),
                amount: toNumber(r.amount),
            })),
        };
    },

    async _buildMonthlyTrend(
        input: PortfolioMISInput,
    ): Promise<MonthlyTrend[]> {
        const rows = await prisma.$queryRaw<Array<{
            month: string;
            disbursements: bigint;
            disbursed_amount: number;
            collections: bigint;
            collected_amount: number;
            new_npa: bigint;
            npa_amount: number;
            closures: bigint;
        }>>`
      WITH months AS (
        SELECT
          TO_CHAR(DATE_TRUNC('month', gs), 'YYYY-MM') AS month,
          DATE_TRUNC('month', gs)                     AS month_start,
          DATE_TRUNC('month', gs) + INTERVAL '1 month' - INTERVAL '1 day' AS month_end
        FROM generate_series(
          DATE_TRUNC('month', ${input.fromDate}::date),
          DATE_TRUNC('month', ${input.toDate}::date),
          '1 month'
        ) gs
      )
      SELECT
        m.month,
        COUNT(DISTINCT acc.id)                                     AS disbursements,
        COALESCE(SUM(acc.principal_amount), 0)::numeric           AS disbursed_amount,
        COUNT(DISTINCT es.id)                                      AS collections,
        COALESCE(SUM(es.emi_amount), 0)::numeric                  AS collected_amount,
        COUNT(DISTINCT CASE WHEN acc.status = 'NPA'
              AND acc.updated_at BETWEEN m.month_start AND m.month_end
              THEN acc.id END)                                     AS new_npa,
        COALESCE(SUM(CASE WHEN acc.status = 'NPA'
              AND acc.updated_at BETWEEN m.month_start AND m.month_end
              THEN acc.outstanding_balance ELSE 0 END), 0)::numeric AS npa_amount,
        COUNT(DISTINCT CASE WHEN acc.status = 'CLOSED'
              AND acc.closed_at BETWEEN m.month_start AND m.month_end
              THEN acc.id END)                                     AS closures
      FROM months m
      LEFT JOIN loan_accounts acc
        ON acc.disbursed_at BETWEEN m.month_start AND m.month_end
      LEFT JOIN emi_schedule es
        ON es.paid_at BETWEEN m.month_start AND m.month_end
        AND es.status = 'PAID'
      GROUP BY m.month
      ORDER BY m.month ASC
    `;

        return rows.map((r) => ({
            month: r.month,
            disbursements: Number(r.disbursements),
            disbursedAmount: toNumber(r.disbursed_amount),
            collections: Number(r.collections),
            collectedAmount: toNumber(r.collected_amount),
            newNpa: Number(r.new_npa),
            npaAmount: toNumber(r.npa_amount),
            closures: Number(r.closures),
        }));
    },

    async _buildAgentPerformance(
        input: PortfolioMISInput,
    ): Promise<AgentPerformanceRow[]> {
        const rows = await prisma.$queryRaw<Array<{
            agent_id: string;
            agent_code: string;
            full_name: string;
            shop_city: string;
            loans_submitted: bigint;
            loans_approved: bigint;
            loans_disbursed: bigint;
            total_disbursed: number;
            npa_count: bigint;
            npa_amount: number;
            commission_earned: number;
            commission_paid: number;
        }>>`
      SELECT
        a.id                                                AS agent_id,
        a.agent_code,
        a.full_name,
        a.shop_city,
        COUNT(DISTINCT la.id)                              AS loans_submitted,
        COUNT(DISTINCT CASE WHEN la.status IN
          ('APPROVED','DISBURSED','ACTIVE','CLOSED','NPA')
          THEN la.id END)                                  AS loans_approved,
        COUNT(DISTINCT acc.id)                             AS loans_disbursed,
        COALESCE(SUM(acc.principal_amount), 0)::numeric   AS total_disbursed,
        COUNT(DISTINCT CASE WHEN acc.status = 'NPA'
          THEN acc.id END)                                 AS npa_count,
        COALESCE(SUM(CASE WHEN acc.status = 'NPA'
          THEN acc.outstanding_balance ELSE 0 END), 0)::numeric AS npa_amount,
        COALESCE(SUM(CASE WHEN ac.status IN ('EARNED','PAID')
          THEN ac.commission_amount ELSE 0 END), 0)::numeric AS commission_earned,
        COALESCE(SUM(CASE WHEN ac.status = 'PAID'
          THEN ac.commission_amount ELSE 0 END), 0)::numeric AS commission_paid
      FROM agents a
      LEFT JOIN loan_applications la
        ON la.agent_id = a.id
        AND la.applied_at BETWEEN ${input.fromDate} AND ${input.toDate}
      LEFT JOIN loan_accounts acc ON acc.application_id = la.id
      LEFT JOIN agent_commissions ac ON ac.agent_id = a.id
      GROUP BY a.id, a.agent_code, a.full_name, a.shop_city
      ORDER BY total_disbursed DESC
    `;

        return rows.map((r) => ({
            agentId: r.agent_id,
            agentCode: r.agent_code,
            agentName: r.full_name,
            shopCity: r.shop_city,
            loansSubmitted: Number(r.loans_submitted),
            loansApproved: Number(r.loans_approved),
            loansDisbursed: Number(r.loans_disbursed),
            totalDisbursed: toNumber(r.total_disbursed),
            approvalRate: Number(r.loans_submitted) > 0
                ? roundRupees((Number(r.loans_approved) / Number(r.loans_submitted)) * 100)
                : 0,
            npaCount: Number(r.npa_count),
            npaAmount: toNumber(r.npa_amount),
            commissionEarned: toNumber(r.commission_earned),
            commissionPaid: toNumber(r.commission_paid),
        }));
    },
};

// Suppress unused warning — classifyAsset is available for future use
void classifyAsset;
