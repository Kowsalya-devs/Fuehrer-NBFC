// src/modules/emi/emi.types.ts
import type { EmiStatus } from '@/config/constants';
import type { Rupees, SortOrder } from '@/types/common.types';

// ─── Core EMI schedule entry ───────────────────────────────────────────────────

export interface EmiScheduleEntry {
    id: string;
    loanAccountId: string;

    emiNumber: number;     // 1-based sequence
    dueDate: Date;

    emiAmount: Rupees;     // Total payment due this month
    principalComponent: Rupees;     // Portion reducing the principal
    interestComponent: Rupees;     // Portion that is interest cost
    outstandingAfter: Rupees;     // Principal remaining after this EMI is paid

    status: EmiStatus;
    penaltyAmount: Rupees;     // Accumulated late payment penalty
    bounceCount: number;     // Number of eNACH bounces for this EMI
    lastBounceAt: Date | null;
    nextRetryAt: Date | null;
    collectionId: string | null;  // If paid via field collection

    paidAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

// ─── Amortization schedule — computed in memory, persisted atomically ──────────

export interface AmortizationSchedule {
    loanAccountId: string;
    principal: Rupees;
    annualRatePct: number;
    tenureMonths: number;
    disbursementDate: Date;
    firstEmiDate: Date;

    monthlyEmi: Rupees;
    totalPayable: Rupees;
    totalInterest: Rupees;
    totalPrincipal: Rupees;   // Should equal principal exactly

    entries: AmortizationEntry[];
}

export interface AmortizationEntry {
    emiNumber: number;
    dueDate: Date;
    emiAmount: Rupees;
    principalComponent: Rupees;
    interestComponent: Rupees;
    outstandingAfter: Rupees;
}

// ─── EMI summary — what the customer sees ────────────────────────────────────

export interface EmiScheduleSummary {
    loanAccountId: string;
    totalEmis: number;
    paidEmis: number;
    overdueEmis: number;
    pendingEmis: number;
    nextDueDate: Date | null;
    nextEmiAmount: Rupees | null;
    totalOutstanding: Rupees;
    totalPenalty: Rupees;
    lastPaidAt: Date | null;
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export interface ListEmiScheduleInput {
    loanAccountId: string;
    status?: EmiStatus;
    sortOrder?: SortOrder;
}

export interface OverdueEmiResult {
    emiId: string;
    loanAccountId: string;
    userId: string;
    emiNumber: number;
    dueDate: Date;
    overdueDays: number;
    emiAmount: Rupees;
    penaltyAmount: Rupees;
    bounceCount: number;
}

// ─── Manual payment inputs ────────────────────────────────────────────────────

export interface MarkEmiPaidInput {
    emiId: string;
    paidAmount: Rupees;
    paidAt: Date;
    channel: string;
    collectionId?: string;
}

export interface ApplyPenaltyInput {
    emiId: string;
    penaltyAmount: Rupees;
    reason: string;
}

export interface WaiveEmiInput {
    emiId: string;
    waivedBy: string;
    reason: string;
}

// ─── Cron job types ───────────────────────────────────────────────────────────

export interface EmiReminderTarget {
    userId: string;
    loanAccountId: string;
    emiId: string;
    emiNumber: number;
    dueDate: Date;
    emiAmount: Rupees;
    daysUntilDue: number;
}

export interface NachDebitTarget {
    emiId: string;
    loanAccountId: string;
    userId: string;
    mandateId: string;
    emiNumber: number;
    emiAmount: Rupees;
    penaltyAmount: Rupees;
    totalDebit: Rupees;
    dueDate: Date;
}
