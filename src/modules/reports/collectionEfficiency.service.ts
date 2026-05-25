// src/modules/reports/collectionEfficiency.service.ts
//
// Collection efficiency MIS report.
//
// Measures how effectively the collections team is recovering overdue accounts.
// Built from the collection_cases + contact_logs tables — NOT from emi_schedule.
// This is a CASE-resolution view, not a per-EMI view.
//
// Four sections:
//   1. Overall — resolution rate, PTP kept rate, field contact rate
//   2. Bucket efficiency — per DPD bucket (1-30, 31-60, 61-90, 90+)
//   3. Agent efficiency — per collection agent assigned
//   4. Daily trend — cases contacted, amount collected, resolutions
//
// Cached in Redis at 30 min TTL — matches portfolioMIS.service pattern.

import { prisma } from '@/config/database';
import { getRedisClient } from '@/config/redis';
import { createModuleLogger } from '@/config/logger';
import { toNumber, roundRupees } from '@/types/common.types';
import type { Rupees } from '@/types/common.types';
import type {
    CollectionEfficiencyReport,
    CollectionEfficiencyInput,
} from './reports.types';

const log = createModuleLogger('collectionEfficiency');
const CACHE_TTL = 30 * 60; // 30 minutes
const CACHE_KEY = (from: string, to: string, agentId: string | undefined) =>
    `report:collection-eff:${from}:${to}:${agentId ?? 'all'}`;

// ─── DPD bucket helpers ──────────────────────────────────────────────────────

interface DpdBucketDef {
    label: string;
    min: number;
    max: number; // inclusive
}

const DPD_BUCKETS: DpdBucketDef[] = [
    { label: '1-30', min: 1, max: 30 },
    { label: '31-60', min: 31, max: 60 },
    { label: '61-90', min: 61, max: 90 },
    { label: '90+', min: 91, max: 9999 },
];

// ─── Service ─────────────────────────────────────────────────────────────────

