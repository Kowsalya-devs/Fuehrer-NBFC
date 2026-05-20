// src/modules/disbursement/disbursement.events.ts
import { eventBus } from '@/events';
import { createModuleLogger } from '@/config/logger';
import type { Rupees } from '@/types/common.types';

const log = createModuleLogger('disbursement.events');

export const disbursementEvents = {

    initiated(params: {
        disbursementId: string;
        loanId: string;
        userId: string;
        agentId: string | null;
        amount: Rupees;
        mode: string;
        requestId: string;
    }): void {
        log.info('Disbursement initiated', {
            disbursementId: params.disbursementId,
            loanId: params.loanId,
            amount: params.amount,
            mode: params.mode,
        });
        // Emit to event bus so notification handlers can alert customer
        eventBus.emit('loan.disbursed', {
            loanId: params.loanId,
            loanAccountId: params.disbursementId,  // Placeholder until account created
            userId: params.userId,
            agentId: params.agentId,
            disbursedAmount: params.amount,
            disbursedAt: new Date(),
            utrNumber: null,
            requestId: params.requestId,
        });
    },

    completed(params: {
        disbursementId: string;
        loanId: string;
        loanAccountId: string;
        userId: string;
        agentId: string | null;
        amount: Rupees;
        utrNumber: string;
        requestId: string;
    }): void {
        log.info('Disbursement confirmed complete', {
            disbursementId: params.disbursementId,
            loanAccountId: params.loanAccountId,
            utrNumber: params.utrNumber,
            amount: params.amount,
        });

        // Re-emit with loanAccountId now known — downstream handlers use this
        eventBus.emit('loan.disbursed', {
            loanId: params.loanId,
            loanAccountId: params.loanAccountId,
            userId: params.userId,
            agentId: params.agentId,
            disbursedAmount: params.amount,
            disbursedAt: new Date(),
            utrNumber: params.utrNumber,
            requestId: params.requestId,
        });
    },

    failed(params: {
        disbursementId: string;
        loanId: string;
        userId: string;
        reason: string;
        requestId: string;
    }): void {
        log.error('Disbursement failed', {
            disbursementId: params.disbursementId,
            loanId: params.loanId,
            reason: params.reason,
        });
    },
};