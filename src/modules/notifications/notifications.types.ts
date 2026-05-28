// src/modules/notifications/notifications.types.ts
import type { Rupees } from '@/types/common.types';

// ─── Notification channels ────────────────────────────────────────────────────

export type NotificationChannel = 'SMS' | 'EMAIL' | 'PUSH';

// ─── Delivery status ──────────────────────────────────────────────────────────

export type DeliveryStatus =
    | 'QUEUED'
    | 'SENT'
    | 'DELIVERED'
    | 'FAILED'
    | 'SUPPRESSED';   // Opted out / DND / already sent recently

// ─── Notification template keys ───────────────────────────────────────────────
// Every template has a unique key. New notification types require a new
// entry here and a corresponding template implementation.

export type TemplateKey =
    // Loan lifecycle
    | 'LOAN_CREATED'
    | 'LOAN_APPROVED'
    | 'LOAN_REJECTED'
    | 'LOAN_DISBURSED'
    | 'LOAN_CLOSED'
    | 'LOAN_NPA'

    // KYC
    | 'KYC_INITIATED'
    | 'KYC_COMPLETED'
    | 'KYC_REJECTED'
    | 'KYC_ESIGN_REQUESTED'

    // EMI
    | 'EMI_REMINDER_3_DAYS'
    | 'EMI_REMINDER_1_DAY'
    | 'EMI_DUE_TODAY'
    | 'EMI_OVERDUE'
    | 'EMI_PAID'
    | 'EMI_BOUNCED'

    // Payments
    | 'PAYMENT_RECEIVED'
    | 'PAYMENT_FAILED'
    | 'MANDATE_CREATED'
    | 'MANDATE_ACTIVATED'
    | 'PAYMENT_LINK_GENERATED'

    // Collections
    | 'COLLECTION_ASSIGNED'
    | 'PTP_REMINDER'
    | 'PTP_BROKEN'

    // Agent
    | 'AGENT_ONBOARDED'
    | 'AGENT_ACTIVATED'
    | 'AGENT_SUSPENDED'
    | 'COMMISSION_EARNED'
    | 'COMMISSION_PAID'

    // Welcome
    | 'WELCOME';

// ─── Template variables — typed per template ──────────────────────────────────
// Each template receives a strictly-typed variables object.
// This prevents missing variable bugs at compile time.

export type TemplateVariables = {
    LOAN_CREATED: {
        customerName: string;
        amount: Rupees;
        loanId: string;
    };
    LOAN_APPROVED: {
        customerName: string;
        approvedAmount: Rupees;
        monthlyEmi: Rupees;
        tenureMonths: number;
        interestRate: number;
    };
    LOAN_REJECTED: {
        customerName: string;
        reason: string;
    };
    LOAN_DISBURSED: {
        customerName: string;
        disbursedAmount: Rupees;
        accountNumber: string;
        utrNumber: string | null;
        firstEmiDate: string;
        monthlyEmi: Rupees;
    };
    LOAN_CLOSED: {
        customerName: string;
        accountNumber: string;
        closedAt: string;
    };
    LOAN_NPA: {
        customerName: string;
        accountNumber: string;
        overdueDays: number;
        totalDue: Rupees;
    };
    KYC_INITIATED: {
        customerName: string;
    };
    KYC_COMPLETED: {
        customerName: string;
    };
    KYC_REJECTED: {
        customerName: string;
        reason: string;
    };
    KYC_ESIGN_REQUESTED: {
        customerName: string;
        signingUrl: string;
        expiresAt: string;
    };
    EMI_REMINDER_3_DAYS: {
        customerName: string;
        emiAmount: Rupees;
        dueDate: string;
        accountNumber: string;
    };
    EMI_REMINDER_1_DAY: {
        customerName: string;
        emiAmount: Rupees;
        dueDate: string;
        accountNumber: string;
    };
    EMI_DUE_TODAY: {
        customerName: string;
        emiAmount: Rupees;
        accountNumber: string;
    };
    EMI_OVERDUE: {
        customerName: string;
        overdueDays: number;
        emiAmount: Rupees;
        penaltyAmount: Rupees;
        totalDue: Rupees;
        accountNumber: string;
    };
    EMI_PAID: {
        customerName: string;
        amount: Rupees;
        emiNumber: number;
        accountNumber: string;
        paidAt: string;
    };
    EMI_BOUNCED: {
        customerName: string;
        emiAmount: Rupees;
        bounceReason: string;
        penaltyAmount: Rupees;
        retryDate: string | null;
        accountNumber: string;
    };
    PAYMENT_RECEIVED: {
        customerName: string;
        amount: Rupees;
        utrNumber: string | null;
        accountNumber: string;
        paidAt: string;
    };
    PAYMENT_FAILED: {
        customerName: string;
        amount: Rupees;
        reason: string;
        paymentLink?: string;
    };
    MANDATE_CREATED: {
        customerName: string;
        registrationLink: string;
        bankAccount: string;
    };
    MANDATE_ACTIVATED: {
        customerName: string;
        bankAccount: string;
        accountNumber: string;
    };
    PAYMENT_LINK_GENERATED: {
        customerName: string;
        amount: Rupees;
        shortUrl: string;
        expiresAt: string;
    };
    COLLECTION_ASSIGNED: {
        agentName: string;
        customerName: string;
        overdueDays: number;
        overdueAmount: Rupees;
    };
    PTP_REMINDER: {
        customerName: string;
        ptpDate: string;
        ptpAmount: Rupees;
    };
    PTP_BROKEN: {
        customerName: string;
        overdueAmount: Rupees;
        accountNumber: string;
    };
    AGENT_ONBOARDED: {
        agentName: string;
        agentCode: string;
    };
    AGENT_ACTIVATED: {
        agentName: string;
        agentCode: string;
    };
    AGENT_SUSPENDED: {
        agentName: string;
        reason: string;
    };
    COMMISSION_EARNED: {
        agentName: string;
        commissionAmount: Rupees;
        loanAccountId: string;
        earnedAt: string;
    };
    COMMISSION_PAID: {
        agentName: string;
        totalAmount: Rupees;
        utrNumber: string | null;
        paidAt: string;
    };
    WELCOME: {
        customerName: string;
        phone: string;
    };
};

// ─── Rendered template ────────────────────────────────────────────────────────

export interface RenderedTemplate {
    smsBody?: string;    // Max 160 chars for single SMS, 306 for double
    emailSubject?: string;
    emailHtml?: string;
    emailText?: string;    // Plain-text fallback
    pushTitle?: string;
    pushBody?: string;
    pushData?: Record<string, string>;  // Extra data for deep-linking
}

// ─── Dispatch request ─────────────────────────────────────────────────────────

export interface NotificationDispatch<K extends TemplateKey> {
    template: K;
    variables: TemplateVariables[K];
    channels: NotificationChannel[];
    recipient: {
        userId?: string;
        phone?: string;
        email?: string;
        fcmToken?: string;
    };
    // Optional deduplication key — prevents sending the same notification twice
    // within a TTL window (e.g. EMI reminders should not send twice in 24h)
    dedupeKey?: string;
    dedupeTtl?: number;  // seconds
}

// ─── Delivery record ──────────────────────────────────────────────────────────

export interface NotificationDelivery {
    id: string;
    templateKey: TemplateKey;
    channel: NotificationChannel;
    recipient: string;   // phone | email | fcmToken
    status: DeliveryStatus;
    messageId: string | null;
    error: string | null;
    sentAt: Date | null;
    createdAt: Date;
}