export const collectionEfficiencyService = {

    async generate(
        input: CollectionEfficiencyInput,
    ): Promise<CollectionEfficiencyReport> {
        const fromStr = input.fromDate.toISOString().slice(0, 10);
        const toStr = input.toDate.toISOString().slice(0, 10);
        const cacheKey = CACHE_KEY(fromStr, toStr, input.agentId);

        // ── Cache check ──────────────────────────────────────────────────────
        if (!input.refresh) {
            const redis = getRedisClient();
            const cached = await redis.get(cacheKey).catch(() => null);
            if (cached) {
                log.debug('Collection efficiency served from cache', { cacheKey });
                return JSON.parse(cached) as CollectionEfficiencyReport;
            }
        }

        log.info('Generating collection efficiency report', {
            from: fromStr,
            to: toStr,
            agentId: input.agentId ?? 'all',
        });

        const [
            overall,
            bucketEfficiency,
            agentEfficiency,
            dailyTrend,
        ] = await Promise.all([
            this._buildOverall(input),
            this._buildBucketEfficiency(input),
            this._buildAgentEfficiency(input),
            this._buildDailyTrend(input),
        ]);

        const report: CollectionEfficiencyReport = {
            generatedAt: new Date(),
            reportPeriod: { fromDate: input.fromDate, toDate: input.toDate },
            overallRate: overall.overallRate,
            ptpKeptRate: overall.ptpKeptRate,
            fieldContactRate: overall.fieldContactRate,
            resolutionRate: overall.resolutionRate,
            bucketEfficiency,
            agentEfficiency,
            dailyTrend,
        };

        // Cache the result
        const redis = getRedisClient();
        await redis
            .setex(cacheKey, CACHE_TTL, JSON.stringify(report))
            .catch(() => { /* cache failure is non-fatal */ });

        return report;
    },

    // ─── Overall efficiency ──────────────────────────────────────────────────
    // resolutionRate     = resolved cases / total cases opened in period
    // ptpKeptRate        = PTPs honoured / PTPs given
    // fieldContactRate   = cases with >=1 contact log / total open cases
    // overallRate        = composite (mean of the three) — single headline number

    async _buildOverall(input: CollectionEfficiencyInput): Promise<{
        overallRate: number;
        ptpKeptRate: number;
        fieldContactRate: number;
        resolutionRate: number;
    }> {
        const { fromDate, toDate, agentId } = input;
        const agentFilter = agentId ? { assigned_to: agentId } : {};

        const [
            totalCases,
            resolvedCases,
            ptpGiven,
            ptpKept,
            casesWithContact,
        ] = await Promise.all([
            prisma.collection_cases.count({
                where: {
                    opened_at: { gte: fromDate, lte: toDate },
                    ...agentFilter,
                },
            }),
            prisma.collection_cases.count({
                where: {
                    opened_at: { gte: fromDate, lte: toDate },
                    status: 'RESOLVED',
                    ...agentFilter,
                },
            }),
            prisma.collection_cases.count({
                where: {
                    opened_at: { gte: fromDate, lte: toDate },
                    ptp_date: { not: null },
                    ...agentFilter,
                },
            }),
            prisma.collection_cases.count({
                where: {
                    opened_at: { gte: fromDate, lte: toDate },
                    ptp_date: { not: null },
                    ptp_broken: false,
                    status: 'RESOLVED',
                    ...agentFilter,
                },
            }),
            prisma.collection_cases.count({
                where: {
                    opened_at: { gte: fromDate, lte: toDate },
                    contact_count: { gt: 0 },
                    ...agentFilter,
                },
            }),
        ]);

        const pct = (n: number, d: number) =>
            d === 0 ? 0 : Math.round((n / d) * 10000) / 100;

        const resolutionRate = pct(resolvedCases, totalCases);
        const ptpKeptRate = pct(ptpKept, ptpGiven);
        const fieldContactRate = pct(casesWithContact, totalCases);

        // Composite — equally weighted mean. Avoids dominating by one signal.
        const validParts = [resolutionRate, ptpKeptRate, fieldContactRate].filter(
            (v) => !Number.isNaN(v),
        );
        const overallRate = validParts.length
            ? Math.round(
                (validParts.reduce((a, b) => a + b, 0) / validParts.length) * 100,
            ) / 100
            : 0;

        return { overallRate, ptpKeptRate, fieldContactRate, resolutionRate };
    },

    // ─── Bucket efficiency — by DPD range ────────────────────────────────────

    async _buildBucketEfficiency(
        input: CollectionEfficiencyInput,
    ): Promise<CollectionEfficiencyReport['bucketEfficiency']> {
        const { fromDate, toDate, agentId } = input;
        const agentFilter = agentId ? { assigned_to: agentId } : {};

        const rows = await Promise.all(
            DPD_BUCKETS.map(async (bucket) => {
                const where = {
                    opened_at: { gte: fromDate, lte: toDate },
                    overdue_days: { gte: bucket.min, lte: bucket.max },
                    ...agentFilter,
                };

                const [
                    totalCases,
                    resolvedCases,
                    agg,
                ] = await Promise.all([
                    prisma.collection_cases.count({ where }),
                    prisma.collection_cases.count({
                        where: { ...where, status: 'RESOLVED' },
                    }),
                    prisma.collection_cases.aggregate({
                        where,
                        _sum: {
                            total_due: true,
                            overdue_amount: true,
                        },
                    }),
                ]);

                const collectedAgg = await prisma.collection_cases.aggregate({
                    where: { ...where, status: 'RESOLVED' },
                    _sum: { total_due: true },
                });

                const totalDue = toNumber(agg._sum.total_due ?? 0);
                const outstandingAmount = roundRupees(
                    totalDue - toNumber(collectedAgg._sum.total_due ?? 0),
                ) as Rupees;
                const collectedAmount = roundRupees(
                    toNumber(collectedAgg._sum.total_due ?? 0),
                ) as Rupees;

                const efficiencyRate =
                    totalCases === 0
                        ? 0
                        : Math.round((resolvedCases / totalCases) * 10000) / 100;

                return {
                    bucket: bucket.label,
                    totalCases,
                    resolvedCases,
                    collectedAmount,
                    outstandingAmount,
                    efficiencyRate,
                };
            }),
        );

        return rows;
    },

    // ─── Agent efficiency — per collection agent ─────────────────────────────

    async _buildAgentEfficiency(
        input: CollectionEfficiencyInput,
    ): Promise<CollectionEfficiencyReport['agentEfficiency']> {
        const { fromDate, toDate, agentId } = input;
        const agentFilter = agentId ? { assigned_to: agentId } : {};

        // Group case counts by assigned agent
        const grouped = await prisma.collection_cases.groupBy({
            by: ['assigned_to'],
            where: {
                opened_at: { gte: fromDate, lte: toDate },
                assigned_to: { not: null },
                ...agentFilter,
            },
            _count: { id: true },
            orderBy: { assigned_to: 'asc' },
        });

        const rows = await Promise.all(
            grouped.map(async (row) => {
                if (row.assigned_to === null) {
                    return null;
                }
                const aId = row.assigned_to;

                const [
                    agent,
                    casesResolved,
                    contactAttempts,
                    ptpCount,
                    ptpKept,
                    collectedAgg,
                ] = await Promise.all([
                    prisma.admin_users.findUnique({
                        where: { id: aId },
                        select: { id: true, name: true },
                    }),
                    prisma.collection_cases.count({
                        where: {
                            assigned_to: aId,
                            opened_at: { gte: fromDate, lte: toDate },
                            status: 'RESOLVED',
                        },
                    }),
                    prisma.contact_logs.count({
                        where: {
                            logged_by: aId,
                            contacted_at: { gte: fromDate, lte: toDate },
                        },
                    }),
                    prisma.collection_cases.count({
                        where: {
                            assigned_to: aId,
                            opened_at: { gte: fromDate, lte: toDate },
                            ptp_date: { not: null },
                        },
                    }),
                    prisma.collection_cases.count({
                        where: {
                            assigned_to: aId,
                            opened_at: { gte: fromDate, lte: toDate },
                            ptp_date: { not: null },
                            ptp_broken: false,
                            status: 'RESOLVED',
                        },
                    }),
                    prisma.collection_cases.aggregate({
                        where: {
                            assigned_to: aId,
                            opened_at: { gte: fromDate, lte: toDate },
                            status: 'RESOLVED',
                        },
                        _sum: { total_due: true },
                    }),
                ]);

                const casesAssigned = row._count.id;
                const amountCollected = roundRupees(
                    toNumber(collectedAgg._sum.total_due ?? 0),
                ) as Rupees;
                const efficiencyRate =
                    casesAssigned === 0
                        ? 0
                        : Math.round((casesResolved / casesAssigned) * 10000) /
                        100;

                return {
                    agentId: aId,
                    agentName: agent?.name ?? 'Unknown',
                    casesAssigned,
                    casesResolved,
                    contactAttempts,
                    ptpCount,
                    ptpKept,
                    amountCollected,
                    efficiencyRate,
                };
            }),
        );

        return rows.filter(
            (r): r is NonNullable<typeof r> => r !== null,
        );
    },

    // ─── Daily trend — for sparkline / chart ─────────────────────────────────
    // One row per day in the period.

    async _buildDailyTrend(
        input: CollectionEfficiencyInput,
    ): Promise<CollectionEfficiencyReport['dailyTrend']> {
        const { fromDate, toDate, agentId } = input;

        // Raw SQL keeps this efficient — Prisma can't do date-truncation groupings.
        const agentClause = agentId
            ? `AND cc.assigned_to = '${agentId}'::uuid`
            : '';

        const rows = await prisma.$queryRawUnsafe<
            Array<{
                day: Date;
                cases_contacted: bigint;
                amount_collected: number;
                resolutions: bigint;
            }>
        >(`
          WITH days AS (
            SELECT generate_series(
              $1::date,
              $2::date,
              '1 day'::interval
            )::date AS day
          )
          SELECT
            days.day                                          AS day,
            COALESCE(COUNT(DISTINCT cl.case_id), 0)::bigint   AS cases_contacted,
            COALESCE(SUM(cl.payment_received), 0)::float8     AS amount_collected,
            COALESCE(
              (SELECT COUNT(*)
               FROM collection_cases cc
               WHERE cc.resolved_at::date = days.day
                 ${agentClause}
              ), 0
            )::bigint                                         AS resolutions
          FROM days
          LEFT JOIN contact_logs cl
            ON cl.contacted_at::date = days.day
          GROUP BY days.day
          ORDER BY days.day ASC
        `, fromDate, toDate);

        return rows.map((r) => ({
            date: r.day.toISOString().slice(0, 10),
            casesContacted: Number(r.cases_contacted),
            amountCollected: roundRupees(r.amount_collected) as Rupees,
            resolutions: Number(r.resolutions),
        }));
    },
};