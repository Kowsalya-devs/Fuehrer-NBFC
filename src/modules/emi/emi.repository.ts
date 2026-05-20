// src/modules/emi/emi.repository.ts
import { prisma } from '@/config/database';
import { withTransaction } from '@/config/database';
import { createModuleLogger } from '@/config/logger';
import {
    EMI_STATUS,
    PAGINATION,
} from '@/config/constants';
import { toNumber } from '@/types/common.types';
import {
    NotFoundError,
} from '@/errors';
import type {
    EmiScheduleEntry,
    AmortizationSchedule,
    EmiScheduleSummary,
    ListEmiScheduleInput,
    OverdueEmiResult,
    EmiReminderTarget,
    NachDebitTarget,
} from './emi.types';

const log = createModuleLogger('emi.repository');

// ─── Type mapper ──────────────────────────────────────────────────────────────

function mapEntry(row: Record<string, unknown>): EmiScheduleEntry {
    return {
        id: row.id as string,
        loanAccountId: row.loan_account_id as string,
        emiNumber: row.emi_number as number,
        dueDate: row.due_date as Date,
        emiAmount: toNumber(row.emi_amount as number),
        principalComponent: toNumber(row.principal_component as number),
        interestComponent: toNumber(row.interest_component as number),
        outstandingAfter: toNumber(row.outstanding_after as number),
        status: row.status as string,
        penaltyAmount: toNumber(row.penalty_amount ?? 0),
        bounceCount: (row.bounce_count as number) ?? 0,
        lastBounceAt: row.last_bounce_at as Date | null,
        nextRetryAt: row.next_retry_at as Date | null,
        collectionId: row.collection_id as string | null,
        paidAt: row.paid_at as Date | null,
        createdAt: row.created_at as Date,
        updatedAt: row.updated_at as Date,
    } as EmiScheduleEntry;
}

// ─── Repository ────────────────────────────────────────────────────────────────

