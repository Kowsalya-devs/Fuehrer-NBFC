// src/events/handlers/loan.handlers.ts
import { eventBus } from '../eventBus';
import { prisma } from '@/config/database';
import { createModuleLogger } from '@/config/logger';
import {
    AUDIT_ACTION,
    COMMISSION_STATUS,
    LOAN_STATUS,
    BUSINESS_RULES,
} from '@/config/constants';
import { toNumber, roundRupees } from '@/types/common.types';

const log = createModuleLogger('loan.handlers');

eventBus.on('loan.created', 'audit:loan.created', async (payload) => {
    await prisma.audit_logs.create({
        data: {
            action: AUDIT_ACTION.LOAN_CREATED,
            entity_type: 'loan_application',
            entity_id: payload.loanId,
            user_id: payload.userId,
            request_id: payload.requestId ?? `event:loan.created:${payload.loanId}`,
            after_state: JSON.stringify({
                loanId: payload.loanId,
                amount: payload.amount,
                tenureMonths: payload.tenureMonths,
                productType: payload.productType,
                agentId: payload.agentId,
            }),
            created_at: new Date(),
        },
    });
});

eventBus.on('loan.approved', 'audit:loan.approved', async (payload) => {
    await prisma.audit_logs.create({
        data: {
            action: AUDIT_ACTION.LOAN_APPROVED,
            entity_type: 'loan_application',
            entity_id: payload.loanId,
            user_id: payload.approvedBy,
            request_id: payload.requestId ?? `event:loan.approved:${payload.loanId}`,
            after_state: JSON.stringify({
                approvedAmount: payload.approvedAmount,
                interestRate: payload.interestRate,
                tenureMonths: payload.tenureMonths,
                monthlyEmi: payload.monthlyEmi,
            }),
            created_at: new Date(),
        },
    });
});

eventBus.on('loan.rejected', 'audit:loan.rejected', async (payload) => {
    await prisma.audit_logs.create({
        data: {
            action: AUDIT_ACTION.LOAN_REJECTED,
            entity_type: 'loan_application',
            entity_id: payload.loanId,
            user_id: payload.rejectedBy,
            request_id: payload.requestId ?? `event:loan.rejected:${payload.loanId}`,
            after_state: JSON.stringify({ reason: payload.reason }),
            created_at: new Date(),
        },
    });
});

eventBus.on('loan.disbursed', 'audit:loan.disbursed', async (payload) => {
    await prisma.audit_logs.create({
        data: {
            action: AUDIT_ACTION.LOAN_DISBURSED,
            entity_type: 'loan_account',
            entity_id: payload.loanAccountId,
            user_id: payload.userId,
            request_id: payload.requestId ?? `event:loan.disbursed:${payload.loanAccountId}`,
            after_state: JSON.stringify({
                disbursedAmount: payload.disbursedAmount,
                disbursedAt: payload.disbursedAt,
                utrNumber: payload.utrNumber,
            }),
            created_at: new Date(),
        },
    });
});

eventBus.on('loan.disbursed', 'commission:calculate', async (payload) => {
    if (!payload.agentId) return;

    try {
        const commissionAmount = roundRupees(
            payload.disbursedAmount * BUSINESS_RULES.AGENT_COMMISSION_RATE,
        );

        // Fetch user_id from loan account — required field on agent_commissions
        const loanAccount = await prisma.loan_accounts.findUnique({
            where: { id: payload.loanAccountId },
            select: { user_id: true },
        });
        if (!loanAccount) return;

        await prisma.agent_commissions.create({
            data: {
                agent_id: payload.agentId,
                loan_account_id: payload.loanAccountId,
                user_id: loanAccount.user_id,          // ← added
                commission_amount: commissionAmount,
                status: COMMISSION_STATUS.EARNED,
                earned_at: new Date(),
                clawback_eligible_until: new Date(
                    Date.now() +
                    BUSINESS_RULES.COMMISSION_CLAWBACK_DAYS * 24 * 60 * 60 * 1000,
                ),
            },
        });

        log.info('Agent commission created', {
            agentId: payload.agentId,
            loanAccountId: payload.loanAccountId,
            commissionAmount,
        });

        eventBus.emit('commission.earned', {
            commissionId: '',
            agentId: payload.agentId,
            loanAccountId: payload.loanAccountId,
            amount: commissionAmount,
            earnedAt: new Date(),
        });

    } catch (err) {
        log.error('Failed to create agent commission', {
            agentId: payload.agentId,
            loanAccountId: payload.loanAccountId,
            error: (err as Error).message,
        });
    }
});

