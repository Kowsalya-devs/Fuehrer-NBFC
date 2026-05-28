// src/modules/notifications/notifications.events.ts
//
// This file wires the event bus to the notifications service.
// Every event bus listener here is purely reactive — it reads the event
// payload, resolves the recipient, and calls notificationsService.dispatch.
//
// Rules:
//   1. Listeners must never throw — all errors are caught and logged.
//   2. Listeners never await each other — dispatch is always concurrent.
//   3. Template choice and channel selection live here, not in the emitting module.
//   4. Deduplication keys prevent spam (e.g. one EMI reminder per 24h per loan).

import { eventBus } from '@/events/eventBus';
import { notificationsService } from './notifications.service';
import { createModuleLogger } from '@/config/logger';
import { formatRupees } from '@/types/common.types';

const log = createModuleLogger('notifications.events');

// ─── Helper ───────────────────────────────────────────────────────────────────

function safeDispatch(
    fn: () => Promise<void>,
    context: string,
): void {
    fn().catch((err) => {
        log.error('Notification dispatch error', {
            context,
            error: (err as Error).message,
        });
    });
}

// ─── Loan lifecycle ───────────────────────────────────────────────────────────

eventBus.on('loan.created', 'notifications:loan.created', (payload) => {
    safeDispatch(async () => {
        const recipient = await notificationsService.resolveRecipient(payload.userId);
        await notificationsService.dispatch({
            template: 'LOAN_CREATED',
            variables: {
                customerName: recipient.phone ?? 'Customer',
                amount: payload.amount,
                loanId: payload.loanId,
            },
            channels: ['SMS', 'PUSH'],
            recipient,
            dedupeKey: `loan_created:${payload.loanId}`,
            dedupeTtl: 86400,
        });
    }, 'loan.created');
});

eventBus.on('loan.approved', 'notifications:loan.approved', (payload) => {
    safeDispatch(async () => {
        const recipient = await notificationsService.resolveRecipient(payload.userId);
        await notificationsService.dispatch({
            template: 'LOAN_APPROVED',
            variables: {
                customerName: recipient.phone ?? 'Customer',
                approvedAmount: payload.approvedAmount,
                monthlyEmi: payload.monthlyEmi,
                tenureMonths: payload.tenureMonths,
                interestRate: payload.interestRate,
            },
            channels: ['SMS', 'EMAIL', 'PUSH'],
            recipient,
            dedupeKey: `loan_approved:${payload.loanId}`,
            dedupeTtl: 86400,
        });
    }, 'loan.approved');
});

eventBus.on('loan.rejected', 'notifications:loan.rejected', (payload) => {
    safeDispatch(async () => {
        const recipient = await notificationsService.resolveRecipient(payload.userId);
        await notificationsService.dispatch({
            template: 'LOAN_REJECTED',
            variables: {
                customerName: recipient.phone ?? 'Customer',
                reason: payload.reason,
            },
            channels: ['SMS', 'EMAIL', 'PUSH'],
            recipient,
            dedupeKey: `loan_rejected:${payload.loanId}`,
            dedupeTtl: 86400,
        });
    }, 'loan.rejected');
});

eventBus.on('loan.disbursed', 'notifications:loan.disbursed', (payload) => {
    safeDispatch(async () => {
        const recipient = await notificationsService.resolveRecipient(payload.userId);

        // Fetch account details for the notification
        const { prisma } = await import('@/config/database');
        const account = await prisma.loan_accounts.findFirst({
            where: { id: payload.loanAccountId },
            select: { account_number: true, monthly_emi: true },
        });

        const { addMonths } = await import('@/types/common.types');
        const firstEmiDate = addMonths(payload.disbursedAt, 1)
            .toLocaleDateString('en-IN');

        await notificationsService.dispatch({
            template: 'LOAN_DISBURSED',
            variables: {
                customerName: recipient.phone ?? 'Customer',
                disbursedAmount: payload.disbursedAmount,
                accountNumber: (account?.account_number as string) ?? '',
                utrNumber: payload.utrNumber,
                firstEmiDate,
                monthlyEmi: Number(account?.monthly_emi ?? 0),
            },
            channels: ['SMS', 'EMAIL', 'PUSH'],
            recipient,
            dedupeKey: `loan_disbursed:${payload.loanAccountId}`,
            dedupeTtl: 86400,
        });
    }, 'loan.disbursed');
});

eventBus.on('loan.closed', 'notifications:loan.closed', (payload) => {
    safeDispatch(async () => {
        const recipient = await notificationsService.resolveRecipient(payload.userId);
        const { prisma } = await import('@/config/database');
        const account = await prisma.loan_accounts.findFirst({
            where: { id: payload.loanAccountId },
            select: { account_number: true },
        });

        await notificationsService.dispatch({
            template: 'LOAN_CLOSED',
            variables: {
                customerName: recipient.phone ?? 'Customer',
                accountNumber: (account?.account_number as string) ?? '',
                closedAt: payload.closedAt.toLocaleDateString('en-IN'),
            },
            channels: ['SMS', 'EMAIL', 'PUSH'],
            recipient,
            dedupeKey: `loan_closed:${payload.loanAccountId}`,
            dedupeTtl: 86400,
        });
    }, 'loan.closed');
});

