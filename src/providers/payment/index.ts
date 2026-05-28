// src/providers/payment/index.ts
import { env } from '@/config/env';
import { getSecrets } from '@/config/secrets';
import { RazorpayProvider } from './live';
import { StubPaymentProvider } from './stub';
import type { IPaymentProvider } from './interface';

export type { IPaymentProvider } from './interface';
export type {
    CreateMandateInput, CreateMandateResult,
    DebitInput, DebitResult,
    PayoutInput, PayoutResult,
    PaymentLinkInput, PaymentLinkResult,
} from './interface';

let instance: IPaymentProvider | null = null;

export function getPaymentProvider(): IPaymentProvider {
    if (instance) return instance;
    if (env.payment.provider === 'razorpay') {
        const s = getSecrets();
        instance = new RazorpayProvider(
            s.razorpay.keyId,
            s.razorpay.keySecret,
            s.razorpay.webhookSecret,
            s.razorpay.accountNumber,
        );
    } else {
        instance = new StubPaymentProvider();
    }
    return instance;
}

export function _resetPaymentProvider(): void { instance = null; }