eventBus.on('loan.npa', 'audit:loan.npa', async (payload) => {
    await prisma.audit_logs.create({
        data: {
            action: AUDIT_ACTION.LOAN_NPA,
            entity_type: 'loan_account',
            entity_id: payload.loanAccountId,
            user_id: payload.userId,
            request_id: payload.requestId ?? `event:loan.npa:${payload.loanAccountId}`,
            after_state: JSON.stringify({
                overdueDays: payload.overdueDays,
                overdueAmount: payload.overdueAmount,
                markedAt: payload.markedAt,
            }),
            created_at: new Date(),
        },
    });
});

eventBus.on('loan.npa', 'commission:clawback', async (payload) => {
    const commissions = await prisma.agent_commissions.findMany({
        where: {
            loan_account_id: payload.loanAccountId,
            status: COMMISSION_STATUS.EARNED,
            clawback_eligible_until: { gte: new Date() },
        },
    });

    if (commissions.length === 0) return;

    await prisma.agent_commissions.updateMany({
        where: {
            loan_account_id: payload.loanAccountId,
            status: COMMISSION_STATUS.EARNED,
        },
        data: {
            status: COMMISSION_STATUS.CLAWED_BACK,
            clawback_reason: `Loan marked NPA after ${payload.overdueDays} days overdue`,
            clawed_back_at: new Date(),
        },
    });

    const totalClawed = commissions.reduce(
        (sum, c) => sum + toNumber(c.commission_amount),
        0,
    );

    log.warn('Commission clawback applied', {
        loanAccountId: payload.loanAccountId,
        count: commissions.length,
        totalAmount: totalClawed,
    });
});

eventBus.on('loan.npa', 'collections:auto-assign', async (payload) => {
    const existing = await prisma.collection_cases.findFirst({
        where: { loan_account_id: payload.loanAccountId, status: 'OPEN' },
    });

    if (existing) return;

    const agent = await prisma.admin_users.findFirst({
        where: { role: 'COLLECTION_AGENT', status: 'ACTIVE' },
        orderBy: { collection_cases: { _count: 'asc' } },
    });

    await prisma.collection_cases.create({
        data: {
            loan_account_id: payload.loanAccountId,
            user_id: payload.userId,
            assigned_to: agent?.id ?? null,
            overdue_days: payload.overdueDays,
            overdue_amount: payload.overdueAmount,
            total_due: payload.overdueAmount,
            status: 'OPEN',
            opened_at: new Date(),
        },
    });

    if (agent) {
        eventBus.emit('collection.assigned', {
            loanAccountId: payload.loanAccountId,
            userId: payload.userId,
            assignedAgentId: agent.id,
            overdueDays: payload.overdueDays,
            overdueAmount: payload.overdueAmount,
        });
    }

    log.info('Collection case created for NPA loan', {
        loanAccountId: payload.loanAccountId,
        assignedTo: agent?.id ?? 'unassigned',
    });
});

eventBus.on('loan.closed', 'audit:loan.closed', async (payload) => {
    await prisma.audit_logs.create({
        data: {
            action: AUDIT_ACTION.LOAN_CLOSED,
            entity_type: 'loan_account',
            entity_id: payload.loanAccountId,
            user_id: payload.userId,
            request_id: payload.requestId ?? `event:loan.closed:${payload.loanAccountId}`,
            after_state: JSON.stringify({ closedAt: payload.closedAt }),
            created_at: new Date(),
        },
    });
});

eventBus.on('loan.closed', 'collections:close-case', async (payload) => {
    await prisma.collection_cases.updateMany({
        where: { loan_account_id: payload.loanAccountId, status: 'OPEN' },
        data: {
            status: 'CLOSED',
            closed_at: new Date(),
            close_reason: 'Loan fully repaid',
        },
    });
});

log.info('Loan event handlers registered');