eventBus.on('loan.npa', 'notifications:loan.npa', (payload) => {
    safeDispatch(async () => {
        const recipient = await notificationsService.resolveRecipient(payload.userId);
        const { prisma } = await import('@/config/database');
        const account = await prisma.loan_accounts.findFirst({
            where: { id: payload.loanAccountId },
            select: { account_number: true },
        });

        await notificationsService.dispatch({
            template: 'LOAN_NPA',
            variables: {
                customerName: recipient.phone ?? 'Customer',
                accountNumber: (account?.account_number as string) ?? '',
                overdueDays: payload.overdueDays,
                totalDue: payload.overdueAmount,
            },
            channels: ['SMS', 'PUSH'],
            recipient,
            dedupeKey: `loan_npa:${payload.loanAccountId}:${new Date().toDateString()}`,
            dedupeTtl: 86400,  // Once per day
        });
    }, 'loan.npa');
});

// ─── KYC events ───────────────────────────────────────────────────────────────

eventBus.on('kyc.initiated', 'notifications:kyc.initiated', (payload) => {
    safeDispatch(async () => {
        const recipient = await notificationsService.resolveRecipient(payload.userId);
        await notificationsService.dispatch({
            template: 'KYC_INITIATED',
            variables: { customerName: recipient.phone ?? 'Customer' },
            channels: ['PUSH'],
            recipient,
            dedupeKey: `kyc_initiated:${payload.userId}`,
            dedupeTtl: 3600,
        });
    }, 'kyc.initiated');
});

eventBus.on('kyc.completed', 'notifications:kyc.completed', (payload) => {
    safeDispatch(async () => {
        const recipient = await notificationsService.resolveRecipient(payload.userId);
        await notificationsService.dispatch({
            template: 'KYC_COMPLETED',
            variables: { customerName: recipient.phone ?? 'Customer' },
            channels: ['SMS', 'PUSH'],
            recipient,
            dedupeKey: `kyc_completed:${payload.userId}`,
            dedupeTtl: 86400,
        });
    }, 'kyc.completed');
});

eventBus.on('kyc.rejected', 'notifications:kyc.rejected', (payload) => {
    safeDispatch(async () => {
        const recipient = await notificationsService.resolveRecipient(payload.userId);
        await notificationsService.dispatch({
            template: 'KYC_REJECTED',
            variables: {
                customerName: recipient.phone ?? 'Customer',
                reason: payload.reason,
            },
            channels: ['SMS', 'PUSH'],
            recipient,
            dedupeKey: `kyc_rejected:${payload.userId}`,
            dedupeTtl: 86400,
        });
    }, 'kyc.rejected');
});

// ─── Payment events ───────────────────────────────────────────────────────────

eventBus.on('payment.received', 'notifications:payment.received', (payload) => {
    safeDispatch(async () => {
        const recipient = await notificationsService.resolveRecipient(payload.userId);
        const { prisma } = await import('@/config/database');
        const account = await prisma.loan_accounts.findFirst({
            where: { id: payload.loanAccountId },
            select: { account_number: true },
        });

        await notificationsService.dispatch({
            template: 'EMI_PAID',
            variables: {
                customerName: recipient.phone ?? 'Customer',
                amount: payload.amount,
                emiNumber: payload.emiNumber,
                accountNumber: (account?.account_number as string) ?? '',
                paidAt: payload.paidAt.toLocaleDateString('en-IN'),
            },
            channels: ['SMS', 'PUSH'],
            recipient,
            dedupeKey: `payment_received:${payload.paymentId}`,
            dedupeTtl: 86400,
        });
    }, 'payment.received');
});

eventBus.on('payment.failed', 'notifications:payment.failed', (payload) => {
    safeDispatch(async () => {
        const recipient = await notificationsService.resolveRecipient(payload.userId);
        await notificationsService.dispatch({
            template: 'PAYMENT_FAILED',
            variables: {
                customerName: recipient.phone ?? 'Customer',
                amount: payload.amount,
                reason: payload.reason,
            },
            channels: ['SMS', 'PUSH'],
            recipient,
            dedupeKey: `payment_failed:${payload.paymentId}`,
            dedupeTtl: 3600,
        });
    }, 'payment.failed');
});

eventBus.on('mandate.created', 'notifications:mandate.created', (payload) => {
    safeDispatch(async () => {
        const recipient = await notificationsService.resolveRecipient(payload.userId);
        await notificationsService.dispatch({
            template: 'MANDATE_CREATED',
            variables: {
                customerName: recipient.phone ?? 'Customer',
                registrationLink: 'https://app.feuhrer.in/mandate',
                bankAccount: payload.bankAccount,
            },
            channels: ['SMS', 'PUSH'],
            recipient,
            dedupeKey: `mandate_created:${payload.mandateId}`,
            dedupeTtl: 86400,
        });
    }, 'mandate.created');
});

