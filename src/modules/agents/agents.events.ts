// src/modules/agents/agents.events.ts
import { eventBus } from '@/events';
import { createModuleLogger } from '@/config/logger';
import type { AgentStatus } from '@/config/constants';
import type { Rupees } from '@/types/common.types';

const log = createModuleLogger('agents.events');

export const agentEvents = {

    onboarded(params: {
        agentId: string;
        userId: string;
        shopName: string;
        requestId: string;
    }): void {
        eventBus.emit('agent.onboarded', params);
        log.info('Agent onboarded', {
            agentId: params.agentId,
            shopName: params.shopName,
        });
    },

    statusChanged(params: {
        agentId: string;
        previousStatus: AgentStatus;
        currentStatus: AgentStatus;
        changedBy: string;
        requestId: string;
    }): void {
        eventBus.emit('agent.status.changed', params);
    },

    commissionEarned(params: {
        commissionId: string;
        agentId: string;
        loanAccountId: string;
        amount: Rupees;
        earnedAt: Date;
    }): void {
        eventBus.emit('commission.earned', params);
        log.info('Commission earned', {
            commissionId: params.commissionId,
            agentId: params.agentId,
            amount: params.amount,
        });
    },
};