export const emiRepository = {

    // ── Bulk create — called once at disbursement, atomically ─────────────────
    // Entire schedule created in a single transaction or nothing.
    // Never called incrementally — always the full tenure at once.

    async createSchedule(schedule: AmortizationSchedule): Promise<void> {
        await withTransaction(async (tx) => {
            await tx.emi_schedule.createMany({
                data: schedule.entries.map((e) => ({
                    loan_account_id: schedule.loanAccountId,
                    emi_number: e.emiNumber,
                    due_date: e.dueDate,
                    emi_amount: e.emiAmount,
                    principal_component: e.principalComponent,
                    interest_component: e.interestComponent,
                    outstanding_after: e.outstandingAfter,
                    status: EMI_STATUS.PENDING,
                    penalty_amount: 0,
                    bounce_count: 0,
                    created_at: new Date(),
                    updated_at: new Date(),
                })),
            });
        });

        log.info('EMI schedule created', {
            loanAccountId: schedule.loanAccountId,
            entries: schedule.entries.length,
            monthlyEmi: schedule.monthlyEmi,
            totalPayable: schedule.totalPayable,
        });
    },

    // ── Find ──────────────────────────────────────────────────────────────────

    async findById(id: string): Promise<EmiScheduleEntry | null> {
        const row = await prisma.emi_schedule.findUnique({ where: { id } });
        return row ? mapEntry(row as unknown as Record<string, unknown>) : null;
    },

    async findByIdOrThrow(id: string): Promise<EmiScheduleEntry> {
        const entry = await this.findById(id);
        if (!entry) throw new NotFoundError('EMI', id);
        return entry;
    },

    async findByLoanAccountId(
        input: ListEmiScheduleInput,
    ): Promise<EmiScheduleEntry[]> {
        const where: Record<string, unknown> = {
            loan_account_id: input.loanAccountId,
        };
        if (input.status) where.status = input.status;

        const rows = await prisma.emi_schedule.findMany({
            where,
            orderBy: { emi_number: input.sortOrder ?? 'asc' },
        });

        return rows.map(
            (r) => mapEntry(r as unknown as Record<string, unknown>),
        );
    },

    async findNextDueEmi(
        loanAccountId: string,
    ): Promise<EmiScheduleEntry | null> {
        const row = await prisma.emi_schedule.findFirst({
            where: {
                loan_account_id: loanAccountId,
                status: { in: [EMI_STATUS.PENDING, EMI_STATUS.BOUNCED] },
            },
            orderBy: { due_date: 'asc' },
        });
        return row ? mapEntry(row as unknown as Record<string, unknown>) : null;
    },

    // ── Summary ───────────────────────────────────────────────────────────────

    async getSummary(loanAccountId: string): Promise<EmiScheduleSummary> {
        const [counts, totals, lastPaid, nextDue] = await prisma.$transaction([

            // Status counts
            prisma.emi_schedule.groupBy({
                by: ['status'],
                where: { loan_account_id: loanAccountId },
                _count: { id: true },
            }),

            // Aggregate outstanding + penalty
            prisma.emi_schedule.aggregate({
                where: {
                    loan_account_id: loanAccountId,
                    status: { in: [EMI_STATUS.PENDING, EMI_STATUS.OVERDUE, EMI_STATUS.BOUNCED] },
                },
                _sum: { emi_amount: true, penalty_amount: true },
            }),

            // Most recently paid
            prisma.emi_schedule.findFirst({
                where: { loan_account_id: loanAccountId, status: EMI_STATUS.PAID },
                orderBy: { paid_at: 'desc' },
                select: { paid_at: true },
            }),

            // Next due
            prisma.emi_schedule.findFirst({
                where: {
                    loan_account_id: loanAccountId,
                    status: { in: [EMI_STATUS.PENDING, EMI_STATUS.BOUNCED] },
                },
                orderBy: { due_date: 'asc' },
                select: { due_date: true, emi_amount: true },
            }),
        ]);

        const countMap = Object.fromEntries(
            (counts as Array<{ status: string; _count: { id: number } }>)
                .map((c) => [c.status, c._count.id]),
        );

        const totalEntries = Object.values(countMap).reduce(
            (s: number, c) => s + (c as number), 0,
        );

        return {
            loanAccountId,
            totalEmis: totalEntries,
            paidEmis: (countMap[EMI_STATUS.PAID] as number) ?? 0,
            overdueEmis: (countMap[EMI_STATUS.OVERDUE] as number) ?? 0,
            pendingEmis: (countMap[EMI_STATUS.PENDING] as number) ?? 0,
            nextDueDate: nextDue?.due_date ?? null,
            nextEmiAmount: nextDue?.emi_amount
                ? toNumber(nextDue.emi_amount as number) : null,
            totalOutstanding: toNumber(totals._sum.emi_amount ?? 0),
            totalPenalty: toNumber(totals._sum.penalty_amount ?? 0),
            lastPaidAt: lastPaid?.paid_at ?? null,
        };
    },

    // ── Status mutations ──────────────────────────────────────────────────────

    async markPaid(
        id: string,
        paidAt: Date,
        collectionId?: string,
    ): Promise<EmiScheduleEntry> {
        const row = await prisma.emi_schedule.update({
            where: { id },
            data: {
                status: EMI_STATUS.PAID,
                paid_at: paidAt,
                penalty_amount: 0,
                collection_id: collectionId ?? null,
                updated_at: new Date(),
            },
        });
        return mapEntry(row as unknown as Record<string, unknown>);
    },

    async markOverdue(id: string): Promise<void> {
        await prisma.emi_schedule.update({
            where: { id },
            data: {
                status: EMI_STATUS.OVERDUE,
                updated_at: new Date(),
            },
        });
    },

    async markBounced(
        id: string,
        nextRetryAt: Date | null,
    ): Promise<EmiScheduleEntry> {
        const row = await prisma.emi_schedule.update({
            where: { id },
            data: {
                status: EMI_STATUS.BOUNCED,
                bounce_count: { increment: 1 },
                last_bounce_at: new Date(),
                next_retry_at: nextRetryAt,
                updated_at: new Date(),
            },
        });
        return mapEntry(row as unknown as Record<string, unknown>);
    },

    async waiveEmi(id: string): Promise<EmiScheduleEntry> {
        const row = await prisma.emi_schedule.update({
            where: { id },
            data: {
                status: EMI_STATUS.WAIVED,
                penalty_amount: 0,
                updated_at: new Date(),
            },
        });
        return mapEntry(row as unknown as Record<string, unknown>);
    },

    // ── Penalty mutations ─────────────────────────────────────────────────────

    async incrementPenalty(
        id: string,
        addPaisa: number,   // Amount in paisa — avoids float add
    ): Promise<void> {
        const addRupees = addPaisa / 100;
        await prisma.emi_schedule.update({
            where: { id },
            data: {
                penalty_amount: { increment: addRupees },
                updated_at: new Date(),
            },
        });
    },

    async clearPenalty(id: string): Promise<void> {
        await prisma.emi_schedule.update({
            where: { id },
            data: { penalty_amount: 0, updated_at: new Date() },
        });
    },

    // ── Cron job queries ──────────────────────────────────────────────────────
    // These return minimal projections — cron jobs don't need full rows

    async findEmisForReminder(
        targetDate: Date,
        daysBefore: number,
    ): Promise<EmiReminderTarget[]> {
        const dueFrom = new Date(targetDate);
        const dueTo = new Date(targetDate);
        dueTo.setDate(dueTo.getDate() + daysBefore);

        const rows = await prisma.$queryRaw<Array<{
            id: string;
            loan_account_id: string;
            user_id: string;
            emi_number: number;
            due_date: Date;
            emi_amount: number;
        }>>`
      SELECT
        es.id,
        es.loan_account_id,
        la.user_id,
        es.emi_number,
        es.due_date,
        es.emi_amount
      FROM emi_schedule es
      JOIN loan_accounts la ON la.id = es.loan_account_id
      WHERE
        es.status = 'PENDING'
        AND es.due_date BETWEEN ${dueFrom} AND ${dueTo}
        AND la.status  = 'ACTIVE'
      ORDER BY es.due_date ASC
    `;

        return rows.map((r) => ({
            userId: r.user_id,
            loanAccountId: r.loan_account_id,
            emiId: r.id,
            emiNumber: r.emi_number,
            dueDate: r.due_date,
            emiAmount: toNumber(r.emi_amount),
            daysUntilDue: Math.round(
                (r.due_date.getTime() - targetDate.getTime()) / (1000 * 60 * 60 * 24),
            ),
        }));
    },

    async findEmisForNachDebit(debitDate: Date): Promise<NachDebitTarget[]> {
        // Debit EMIs due today or yesterday (catch any that were missed)
        const from = new Date(debitDate);
        from.setDate(from.getDate() - 1);

        const rows = await prisma.$queryRaw<Array<{
            id: string;
            loan_account_id: string;
            user_id: string;
            mandate_id: string;
            emi_number: number;
            emi_amount: number;
            penalty_amount: number;
            due_date: Date;
        }>>`
      SELECT
        es.id,
        es.loan_account_id,
        la.user_id,
        la.razorpay_mandate_id AS mandate_id,
        es.emi_number,
        es.emi_amount,
        es.penalty_amount,
        es.due_date
      FROM emi_schedule   es
      JOIN loan_accounts  la ON la.id = es.loan_account_id
      WHERE
        es.status       IN ('PENDING', 'OVERDUE')
        AND la.status    = 'ACTIVE'
        AND la.razorpay_mandate_id IS NOT NULL
        AND es.due_date BETWEEN ${from} AND ${debitDate}
      ORDER BY es.due_date ASC
    `;

        return rows.map((r) => {
            const emiAmount = toNumber(r.emi_amount);
            const penaltyAmount = toNumber(r.penalty_amount);
            return {
                emiId: r.id,
                loanAccountId: r.loan_account_id,
                userId: r.user_id,
                mandateId: r.mandate_id,
                emiNumber: r.emi_number,
                emiAmount,
                penaltyAmount,
                totalDebit: Math.round((emiAmount + penaltyAmount) * 100) / 100,
                dueDate: r.due_date,
            };
        });
    },

    async findOverdueEmis(
        gracePeriodDays: number,
    ): Promise<OverdueEmiResult[]> {
        const cutoff = new Date(
            Date.now() - gracePeriodDays * 24 * 60 * 60 * 1000,
        );

        const rows = await prisma.$queryRaw<Array<{
            id: string;
            loan_account_id: string;
            user_id: string;
            emi_number: number;
            due_date: Date;
            emi_amount: number;
            penalty_amount: number;
            bounce_count: number;
        }>>`
      SELECT
        es.id,
        es.loan_account_id,
        la.user_id,
        es.emi_number,
        es.due_date,
        es.emi_amount,
        es.penalty_amount,
        es.bounce_count
      FROM emi_schedule  es
      JOIN loan_accounts la ON la.id = es.loan_account_id
      WHERE
        es.status IN ('PENDING', 'BOUNCED')
        AND la.status = 'ACTIVE'
        AND es.due_date < ${cutoff}
      ORDER BY es.due_date ASC
    `;

        const today = new Date();
        return rows.map((r) => ({
            emiId: r.id,
            loanAccountId: r.loan_account_id,
            userId: r.user_id,
            emiNumber: r.emi_number,
            dueDate: r.due_date,
            overdueDays: Math.floor(
                (today.getTime() - r.due_date.getTime()) / (1000 * 60 * 60 * 24),
            ),
            emiAmount: toNumber(r.emi_amount),
            penaltyAmount: toNumber(r.penalty_amount),
            bounceCount: r.bounce_count,
        }));
    },

    async countUnpaidEmis(loanAccountId: string): Promise<number> {
        return prisma.emi_schedule.count({
            where: {
                loan_account_id: loanAccountId,
                status: { in: [EMI_STATUS.PENDING, EMI_STATUS.OVERDUE, EMI_STATUS.BOUNCED] },
            },
        });
    },
};