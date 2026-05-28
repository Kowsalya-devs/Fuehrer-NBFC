// src/modules/loans/loans.repository.ts
import { prisma } from '@/config/database';
import { withTransaction } from '@/config/database';
import { createModuleLogger } from '@/config/logger';
import {
    LOAN_STATUS,
    PAGINATION,
} from '@/config/constants';
import type { LoanStatus, ProductType } from '@/config/constants';
import {
    toPrismaPage,
    buildPaginationMeta,
    toNumber,
} from '@/types/common.types';
import type {
    PaginatedResult,
    PaginationParams,
} from '@/types/common.types';
import type {
    LoanApplication,
    LoanAccount,
    ListLoansInput,
} from './loans.types';
import { NotFoundError } from '@/errors';

const log = createModuleLogger('loans.repository');

// ─── Mappers ───────────────────────────────────────────────────────────────────

function mapApplication(row: Record<string, unknown>): LoanApplication {
    return {
        id: row.id as string,
        userId: row.user_id as string,
        agentId: row.agent_id as string | null,
        status: row.status as LoanStatus,
        amountRequested: toNumber(row.amount_requested as number),
        tenureMonths: row.tenure_months as number,
        productType: row.product_type as ProductType,
        purpose: row.purpose as string,
        storeName: row.store_name as string,
        storeCity: row.store_city as string,
        approvedAmount: row.approved_amount
            ? toNumber(row.approved_amount as number) : null,
        interestRate: row.interest_rate
            ? toNumber(row.interest_rate as number) : null,
        processingFee: row.processing_fee
            ? toNumber(row.processing_fee as number) : null,
        processingFeeGst: row.processing_fee_gst
            ? toNumber(row.processing_fee_gst as number) : null,
        rejectionReason: row.rejection_reason as string | null,
        reviewedBy: row.reviewed_by as string | null,
        reviewedAt: row.reviewed_at as Date | null,
        appliedAt: row.applied_at as Date,
        updatedAt: row.updated_at as Date,
    };
}

function mapAccount(row: Record<string, unknown>): LoanAccount {
    return {
        id: row.id as string,
        applicationId: row.application_id as string,
        userId: row.user_id as string,
        accountNumber: row.account_number as string,
        principalAmount: toNumber(row.principal_amount as number),
        interestRate: toNumber(row.interest_rate as number),
        tenureMonths: row.tenure_months as number,
        monthlyEmi: toNumber(row.monthly_emi as number),
        outstandingBalance: toNumber(row.outstanding_balance as number),
        totalInterest: toNumber(row.total_interest as number),
        status: row.status as LoanStatus,
        repaymentMode: row.repayment_mode as string,
        razorpayMandateId: row.razorpay_mandate_id as string | null,
        disbursedAt: row.disbursed_at as Date | null,
        closedAt: row.closed_at as Date | null,
        createdAt: row.created_at as Date,
        updatedAt: row.updated_at as Date,
    } as LoanAccount;
}

// ─── Account number generator ──────────────────────────────────────────────────
// FHR-2026-000001 — human-readable, sequential, year-scoped