// ─── EMI bounce ───────────────────────────────────────────────────────────────

eventBus.on('emi.bounced', 'notifications:emi.bounced', (payload) => {
    safeDispatch(async () => {
        const recipient = await notificationsService.resolveRecipient(payload.userId);
        const { prisma } = await import('@/config/database');
        const account = await prisma.loan_accounts.findFirst({
            where: { id: payload.loanAccountId },
            select: { account_number: true },
        });
        const { BUSINESS_RULES } = await import('@/config/constants');

        const penaltyAmount = payload.amount * BUSINESS_RULES.EMI_BOUNCE_PENALTY_RATE;

        await notificationsService.dispatch({
            template: 'EMI_BOUNCED',
            variables: {
                customerName: recipient.phone ?? 'Customer',
                emiAmount: payload.amount,
                bounceReason: payload.bounceReason,
                penaltyAmount,
                retryDate: payload.nextRetryAt
                    ? payload.nextRetryAt.toLocaleDateString('en-IN')
                    : null,
                accountNumber: (account?.account_number as string) ?? '',
            },
            channels: ['SMS', 'PUSH'],
            recipient,
            dedupeKey: `emi_bounced:${payload.emiId}`,
            dedupeTtl: 86400,
        });
    }, 'emi.bounced');
});

// ─── Agent events ─────────────────────────────────────────────────────────────

eventBus.on('agent.onboarded', 'notifications:agent.onboarded', (payload) => {
    safeDispatch(async () => {
        const recipient = await notificationsService.resolveRecipient(payload.userId);
        await notificationsService.dispatch({
            template: 'AGENT_ONBOARDED',
            variables: {
                agentName: payload.shopName,
                agentCode: '',   // Fetched in service — placeholder
            },
            channels: ['SMS'],
            recipient,
            dedupeKey: `agent_onboarded:${payload.agentId}`,
            dedupeTtl: 86400,
        });
    }, 'agent.onboarded');
});

eventBus.on('agent.status.changed', 'notifications:agent.status', (payload) => {
    safeDispatch(async () => {
        const recipient = await notificationsService.resolveRecipient(payload.agentId);
        const { AGENT_STATUS } = await import('@/config/constants');

        if (payload.currentStatus === AGENT_STATUS.ACTIVE) {
            await notificationsService.dispatch({
                template: 'AGENT_ACTIVATED',
                variables: {
                    agentName: '',
                    agentCode: '',
                },
                channels: ['SMS', 'PUSH'],
                recipient,
                dedupeKey: `agent_activated:${payload.agentId}`,
                dedupeTtl: 86400,
            });
        } else if (payload.currentStatus === AGENT_STATUS.SUSPENDED) {
            await notificationsService.dispatch({
                template: 'AGENT_SUSPENDED',
                variables: {
                    agentName: '',
                    reason: 'Account suspended by management',
                },
                channels: ['SMS'],
                recipient,
                dedupeKey: `agent_suspended:${payload.agentId}`,
                dedupeTtl: 86400,
            });
        }
    }, 'agent.status.changed');
});

eventBus.on('commission.earned', 'notifications:commission.earned', (payload) => {
    safeDispatch(async () => {
        const { agentsRepository } = await import('@/modules/agents');
        const agent = await agentsRepository.findById(payload.agentId);
        if (!agent) return;

        const recipient = await notificationsService.resolveRecipient(agent.userId);
        await notificationsService.dispatch({
            template: 'COMMISSION_EARNED',
            variables: {
                agentName: agent.fullName,
                commissionAmount: payload.amount,
                loanAccountId: payload.loanAccountId,
                earnedAt: payload.earnedAt.toLocaleDateString('en-IN'),
            },
            channels: ['PUSH'],
            recipient,
            dedupeKey: `commission_earned:${payload.commissionId}`,
            dedupeTtl: 86400,
        });
    }, 'commission.earned');
});

// ─── Collection events ────────────────────────────────────────────────────────

eventBus.on('collection.assigned', 'notifications:collection.assigned', (payload) => {
    safeDispatch(async () => {
        if (!payload.assignedAgentId) return;

        const { agentsRepository } = await import('@/modules/agents');
        const agent = await agentsRepository.findByUserId(payload.assignedAgentId);
        if (!agent) return;

        const recipient = await notificationsService.resolveRecipient(agent.userId);
        await notificationsService.dispatch({
            template: 'COLLECTION_ASSIGNED',
            variables: {
                agentName: agent.fullName,
                customerName: payload.userId, // Will be resolved to name in future
                overdueDays: payload.overdueDays,
                overdueAmount: payload.overdueAmount,
            },
            channels: ['PUSH', 'SMS'],
            recipient,
            dedupeKey: `collection_assigned:${payload.loanAccountId}`,
            dedupeTtl: 3600,
        });
    }, 'collection.assigned');
});

log.info('Notification event handlers registered');
