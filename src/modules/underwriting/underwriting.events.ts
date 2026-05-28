// src/modules/underwriting/underwriting.events.ts
import { eventBus } from '@/events';
import { createModuleLogger } from '@/config/logger';
import type { UnderwritingDecision } from './underwriting.types';

const log = createModuleLogger('underwriting.events');

export const underwritingEvents = {

    completed(params: {
        loanId: string;
        userId: string;
        reportId: string;
        decision: UnderwritingDecision;
        internalScore: number;
        creditScore: number | null;
        requestId: string;
    }): void {
        // No dedicated underwriting event on the bus yet —
        // we emit a loan status change event to progress the state machine
        log.info('Underwriting completed', {
            loanId: params.loanId,
            reportId: params.reportId,
            decision: params.decision,
            score: params.internalScore,
            requestId: params.requestId,
        });
    },

    autoRejected(params: {
        loanId: string;
        userId: string;
        hardFailRules: string[];
        rejectionReasons: string[];
        requestId: string;
    }): void {
        log.warn('Underwriting auto-rejection', {
            loanId: params.loanId,
            hardFailRules: params.hardFailRules,
            reasons: params.rejectionReasons,
            requestId: params.requestId,
        });
    },
};
