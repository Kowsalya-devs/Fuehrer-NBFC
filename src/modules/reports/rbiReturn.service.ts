// src/modules/reports/rbiReturn.service.ts
import { prisma } from '@/config/database';
import { getRedisClient } from '@/config/redis';
import { createModuleLogger } from '@/config/logger';
import { toNumber, roundRupees } from '@/types/common.types';
import type {
    RbiReturnReport,
    RbiNbfcReturn,
    RbiLoanRecord,
    RbiReturnInput,
} from './reports.types';

const log = createModuleLogger('rbiReturn');
const CACHE_TTL = 6 * 60 * 60; // 6 hours — RBI returns are expensive to generate
const CACHE_KEY = (type: string, period: string) =>
    `report:rbi:${type}:${period}`;

// ─── Provisioning rates per RBI NBFC Master Direction ─────────────────────────
const PROVISION_RATE: Record<string, number> = {
    STANDARD: 0.00,   // 0%  — performing assets
    SUB_STANDARD: 0.10,   // 10% — 90 DPD to 12 months
    DOUBTFUL_1: 0.20,   // 20% — 12–15 months
    DOUBTFUL_2: 0.30,   // 30% — 15–18 months
    DOUBTFUL_3: 0.50,   // 50% — 18–36 months
    DOUBTFUL_4: 0.75,   // 75% — 36–48 months
    LOSS: 1.00,   // 100%
};

function getProvisionRate(overdueDays: number): number {
    if (overdueDays === 0) return PROVISION_RATE.STANDARD!;
    if (overdueDays <= 90) return PROVISION_RATE.STANDARD!;
    if (overdueDays <= 365) return PROVISION_RATE.SUB_STANDARD!;
    if (overdueDays <= 450) return PROVISION_RATE.DOUBTFUL_1!;
    if (overdueDays <= 540) return PROVISION_RATE.DOUBTFUL_2!;
    if (overdueDays <= 1080) return PROVISION_RATE.DOUBTFUL_3!;
    if (overdueDays <= 1440) return PROVISION_RATE.DOUBTFUL_4!;
    return PROVISION_RATE.LOSS!;
}

function classifyAsset(overdueDays: number): string {
    if (overdueDays <= 90) return 'STANDARD';
    if (overdueDays <= 1080) return 'SUB_STANDARD';
    if (overdueDays <= 1440) return 'DOUBTFUL';
    return 'LOSS';
}

