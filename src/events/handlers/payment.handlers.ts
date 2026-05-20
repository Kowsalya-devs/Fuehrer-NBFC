// src/events/handlers/payment.handlers.ts
import { eventBus } from '../eventBus';
import { prisma } from '@/config/database';
import { withTransaction } from '@/config/database';
import { createModuleLogger } from '@/config/logger';
import {
    AUDIT_ACTION,
    EMI_STATUS,
    LOAN_STATUS,
    BUSINESS_RULES,
} from '@/config/constants';
import {
    roundRupees,
    daysBetween,
    toNumber,
} from '@/types/common.types';

const log = createModuleLogger('payment.handlers');

// ─── payment.received ─────────────────────────────────────────────────────────
// Four things on every successful payment:
//  1. Mark EMI as PAID
//  2. Update outstanding balance on loan account
//  3. Audit log
//  4. Check if all EMIs are done → close the loan

eventBus.on('payment.received', 'emi:mark-paid', async (payload) => {
    await withTransaction(async (tx) => {
        // 1. Mark the specific EMI
        await tx.emi_schedule.update({
            where: { id: payload.emiId },
            data: {
                status: EMI_STATUS.PAID,
                paid_at: payload.paidAt,
                // Clear any penalty if paid
                penalty_amount: 0,
            },
        });

        // 2. Recalculate outstanding balance
        const remainingEmis = await tx.emi_schedule.aggregate({
            where: {
                loan_account_id: payload.loanAccountId,
                status: { in: [EMI_STATUS.PENDING, EMI_STATUS.OVERDUE] },
            },
            _sum: { emi_amount: true, penalty_amount: true },
        });

        const newOutstanding = roundRupees(
            toNumber(remainingEmis._sum.emi_amount ?? 0) +
            toNumber(remainingEmis._sum.penalty_amount ?? 0),
        );

        await tx.loan_accounts.update({
            where: { id: payload.loanAccountId },
            data: { outstanding_balance: newOutstanding },
        });
    });

    log.info('EMI marked as paid', {
        emiId: payload.emiId,
        emiNumber: payload.emiNumber,
        loanAccountId: payload.loanAccountId,
        amount: payload.amount,
    });
});

eventBus.on('payment.received', 'audit:payment.received', async (payload) => {
    await prisma.audit_logs.create({
        data: {
            action: AUDIT_ACTION.EMI_PAID,
            entity_type: 'payment',
            entity_id: payload.paymentId,
            user_id: payload.userId,
            request_id: payload.requestId,
            after_state: JSON.stringify({
                emiId: payload.emiId,
                emiNumber: payload.emiNumber,
                amount: payload.amount,
                channel: payload.channel,
                gatewayTxnId: payload.gatewayTxnId,
                paidAt: payload.paidAt,
            }),
            created_at: new Date(),
        },
    });
});

eventBus.on('payment.received', 'loan:check-closure', async (payload) => {
    // Count remaining unpaid EMIs
    const pendingCount = await prisma.emi_schedule.count({
        where: {
            loan_account_id: payload.loanAccountId,
            status: { in: [EMI_STATUS.PENDING, EMI_STATUS.OVERDUE] },
        },
    });

    if (pendingCount > 0) return; // Still has open EMIs

    // All EMIs paid — close the loan
    const account = await prisma.loan_accounts.update({
        where: { id: payload.loanAccountId },
        data: {
            status: LOAN_STATUS.CLOSED,
            outstanding_balance: 0,
            closed_at: new Date(),
        },
        select: { user_id: true },
    });

    log.info('Loan auto-closed after final EMI payment', {
        loanAccountId: payload.loanAccountId,
    });

    eventBus.emit('loan.closed', {
        loanAccountId: payload.loanAccountId,
        userId: account.user_id,
        closedAt: new Date(),
        requestId: payload.requestId,
    });
});

// ─── payment.failed ───────────────────────────────────────────────────────────

eventBus.on('payment.failed', 'audit:payment.failed', async (payload) => {
    await prisma.audit_logs.create({
        data: {
            action: AUDIT_ACTION.PAYMENT_FAILED,
            entity_type: 'payment',
            entity_id: payload.paymentId,
            user_id: payload.userId,
            request_id: payload.requestId,
            after_state: JSON.stringify({
                emiId: payload.emiId,
                emiNumber: payload.emiNumber,
                amount: payload.amount,
                reason: payload.reason,
                gatewayCode: payload.gatewayCode,
            }),
            created_at: new Date(),
        },
    });
});

// ─── emi.bounced ──────────────────────────────────────────────────────────────
// eNACH debit failed (insufficient funds, account closed, etc.)
// Apply bounce penalty, update EMI status, log for retry job.

