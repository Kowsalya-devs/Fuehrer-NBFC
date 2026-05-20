// src/events/handlers/collection.handlers.ts
import { eventBus } from '../eventBus';
import { prisma } from '@/config/database';
import { createModuleLogger } from '@/config/logger';
import { AUDIT_ACTION } from '@/config/constants';

const log = createModuleLogger('collection.handlers');

// ─── collection.assigned ──────────────────────────────────────────────────────

eventBus.on('collection.assigned', 'audit:collection.assigned', async (payload) => {
    await prisma.audit_logs.create({
        data: {
            action: 'COLLECTION_ASSIGNED',
            entity_type: 'collection_case',
            entity_id: payload.loanAccountId,
            after_state: JSON.stringify({
                assignedAgentId: payload.assignedAgentId,
                overdueDays: payload.overdueDays,
                overdueAmount: payload.overdueAmount,
            }),
            created_at: new Date(),
        },
    });
});

// ─── collection.payment.logged ────────────────────────────────────────────────
// Field collection agent logs a cash/UPI payment that didn't go through eNACH.
// This updates the EMI status and triggers the same closure check.

eventBus.on(
    'collection.payment.logged',
    'emi:update-from-collection',
    async (payload) => {
        // Find the oldest unpaid EMI for this loan account
        const overdueEmi = await prisma.emi_schedule.findFirst({
            where: {
                loan_account_id: payload.loanAccountId,
                status: { in: ['OVERDUE', 'BOUNCED', 'PENDING'] },
            },
            orderBy: { due_date: 'asc' },
        });

        if (!overdueEmi) {
            log.warn('Collection payment logged but no overdue EMI found', {
                loanAccountId: payload.loanAccountId,
                collectionId: payload.collectionId,
            });
            return;
        }

        await prisma.emi_schedule.update({
            where: { id: overdueEmi.id },
            data: {
                status: 'PAID',
                paid_at: new Date(),
                penalty_amount: 0,
                collection_id: payload.collectionId,
            },
        });

        log.info('EMI updated from collection payment', {
            emiId: overdueEmi.id,
            collectionId: payload.collectionId,
            loanAccountId: payload.loanAccountId,
        });
    },
);

eventBus.on(
    'collection.payment.logged',
    'audit:collection.payment',
    async (payload) => {
        await prisma.audit_logs.create({
            data: {
                action: AUDIT_ACTION.PAYMENT_SUCCESS,
                entity_type: 'collection_case',
                entity_id: payload.collectionId,
                user_id: payload.loggedBy,
                request_id: payload.requestId,
                after_state: JSON.stringify({
                    amount: payload.amount,
                    channel: payload.channel,
                    loanAccountId: payload.loanAccountId,
                }),
                created_at: new Date(),
            },
        });
    },
);

eventBus.on(
    'collection.payment.logged',
    'collection:check-resolve',
    async (payload) => {
        // If no more overdue EMIs, close the collection case
        const overdueCount = await prisma.emi_schedule.count({
            where: {
                loan_account_id: payload.loanAccountId,
                status: { in: ['OVERDUE', 'BOUNCED'] },
            },
        });

        if (overdueCount > 0) return;

        await prisma.collection_cases.updateMany({
            where: {
                loan_account_id: payload.loanAccountId,
                status: 'OPEN',
            },
            data: {
                status: 'RESOLVED',
                closed_at: new Date(),
                close_reason: 'All overdue EMIs cleared via collection',
            },
        });

        log.info('Collection case auto-resolved', {
            loanAccountId: payload.loanAccountId,
        });
    },
);

log.info('Collection event handlers registered');