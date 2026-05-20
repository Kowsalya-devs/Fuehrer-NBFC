// src/modules/collections/collections.events.ts
import { eventBus } from '@/events';
import { createModuleLogger } from '@/config/logger';
import type { Rupees } from '@/types/common.types';

const log = createModuleLogger('collections.events');

export const collectionEvents = {

    caseOpened(params: {
        caseId: string;
        loanAccountId: string;
        userId: string;
        assignedTo: string | null;
        overdueDays: number;
        overdueAmount: Rupees;
    }): void {
        eventBus.emit('collection.assigned', {
            loanAccountId: params.loanAccountId,
            userId: params.userId,
            assignedAgentId: params.assignedTo ?? '',
            overdueDays: params.overdueDays,
            overdueAmount: params.overdueAmount,
        });

        log.info('Collection case opened', {
            caseId: params.caseId,
            loanAccountId: params.loanAccountId,
            overdueDays: params.overdueDays,
            assignedTo: params.assignedTo,
        });
    },

    paymentLogged(params: {
        caseId: string;
        loanAccountId: string;
        userId: string;
        amount: Rupees;
        channel: string;
        loggedBy: string;
        requestId: string;
    }): void {
        eventBus.emit('collection.payment.logged', {
            loanAccountId: params.loanAccountId,
            collectionId: params.caseId,
            amount: params.amount,
            channel: params.channel,
            loggedBy: params.loggedBy,
            requestId: params.requestId,
        });
    },

    caseEscalated(params: {
        caseId: string;
        level: number;
        reason: string;
        escalatedBy: string;
    }): void {
        log.warn('Collection case escalated', params);
    },

    caseClosed(params: {
        caseId: string;
        reason: string;
        status: string;
    }): void {
        log.info('Collection case closed', params);
    },
};