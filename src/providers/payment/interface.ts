// src/providers/payment/interface.ts

export interface CreateMandateInput {
    customerId: string;
    customerName: string;
    customerEmail: string;
    customerPhone: string;
    bankAccount: string;
    ifsc: string;
    maxAmount: number;
    loanAccountId: string;
}

export interface CreateMandateResult {
    mandateId: string;
    registrationLink: string;
    status: string;
    rawResponse: unknown;
}

export interface DebitInput {
    mandateId: string;
    amount: number;
    emiId: string;
    description: string;
}

export interface DebitResult {
    paymentId: string;
    status: 'SUCCESS' | 'FAILED' | 'PENDING';
    rawResponse: unknown;
}

export interface PayoutInput {
    accountNumber: string;
    ifsc: string;
    accountName: string;
    amount: number;
    purpose: string;
    referenceId: string;
}

export interface PayoutResult {
    payoutId: string;
    utrNumber: string | null;
    status: 'QUEUED' | 'PROCESSING' | 'DONE' | 'FAILED';
    rawResponse: unknown;
}

export interface PaymentLinkInput {
    customerId: string;
    customerName: string;
    customerPhone: string;
    amount: number;
    emiId: string;
    description: string;
    expiryMinutes: number;
}

export interface PaymentLinkResult {
    linkId: string;
    shortUrl: string;
    expiresAt: Date;
    rawResponse: unknown;
}

export interface IPaymentProvider {
    createMandate(input: CreateMandateInput): Promise<CreateMandateResult>;
    debitMandate(input: DebitInput): Promise<DebitResult>;
    createPayout(input: PayoutInput): Promise<PayoutResult>;
    createPaymentLink(input: PaymentLinkInput): Promise<PaymentLinkResult>;
    verifyWebhookSignature(
        rawBody: string,
        signature: string,
    ): boolean;
}