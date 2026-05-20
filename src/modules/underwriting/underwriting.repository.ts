// src/modules/underwriting/underwriting.repository.ts
import { prisma } from '@/config/database';
import { createModuleLogger } from '@/config/logger';
import { toNumber, toPrismaPage, buildPaginationMeta } from '@/types/common.types';
import { NotFoundError } from '@/errors';
import type {
    UnderwritingReport,
    RuleResult,
    UnderwritingDecision,
    ListUnderwritingReportsInput,
} from './underwriting.types';
import type { PaginatedResult } from '@/types/common.types';

const log = createModuleLogger('underwriting.repository');

// ─── Mapper ───────────────────────────────────────────────────────────────────

function mapReport(row: Record<string, unknown>): UnderwritingReport {
    return {
        id: row.id as string,
        loanId: row.loan_id as string,
        userId: row.user_id as string,
        decision: row.decision as UnderwritingDecision,
        creditScore: row.credit_score as number | null,
        internalScore: row.internal_score as number,
        fraudScore: row.fraud_score as number | null,
        monthlyIncome: row.monthly_income
            ? toNumber(row.monthly_income as number) : null,
        existingEmiPerMonth: row.existing_emi_per_month
            ? toNumber(row.existing_emi_per_month as number) : null,
        requestedEmi: toNumber(row.requested_emi as number),
        foir: row.foir as number | null,
        dti: row.dti as number | null,
        ruleResults: (typeof row.rule_results === 'string'
            ? JSON.parse(row.rule_results)
            : row.rule_results) as RuleResult[],
        passedRules: row.passed_rules as number,
        failedRules: row.failed_rules as number,
        hardFailRules: (row.hard_fail_rules as string[]) ?? [],
        recommendedAmount: row.recommended_amount
            ? toNumber(row.recommended_amount as number) : null,
        recommendedRate: row.recommended_rate as number | null,
        recommendedTenure: row.recommended_tenure as number | null,
        maxEligibleAmount: row.max_eligible_amount
            ? toNumber(row.max_eligible_amount as number) : null,
        rejectionReasons: (row.rejection_reasons as string[]) ?? [],
        referralReasons: (row.referral_reasons as string[]) ?? [],
        notes: row.notes as string | null,
        completedAt: row.completed_at as Date,
        createdAt: row.created_at as Date,
        updatedAt: row.updated_at as Date,
    };
}

// ─── Repository ────────────────────────────────────────────────────────────────

export const underwritingRepository = {

    async create(data: Omit<UnderwritingReport, 'id' | 'createdAt' | 'updatedAt'>): Promise<UnderwritingReport> {
        const row = await prisma.underwriting_reports.create({
            data: {
                loan_id: data.loanId,
                user_id: data.userId,
                decision: data.decision,
                credit_score: data.creditScore,
                internal_score: data.internalScore,
                fraud_score: data.fraudScore,
                monthly_income: data.monthlyIncome,
                existing_emi_per_month: data.existingEmiPerMonth,
                requested_emi: data.requestedEmi,
                foir: data.foir,
                dti: data.dti,
                rule_results: JSON.stringify(data.ruleResults),
                passed_rules: data.passedRules,
                failed_rules: data.failedRules,
                hard_fail_rules: data.hardFailRules,
                recommended_amount: data.recommendedAmount,
                recommended_rate: data.recommendedRate,
                recommended_tenure: data.recommendedTenure,
                max_eligible_amount: data.maxEligibleAmount,
                rejection_reasons: data.rejectionReasons,
                referral_reasons: data.referralReasons,
                notes: data.notes,
                completed_at: data.completedAt,
                created_at: new Date(),
                updated_at: new Date(),
            },
        });

        log.info('Underwriting report created', {
            reportId: row.id,
            loanId: data.loanId,
            decision: data.decision,
            score: data.internalScore,
        });

        return mapReport(row as unknown as Record<string, unknown>);
    },

    async findById(id: string): Promise<UnderwritingReport | null> {
        const row = await prisma.underwriting_reports.findUnique({ where: { id } });
        return row ? mapReport(row as unknown as Record<string, unknown>) : null;
    },

    async findByIdOrThrow(id: string): Promise<UnderwritingReport> {
        const report = await this.findById(id);
        if (!report) throw new NotFoundError('Underwriting report', id);
        return report;
    },

    async findLatestByLoanId(loanId: string): Promise<UnderwritingReport | null> {
        const row = await prisma.underwriting_reports.findFirst({
            where: { loan_id: loanId },
            orderBy: { created_at: 'desc' },
        });
        return row ? mapReport(row as unknown as Record<string, unknown>) : null;
    },

    async findLatestByLoanIdOrThrow(loanId: string): Promise<UnderwritingReport> {
        const report = await this.findLatestByLoanId(loanId);
        if (!report) throw new NotFoundError('Underwriting report for loan', loanId);
        return report;
    },

    async list(
        input: ListUnderwritingReportsInput,
    ): Promise<PaginatedResult<UnderwritingReport>> {
        const where: Record<string, unknown> = {};
        if (input.loanId) where.loan_id = input.loanId;
        if (input.userId) where.user_id = input.userId;
        if (input.decision) where.decision = input.decision;

        const [rows, total] = await prisma.$transaction([
            prisma.underwriting_reports.findMany({
                where,
                orderBy: { created_at: 'desc' },
                ...toPrismaPage({ page: input.page, limit: input.limit }),
            }),
            prisma.underwriting_reports.count({ where }),
        ]);

        return {
            data: rows.map(
                (r) => mapReport(r as unknown as Record<string, unknown>),
            ),
            pagination: buildPaginationMeta(input.page, input.limit, total),
        };
    },

    async updateDecision(
        id: string,
        decision: UnderwritingDecision,
        notes?: string,
        extra?: Record<string, unknown>,
    ): Promise<UnderwritingReport> {
        const row = await prisma.underwriting_reports.update({
            where: { id },
            data: {
                decision,
                notes: notes ?? undefined,
                updated_at: new Date(),
                ...extra,
            },
        });
        return mapReport(row as unknown as Record<string, unknown>);
    },
};