async function generateAccountNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const result = await prisma.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(*)::bigint as count
    FROM loan_accounts
    WHERE EXTRACT(YEAR FROM created_at) = ${year}
  `;
    const seq = Number(result[0]!.count) + 1;
    return `FHR-${year}-${String(seq).padStart(6, '0')}`;
}

// ─── Repository ────────────────────────────────────────────────────────────────

export const loansRepository = {

    // ── Application CRUD ──────────────────────────────────────────────────────

    async findApplicationById(id: string): Promise<LoanApplication | null> {
        const row = await prisma.loan_applications.findUnique({
            where: { id },
        });
        return row ? mapApplication(row as unknown as Record<string, unknown>) : null;
    },

    async findApplicationByIdOrThrow(id: string): Promise<LoanApplication> {
        const app = await this.findApplicationById(id);
        if (!app) throw new NotFoundError('Loan application', id);
        return app;
    },

    async createApplication(
        data: Omit<LoanApplication, 'id' | 'status' | 'approvedAmount' |
            'interestRate' | 'processingFee' | 'processingFeeGst' |
            'rejectionReason' | 'reviewedBy' | 'reviewedAt' | 'updatedAt'>,
    ): Promise<LoanApplication> {
        const row = await prisma.loan_applications.create({
            data: {
                user_id: data.userId,
                agent_id: data.agentId,
                status: LOAN_STATUS.DRAFT,
                amount_requested: data.amountRequested,
                tenure_months: data.tenureMonths,
                product_type: data.productType,
                purpose: data.purpose,
                store_name: data.storeName,
                store_city: data.storeCity,
                applied_at: data.appliedAt,
                updated_at: new Date(),
            },
        });
        return mapApplication(row as unknown as Record<string, unknown>);
    },

    async updateApplicationStatus(
        id: string,
        status: LoanStatus,
        extra?: Record<string, unknown>,
    ): Promise<LoanApplication> {
        const row = await prisma.loan_applications.update({
            where: { id },
            data: {
                status,
                ...extra,
                updated_at: new Date(),
            },
        });
        return mapApplication(row as unknown as Record<string, unknown>);
    },

    // ── Active loan check — only one active application per user ──────────────

    async hasActiveApplication(userId: string): Promise<boolean> {
        const count = await prisma.loan_applications.count({
            where: {
                user_id: userId,
                status: {
                    notIn: [
                        LOAN_STATUS.REJECTED,
                        LOAN_STATUS.CLOSED,
                        LOAN_STATUS.WRITTEN_OFF,
                    ],
                },
            },
        });
        return count > 0;
    },

    // ── Paginated list with full filter / sort support ────────────────────────

    async listApplications(
        filters: ListLoansInput,
    ): Promise<PaginatedResult<LoanApplication>> {
        const where: Record<string, unknown> = {};

        if (filters.userId) where.user_id = filters.userId;
        if (filters.agentId) where.agent_id = filters.agentId;
        if (filters.status) where.status = filters.status;
        if (filters.productType) where.product_type = filters.productType;

        if (filters.fromDate || filters.toDate) {
            where.applied_at = {
                ...(filters.fromDate ? { gte: filters.fromDate } : {}),
                ...(filters.toDate ? { lte: filters.toDate } : {}),
            };
        }

        const sortColumn: Record<string, string> = {
            appliedAt: 'applied_at',
            amount: 'amount_requested',
            updatedAt: 'updated_at',
        };

        const orderBy = {
            [sortColumn[filters.sortBy ?? 'appliedAt'] ?? 'applied_at']:
                filters.sortOrder ?? 'desc',
        };

        const [rows, total] = await prisma.$transaction([
            prisma.loan_applications.findMany({
                where,
                orderBy,
                ...toPrismaPage({ page: filters.page, limit: filters.limit }),
            }),
            prisma.loan_applications.count({ where }),
        ]);

        return {
            data: rows.map(
                (r) => mapApplication(r as unknown as Record<string, unknown>),
            ),
            pagination: buildPaginationMeta(filters.page, filters.limit, total),
        };
    },

    // ── Loan account CRUD ──────────────────────────────────────────────────────

    async findAccountByApplicationId(
        applicationId: string,
    ): Promise<LoanAccount | null> {
        const row = await prisma.loan_accounts.findFirst({
            where: { application_id: applicationId },
        });
        return row ? mapAccount(row as unknown as Record<string, unknown>) : null;
    },

    async findAccountById(id: string): Promise<LoanAccount | null> {
        const row = await prisma.loan_accounts.findUnique({ where: { id } });
        return row ? mapAccount(row as unknown as Record<string, unknown>) : null;
    },

    async findAccountByIdOrThrow(id: string): Promise<LoanAccount> {
        const acc = await this.findAccountById(id);
        if (!acc) throw new NotFoundError('Loan account', id);
        return acc;
    },

    async findAccountsByUserId(
        userId: string,
        pagination: PaginationParams,
    ): Promise<PaginatedResult<LoanAccount>> {
        const [rows, total] = await prisma.$transaction([
            prisma.loan_accounts.findMany({
                where: { user_id: userId },
                orderBy: { created_at: 'desc' },
                ...toPrismaPage(pagination),
            }),
            prisma.loan_accounts.count({ where: { user_id: userId } }),
        ]);
        return {
            data: rows.map(
                (r) => mapAccount(r as unknown as Record<string, unknown>),
            ),
            pagination: buildPaginationMeta(
                pagination.page, pagination.limit, total,
            ),
        };
    },

    // ── Create loan account — called atomically with EMI schedule creation ────

    async createAccount(data: {
        applicationId: string;
        userId: string;
        principalAmount: number;
        interestRate: number;
        tenureMonths: number;
        monthlyEmi: number;
        totalInterest: number;
    }): Promise<LoanAccount> {
        return withTransaction(async (tx) => {
            const accountNumber = await generateAccountNumber();

            const row = await tx.loan_accounts.create({
                data: {
                    application_id: data.applicationId,
                    user_id: data.userId,
                    account_number: accountNumber,
                    principal_amount: data.principalAmount,
                    interest_rate: data.interestRate,
                    tenure_months: data.tenureMonths,
                    monthly_emi: data.monthlyEmi,
                    outstanding_balance: data.principalAmount + data.totalInterest,
                    total_interest: data.totalInterest,
                    status: LOAN_STATUS.DISBURSED,
                    created_at: new Date(),
                    updated_at: new Date(),
                },
            });

            // Update application status to DISBURSED atomically
            await tx.loan_applications.update({
                where: { id: data.applicationId },
                data: {
                    status: LOAN_STATUS.DISBURSED,
                    updated_at: new Date(),
                },
            });

            log.info('Loan account created', {
                accountId: row.id,
                accountNumber,
                applicationId: data.applicationId,
            });

            return mapAccount(row as unknown as Record<string, unknown>);
        });
    },

    async updateAccountStatus(
        id: string,
        status: LoanStatus,
        extra?: Record<string, unknown>,
    ): Promise<LoanAccount> {
        const row = await prisma.loan_accounts.update({
            where: { id },
            data: { status, ...extra, updated_at: new Date() },
        });
        return mapAccount(row as unknown as Record<string, unknown>);
    },

    async updateMandateId(
        accountId: string,
        mandateId: string,
    ): Promise<void> {
        await prisma.loan_accounts.update({
            where: { id: accountId },
            data: {
                razorpay_mandate_id: mandateId,
                updated_at: new Date(),
            },
        });
    },

    // ── Overdue / NPA queries — used by cron jobs ─────────────────────────────

    async findActiveLoansWithOverdueEmis(
        overdueDaysThreshold: number,
    ): Promise<Array<{ loanAccountId: string; userId: string; overdueDays: number }>> {
        const cutoffDate = new Date(
            Date.now() - overdueDaysThreshold * 24 * 60 * 60 * 1000,
        );

        const rows = await prisma.$queryRaw<
            Array<{ loan_account_id: string; user_id: string; overdue_days: number }>
        > `
      SELECT
        la.id           AS loan_account_id,
        la.user_id,
        EXTRACT(DAY FROM NOW() - MIN(es.due_date))::int AS overdue_days
      FROM loan_accounts la
      JOIN emi_schedule es ON es.loan_account_id = la.id
      WHERE
        la.status   = 'ACTIVE'
        AND es.status IN ('PENDING', 'BOUNCED')
        AND es.due_date <= ${cutoffDate}
      GROUP BY la.id, la.user_id
      HAVING EXTRACT(DAY FROM NOW() - MIN(es.due_date)) >= ${overdueDaysThreshold}
      ORDER BY overdue_days DESC
    `;

        return rows.map((r) => ({
            loanAccountId: r.loan_account_id,
            userId: r.user_id,
            overdueDays: r.overdue_days,
        }));
    },
};