// Mask borrower name for regulatory submission — only first letter of each word
function maskName(fullName: string): string {
    return fullName
        .split(' ')
        .map((w) => (w[0] ?? 'X') + '*'.repeat(Math.max(0, w.length - 1)))
        .join(' ');
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const rbiReturnService = {

    async generate(input: RbiReturnInput): Promise<RbiReturnReport> {
        const periodStr = input.periodEnd.toISOString().slice(0, 10);
        const cacheKey = CACHE_KEY(input.reportType, periodStr);

        if (!input.refresh) {
            const redis = getRedisClient();
            const cached = await redis.get(cacheKey).catch(() => null);
            if (cached) {
                log.debug('RBI return served from cache', { cacheKey });
                return JSON.parse(cached) as RbiReturnReport;
            }
        }

        // Period = calendar month ending on periodEnd
        const periodStart = new Date(
            input.periodEnd.getFullYear(),
            input.periodEnd.getMonth(),
            1,
        );

        log.info('Generating RBI return', {
            type: input.reportType,
            period: periodStr,
        });

        const data = await this._buildNbfcReturn(
            periodStart,
            input.periodEnd,
            input.reportType,
        );

        const report: RbiReturnReport = {
            generatedAt: new Date(),
            reportingPeriod: {
                fromDate: periodStart,
                toDate: input.periodEnd,
            },
            reportType: input.reportType,
            data,
        };

        const redis = getRedisClient();
        await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(report)).catch(() => { });

        return report;
    },

    async _buildNbfcReturn(
        periodStart: Date,
        periodEnd: Date,
        reportType: string,
    ): Promise<RbiNbfcReturn> {

        // ── Loan portfolio classification ─────────────────────────────────────────
        const portfolioRows = await prisma.$queryRaw<Array<{
            account_number: string;
            full_name: string;
            disbursed_at: Date;
            principal_amount: number;
            outstanding: number;
            interest_rate: number;
            tenure_months: number;
            overdue_days: number | null;
            applied_at: Date;
        }>>`
      SELECT
        acc.account_number,
        u.full_name,
        acc.disbursed_at,
        acc.principal_amount::numeric,
        acc.outstanding_balance::numeric      AS outstanding,
        acc.interest_rate::numeric,
        acc.tenure_months,
        MAX(CASE WHEN es.status IN ('OVERDUE','BOUNCED','PENDING')
          AND es.due_date < NOW()
          THEN EXTRACT(DAY FROM NOW() - es.due_date)::int
          ELSE 0 END)                         AS overdue_days,
        la.applied_at
      FROM loan_accounts acc
      JOIN loan_applications la ON la.id = acc.application_id
      JOIN users u ON u.id = acc.user_id
      LEFT JOIN emi_schedule es ON es.loan_account_id = acc.id
      WHERE acc.status NOT IN ('REJECTED','DRAFT')
        AND acc.disbursed_at <= ${periodEnd}
      GROUP BY
        acc.account_number, u.full_name, acc.disbursed_at,
        acc.principal_amount, acc.outstanding_balance,
        acc.interest_rate, acc.tenure_months, la.applied_at
    `;

        // ── Disbursement data for period ──────────────────────────────────────────
        const [disbursements, emissions] = await prisma.$transaction([
            prisma.loan_accounts.aggregate({
                where: {
                    disbursed_at: { gte: periodStart, lte: periodEnd },
                },
                _count: { id: true },
                _sum: { principal_amount: true },
            }),

            // Loans approved in period
            prisma.loan_applications.aggregate({
                where: {
                    status: { in: ['APPROVED', 'DISBURSED', 'ACTIVE', 'CLOSED'] },
                    reviewed_at: { gte: periodStart, lte: periodEnd },
                },
                _count: { id: true },
                _sum: { approved_amount: true },
            }),
        ]);

        // ── EMI collection data ───────────────────────────────────────────────────
        const [emisDue, emisPaid] = await prisma.$transaction([
            prisma.emi_schedule.aggregate({
                where: { due_date: { gte: periodStart, lte: periodEnd } },
                _count: { id: true },
                _sum: { emi_amount: true },
            }),
            prisma.emi_schedule.aggregate({
                where: {
                    due_date: { gte: periodStart, lte: periodEnd },
                    status: 'PAID',
                },
                _count: { id: true },
                _sum: { emi_amount: true },
            }),
        ]);

        // ── Build loan records + provisioning ─────────────────────────────────────
        let standardAssets = 0;
        let subStandardAssets = 0;
        let doubtfulAssets = 0;
        let lossAssets = 0;
        let totalProvisioning = 0;

        const loanRecords: RbiLoanRecord[] = portfolioRows.map((r) => {
            const overdueDays = Number(r.overdue_days ?? 0);
            const outstanding = toNumber(r.outstanding);
            const classification = classifyAsset(overdueDays);
            const provisionRate = getProvisionRate(overdueDays);
            const provisioningAmount = roundRupees(outstanding * provisionRate);

            totalProvisioning += provisioningAmount;

            switch (classification) {
                case 'STANDARD': standardAssets += outstanding; break;
                case 'SUB_STANDARD': subStandardAssets += outstanding; break;
                case 'DOUBTFUL': doubtfulAssets += outstanding; break;
                case 'LOSS': lossAssets += outstanding; break;
            }

            return {
                accountNumber: r.account_number,
                borrowerName: maskName(r.full_name),
                sanctionDate: (r.applied_at as Date).toISOString().slice(0, 10),
                disbursementDate: (r.disbursed_at as Date).toISOString().slice(0, 10),
                principalAmount: toNumber(r.principal_amount),
                outstandingAmount: outstanding,
                interestRate: toNumber(r.interest_rate),
                tenureMonths: r.tenure_months,
                overdueDays,
                assetClassification: classification,
                provisioningRate: provisionRate,
                provisioningAmount,
            };
        });

        const grossNpa = subStandardAssets + doubtfulAssets + lossAssets;
        const netNpa = roundRupees(
            grossNpa - (totalProvisioning - standardAssets * PROVISION_RATE.STANDARD!),
        );

        return {
            nbfcName: 'Feuhrer Financial Services Pvt Ltd',
            registrationNo: 'N-14.03450', // Replace with actual NBFC registration
            periodEndDate: periodEnd.toISOString().slice(0, 10),

            totalLoanPortfolio: roundRupees(
                standardAssets + subStandardAssets + doubtfulAssets + lossAssets,
            ),
            standardAssets: roundRupees(standardAssets),
            subStandardAssets: roundRupees(subStandardAssets),
            doubtfulAssets: roundRupees(doubtfulAssets),
            lossAssets: roundRupees(lossAssets),
            grossNpa: roundRupees(grossNpa),
            netNpa: roundRupees(Math.max(0, netNpa)),
            provisioningRequired: roundRupees(totalProvisioning),

            loansApprovedInPeriod: emissions._count.id,
            amountApprovedInPeriod: toNumber(emissions._sum.approved_amount ?? 0),
            loansDisbursedInPeriod: disbursements._count.id,
            amountDisbursedInPeriod: toNumber(disbursements._sum.principal_amount ?? 0),

            emisDueInPeriod: emisDue._count.id,
            emisCollectedInPeriod: emisPaid._count.id,
            amountDueInPeriod: toNumber(emisDue._sum.emi_amount ?? 0),
            amountCollectedInPeriod: toNumber(emisPaid._sum.emi_amount ?? 0),

            loanRecords,
        };
    },
};