eventBus.on('emi.bounced', 'emi:apply-bounce-penalty', async (payload) => {
    const emi = await prisma.emi_schedule.findUnique({
        where: { id: payload.emiId },
    });

    if (!emi || emi.status === EMI_STATUS.PAID) return;

    const penaltyAmount = roundRupees(
        toNumber(emi.emi_amount) * BUSINESS_RULES.EMI_BOUNCE_PENALTY_RATE,
    );

    await prisma.emi_schedule.update({
        where: { id: payload.emiId },
        data: {
            status: EMI_STATUS.BOUNCED,
            bounce_count: { increment: 1 },
            penalty_amount: { increment: penaltyAmount },
            last_bounce_at: new Date(),
            next_retry_at: payload.nextRetryAt,
        },
    });

    log.warn('EMI bounce penalty applied', {
        emiId: payload.emiId,
        emiNumber: payload.emiNumber,
        loanAccountId: payload.loanAccountId,
        penaltyAmount,
        retryCount: payload.retryCount,
    });
});

eventBus.on('emi.bounced', 'audit:emi.bounced', async (payload) => {
    await prisma.audit_logs.create({
        data: {
            action: AUDIT_ACTION.EMI_BOUNCED,
            entity_type: 'emi_schedule',
            entity_id: payload.emiId,
            user_id: payload.userId,
            after_state: JSON.stringify({
                emiNumber: payload.emiNumber,
                amount: payload.amount,
                bounceReason: payload.bounceReason,
                retryCount: payload.retryCount,
                nextRetryAt: payload.nextRetryAt,
            }),
            created_at: new Date(),
        },
    });
});

eventBus.on('emi.bounced', 'loan:check-npa-threshold', async (payload) => {
    // If bounce count exceeds retry limit, check for NPA threshold
    if (payload.retryCount < BUSINESS_RULES.ENACH_RETRY_LIMIT) return;

    const overdueEmis = await prisma.emi_schedule.findMany({
        where: {
            loan_account_id: payload.loanAccountId,
            status: { in: [EMI_STATUS.OVERDUE, EMI_STATUS.BOUNCED] },
            due_date: {
                lte: new Date(Date.now() - BUSINESS_RULES.NPA_TRIGGER_DAYS * 24 * 60 * 60 * 1000),
            },
        },
        orderBy: { due_date: 'asc' },
    });

    if (overdueEmis.length === 0) return;

    const oldestOverdue = overdueEmis[0]!;
    const overdueDays = daysBetween(oldestOverdue.due_date, new Date());

    if (overdueDays < BUSINESS_RULES.NPA_TRIGGER_DAYS) return;

    // Trigger NPA
    const account = await prisma.loan_accounts.update({
        where: { id: payload.loanAccountId },
        data: { status: LOAN_STATUS.NPA },
        select: { user_id: true, outstanding_balance: true },
    });

    const overdueAmount = overdueEmis.reduce(
        (sum, e) => sum + toNumber(e.emi_amount) + toNumber(e.penalty_amount ?? 0),
        0,
    );

    log.warn('Loan marked as NPA via bounce threshold', {
        loanAccountId: payload.loanAccountId,
        overdueDays,
        overdueAmount,
    });

    eventBus.emit('loan.npa', {
        loanAccountId: payload.loanAccountId,
        userId: account.user_id,
        overdueDays,
        overdueAmount: roundRupees(overdueAmount),
        markedAt: new Date(),
        requestId: `job:bounce-npa:${payload.loanAccountId}`,
    });
});

// ─── emi.overdue ──────────────────────────────────────────────────────────────
// Fired by the npaWatch cron job for EMIs past the grace period.
// Applies daily overdue penalty and checks NPA threshold.

eventBus.on('emi.overdue', 'emi:apply-overdue-penalty', async (payload) => {
    // Overdue penalty = annual rate / 365 × outstanding × overdue days
    const dailyPenaltyRate =
        BUSINESS_RULES.EMI_OVERDUE_PENALTY_RATE / 365;

    const dailyPenalty = roundRupees(
        toNumber(payload.overdueAmount) * dailyPenaltyRate,
    );

    await prisma.emi_schedule.update({
        where: { id: payload.emiId },
        data: {
            status: EMI_STATUS.OVERDUE,
            penalty_amount: { increment: dailyPenalty },
        },
    });

    // Update loan account outstanding to include the new penalty
    await prisma.loan_accounts.update({
        where: { id: payload.loanAccountId },
        data: {
            outstanding_balance: { increment: dailyPenalty },
        },
    });
});

// ─── mandate.created ──────────────────────────────────────────────────────────

eventBus.on('mandate.created', 'audit:mandate.created', async (payload) => {
    await prisma.audit_logs.create({
        data: {
            action: 'MANDATE_CREATED',
            entity_type: 'loan_account',
            entity_id: payload.loanAccountId,
            user_id: payload.userId,
            request_id: payload.requestId,
            after_state: JSON.stringify({
                mandateId: payload.mandateId,
                bankAccount: payload.bankAccount,
            }),
            created_at: new Date(),
        },
    });
});

log.info('Payment event handlers registered');