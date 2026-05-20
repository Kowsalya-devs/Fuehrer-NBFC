// src/modules/payments/payments.events.ts
import { eventBus } from '@/events';
import { createModuleLogger } from '@/config/logger';
import type { Rupees } from '@/types/common.types';

const log = createModuleLogger('payments.events');

export const paymentEvents = {

    received(params: {
        paymentId: string;
        loanAccountId: string;
        userId: string;
        emiId: string;
        emiNumber: number;
        amount: Rupees;
        channel: string;
        gatewayTxnId: string;
        paidAt: Date;
        requestId: string;
    }): void {
        eventBus.emit('payment.received', params);
    },

    failed(params: {
        paymentId: string;
        loanAccountId: string;
        userId: string;
        emiId: string;
        emiNumber: number;
        amount: Rupees;
        reason: string;
        gatewayCode: string | null;
        requestId: string;
    }): void {
        eventBus.emit('payment.failed', params);
        log.warn('Payment failed', {
            paymentId: params.paymentId,
            loanAccountId: params.loanAccountId,
            reason: params.reason,
        });
    },

    mandateCreated(params: {
        loanAccountId: string;
        userId: string;
        mandateId: string;
        bankAccount: string;
        requestId: string;
    }): void {
        eventBus.emit('mandate.created', params);
    },
};