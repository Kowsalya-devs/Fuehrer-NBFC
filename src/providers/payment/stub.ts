// src/providers/payment/stub.ts
import { randomUUID } from 'crypto';
import { createModuleLogger } from '@/config/logger';
import type {
    IPaymentProvider,
    CreateMandateInput,
    CreateMandateResult,
    DebitInput,
    DebitResult,
    PayoutInput,
    PayoutResult,
    PaymentLinkInput,
    PaymentLinkResult,
} from './interface';

const log = createModuleLogger('payment:stub');

export class StubPaymentProvider implements IPaymentProvider {

    async createMandate(input: CreateMandateInput): Promise<CreateMandateResult> {
        log.debug('STUB: createMandate', { loanAccountId: input.loanAccountId });
        await delay(80);
        return {
            mandateId: `stub_mandate_${randomUUID().slice(0, 8)}`,
            registrationLink: 'https://stub.razorpay.com/mandate/register',
            status: 'created',
            rawResponse: { stub: true },
        };
    }

    async debitMandate(input: DebitInput): Promise<DebitResult> {
        log.debug('STUB: debitMandate', { emiId: input.emiId, amount: input.amount });
        await delay(100);
        return {
            paymentId: `stub_pay_${randomUUID().slice(0, 8)}`,
            status: 'SUCCESS',
            rawResponse: { stub: true },
        };
    }

    async createPayout(input: PayoutInput): Promise<PayoutResult> {
        log.debug('STUB: createPayout', { referenceId: input.referenceId });
        await delay(150);
        return {
            payoutId: `stub_pout_${randomUUID().slice(0, 8)}`,
            utrNumber: `STUB${Date.now()}`,
            status: 'DONE',
            rawResponse: { stub: true },
        };
    }

    async createPaymentLink(input: PaymentLinkInput): Promise<PaymentLinkResult> {
        log.debug('STUB: createPaymentLink', { emiId: input.emiId });
        await delay(60);
        const expiresAt = new Date(Date.now() + input.expiryMinutes * 60 * 1000);
        return {
            linkId: `stub_link_${randomUUID().slice(0, 8)}`,
            shortUrl: `https://stub.rzp.io/${randomUUID().slice(0, 6)}`,
            expiresAt,
            rawResponse: { stub: true },
        };
    }

    verifyWebhookSignature(_rawBody: string, _signature: string): boolean {
        // Stub always passes signature verification
        return true;
    }
}

function delay(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
}
