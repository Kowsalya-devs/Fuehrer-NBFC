// src/providers/payment/live.ts
import Razorpay from 'razorpay';
import crypto from 'crypto';
import { createModuleLogger } from '@/config/logger';
import { PAYMENT_ERRORS } from '@/errors';
import { vendorCall } from '../_base/provider.utils';
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

const log = createModuleLogger('payment:razorpay');

export class RazorpayProvider implements IPaymentProvider {
    private readonly rzp:            Razorpay;
    private readonly webhookSecret:  string;
    private readonly accountNumber:  string;

    constructor(keyId: string, keySecret: string, webhookSecret: string, accountNumber: string) {
        this.rzp           = new Razorpay({ key_id: keyId, key_secret: keySecret });
        this.webhookSecret = webhookSecret;
        this.accountNumber = accountNumber;
    }

    async createMandate(input: CreateMandateInput): Promise<CreateMandateResult> {
        return vendorCall({
            vendor: 'razorpay',
            fn: async () => {
                try {
                    // Cast to unknown first to bypass Razorpay SDK type mismatch for eNACH orders
                    const res = await this.rzp.orders.create({
                        amount:   Math.round(input.maxAmount * 100),
                        currency: 'INR',
                        method:   'emandate',
                        bank_account: {
                            beneficiary_name: input.customerName,
                            account_number:   input.bankAccount,
                            account_type:     'savings',
                            ifsc_code:        input.ifsc,
                        },
                        emandate: {
                            auth_type:          'netbanking',
                            max_payment_amount: Math.round(input.maxAmount * 100),
                        },
                        notes: { loanAccountId: input.loanAccountId },
                    } as unknown as Parameters<typeof this.rzp.orders.create>[0]);

                    return {
                        mandateId:        res.id,
                        registrationLink: (res as unknown as { short_url: string }).short_url ?? '',
                        status:           res.status,
                        rawResponse:      res,
                    };
                } catch (err) {
                    throw PAYMENT_ERRORS.mandateCreationFailed(err);
                }
            },
            retry: { maxAttempts: 2 },
        });
    }

    async debitMandate(input: DebitInput): Promise<DebitResult> {
        return vendorCall({
            vendor: 'razorpay',
            fn: async () => {
                try {
                    // Cast to unknown first to bypass Razorpay SDK type mismatch for recurring payments
                    const res = await this.rzp.payments.createRecurringPayment({
                        email:           'noreply@feuhrer.in',
                        contact:         '0000000000',
                        amount:          Math.round(input.amount * 100),
                        currency:        'INR',
                        order_id:        input.mandateId,
                        description:     input.description,
                        recurring:       1,
                        recurring_token: { max_payment_amount: Math.round(input.amount * 100) },
                    } as unknown as Parameters<typeof this.rzp.payments.createRecurringPayment>[0]);

                    const r = res as unknown as { id: string; status: string };
                    return {
                        paymentId: r.id,
                        status:    r.status === 'captured' ? 'SUCCESS'
                                 : r.status === 'failed'   ? 'FAILED'
                                 : 'PENDING',
                        rawResponse: res,
                    };
                } catch (err: any) {
                    const code = err?.error?.code ?? null;
                    throw PAYMENT_ERRORS.debitFailed(code, err?.error?.description);
                }
            },
            retry: { maxAttempts: 1 },
        });
    }

    async createPayout(input: PayoutInput): Promise<PayoutResult> {
        return vendorCall({
            vendor: 'razorpay',
            fn: async () => {
                try {
                    const res = await (this.rzp as unknown as {
                        payouts: {
                            create(data: unknown): Promise<{
                                id: string;
                                utr: string | null;
                                status: string;
                            }>;
                        };
                    }).payouts.create({
                        account_number: this.accountNumber,
                        fund_account: {
                            account_type: 'bank_account',
                            bank_account: {
                                name:           input.accountName,
                                ifsc:           input.ifsc,
                                account_number: input.accountNumber,
                            },
                            contact: { name: input.accountName, type: 'vendor' },
                        },
                        amount:                Math.round(input.amount * 100),
                        currency:              'INR',
                        mode:                  'IMPS',
                        purpose:               'payout',
                        queue_if_low_balance:  true,
                        reference_id:          input.referenceId,
                        narration:             input.purpose,
                    });

                    return {
                        payoutId:  res.id,
                        utrNumber: res.utr ?? null,
                        status:    res.status === 'processed'  ? 'DONE'
                                 : res.status === 'queued'     ? 'QUEUED'
                                 : res.status === 'processing' ? 'PROCESSING'
                                 : 'FAILED',
                        rawResponse: res,
                    };
                } catch (err) {
                    throw PAYMENT_ERRORS.payoutFailed(err);
                }
            },
            retry: { maxAttempts: 3, delayMs: 3000 },
        });
    }

    async createPaymentLink(input: PaymentLinkInput): Promise<PaymentLinkResult> {
        return vendorCall({
            vendor: 'razorpay',
            fn: async () => {
                try {
                    const expiresAt = new Date(Date.now() + input.expiryMinutes * 60 * 1000);
                    const res = await (this.rzp as unknown as {
                        paymentLink: {
                            create(data: unknown): Promise<{
                                id:        string;
                                short_url: string;
                            }>;
                        };
                    }).paymentLink.create({
                        amount:      Math.round(input.amount * 100),
                        currency:    'INR',
                        description: input.description,
                        customer:    { name: input.customerName, contact: input.customerPhone },
                        notify:      { sms: true, email: false },
                        expire_by:   Math.floor(expiresAt.getTime() / 1000),
                        notes:       { emiId: input.emiId },
                    });

                    return {
                        linkId:      res.id,
                        shortUrl:    res.short_url,
                        expiresAt,
                        rawResponse: res,
                    };
                } catch (err) {
                    throw PAYMENT_ERRORS.timeout();
                }
            },
            retry: { maxAttempts: 2 },
        });
    }

    verifyWebhookSignature(rawBody: string, signature: string): boolean {
        try {
            const expected = crypto
                .createHmac('sha256', this.webhookSecret)
                .update(rawBody)
                .digest('hex');
            return crypto.timingSafeEqual(
                Buffer.from(expected, 'hex'),
                Buffer.from(signature, 'hex'),
            );
        } catch {
            return false;
        }
    }
}
