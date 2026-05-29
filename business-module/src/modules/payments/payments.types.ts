// src/modules/payments/payments.types.ts
import type { Rupees } from '@/types/common.types';
import type { PaymentStatus, PaymentChannel } from '@/config/constants';

// ─── Core payment record ───────────────────────────────────────────────────────

export interface PaymentRecord {
    id: string;
    loanAccountId: string;
    userId: string;
    emiId: string | null;    // null for advance/partial payments

    paymentType: PaymentType;
    amount: Rupees;
    penaltyAmount: Rupees;           // Penalty included in this payment
    totalCollected: Rupees;           // amount + penaltyAmount

    channel: PaymentChannel;
    gateway: string;           // 'razorpay' | 'cash' | 'manual'
    gatewayTxnId: string | null;    // Razorpay payment / payout ID
    utrNumber: string | null;    // Bank UTR for NACH / NEFT / IMPS

    status: PaymentStatus;
    failureReason: string | null;
    failureCode: string | null;    // Razorpay error code

    // eNACH specific
    mandateId: string | null;
    debitAttemptNo: number;           // 1-based retry count

    initiatedAt: Date;
    settledAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export type PaymentType =
    | 'EMI'               // Regular monthly EMI
    | 'PENALTY'           // Standalone penalty payment
    | 'PART_PAYMENT'      // Partial payment (reduces principal)
    | 'FORECLOSURE'       // Full early closure payment
    | 'BOUNCE_CHARGE';    // Bank bounce charge recovery

// ─── eNACH mandate ────────────────────────────────────────────────────────────

export interface MandateRecord {
    id: string;
    loanAccountId: string;
    userId: string;
    razorpayMandateId: string;
    bankAccount: string;           // Masked: XXXXX1234
    ifsc: string;
    maxAmount: Rupees;
    status: MandateStatus;
    registeredAt: Date | null;
    cancelledAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export type MandateStatus =
    | 'CREATED'
    | 'PENDING_REGISTRATION'
    | 'ACTIVE'
    | 'PAUSED'
    | 'CANCELLED'
    | 'EXPIRED';

// ─── Inputs ───────────────────────────────────────────────────────────────────

export interface CreateMandateInput {
    loanAccountId: string;
    userId: string;
    customerName: string;
    customerEmail: string;
    customerPhone: string;
    bankAccount: string;
    ifsc: string;
}

export interface ProcessNachDebitInput {
    emiId: string;
    loanAccountId: string;
    mandateId: string;
    amount: Rupees;
    penaltyAmount: Rupees;
    description: string;
}

export interface ManualPaymentLinkInput {
    loanAccountId: string;
    userId: string;
    emiId: string;
    customerName: string;
    customerPhone: string;
    amount: Rupees;
    description: string;
    expiryMinutes: number;
}

export interface RecordCashPaymentInput {
    loanAccountId: string;
    userId: string;
    emiId: string;
    amount: Rupees;
    collectedBy: string;
    collectionId: string;
}

// ─── Webhook payloads ─────────────────────────────────────────────────────────

export interface RazorpayWebhookPayload {
    event: string;
    payload: {
        payment?: {
            entity: RazorpayPaymentEntity;
        };
        subscription?: {
            entity: Record<string, unknown>;
        };
    };
    created_at: number;
}

export interface RazorpayPaymentEntity {
    id: string;
    amount: number;           // In paise
    status: string;
    order_id: string | null;
    description: string | null;
    error_code: string | null;
    error_description: string | null;
    notes: Record<string, string>;
    acquirer_data?: { rrn?: string };
}

// ─── Response shapes ──────────────────────────────────────────────────────────

export interface PaymentResponse {
    id: string;
    loanAccountId: string;
    emiId: string | null;
    paymentType: PaymentType;
    amount: Rupees;
    penaltyAmount: Rupees;
    totalCollected: Rupees;
    channel: PaymentChannel;
    status: PaymentStatus;
    utrNumber: string | null;
    failureReason: string | null;
    initiatedAt: Date;
    settledAt: Date | null;
}

export interface MandateResponse {
    id: string;
    loanAccountId: string;
    razorpayMandateId: string;
    bankAccount: string;
    status: MandateStatus;
    maxAmount: Rupees;
    registeredAt: Date | null;
}

export interface PaymentLinkResponse {
    linkId: string;
    shortUrl: string;
    amount: Rupees;
    expiresAt: Date;
}

// ─── List filters ─────────────────────────────────────────────────────────────

export interface ListPaymentsInput {
    loanAccountId?: string;
    userId?: string;
    status?: PaymentStatus;
    channel?: PaymentChannel;
    page: number;
    limit: number;
}
