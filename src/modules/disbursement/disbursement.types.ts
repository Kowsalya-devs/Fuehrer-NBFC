// src/modules/disbursement/disbursement.types.ts
import type { Rupees } from '@/types/common.types';
import type { DisbursementMode } from '@/config/constants';

// ─── Disbursement status ───────────────────────────────────────────────────────

export type DisbursementStatus =
    | 'PENDING'       // Created, waiting for payout execution
    | 'INITIATED'     // Payout call made to Razorpay
    | 'IN_TRANSIT'    // Razorpay confirmed queued / processing
    | 'COMPLETED'     // UTR received — money delivered
    | 'FAILED'        // Payout failed — can retry
    | 'REVERSED';     // Payout reversed after completion (rare)

// ─── Core disbursement record ──────────────────────────────────────────────────

export interface DisbursementRecord {
    id: string;
    loanId: string;       // loan_applications.id
    loanAccountId: string | null;// loan_accounts.id — set after account created
    userId: string;

    // Payout destination
    beneficiaryName: string;
    accountNumber: string;
    ifsc: string;
    mode: DisbursementMode;

    // Amounts
    principalAmount: Rupees;
    processingFee: Rupees;
    processingFeeGst: Rupees;
    netDisbursedAmount: Rupees;       // principal − processingFee − processingFeeGst

    // Razorpay payout details
    razorpayPayoutId: string | null;
    utrNumber: string | null;

    status: DisbursementStatus;
    failureReason: string | null;

    // Audit
    initiatedBy: string;       // userId of finance staff
    initiatedAt: Date;
    completedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

// ─── Inputs ───────────────────────────────────────────────────────────────────

export interface InitiateDisbursementInput {
    loanId: string;
    initiatedBy: string;
    // Bank account to disburse to (merchant / store owner)
    // These come from the loan application store details
    beneficiaryName: string;
    accountNumber: string;
    ifsc: string;
    mode: DisbursementMode;
}

export interface RetryDisbursementInput {
    disbursementId: string;
    retriedBy: string;
}

export interface DisbursementWebhookInput {
    razorpayPayoutId: string;
    status: string;
    utrNumber: string | null;
    failureReason: string | null;
}

// ─── Pre-disbursement checklist ────────────────────────────────────────────────
// Every gate that must pass before money moves

export interface DisbursementChecklist {
    loanApproved: boolean;
    kycComplete: boolean;
    eSignComplete: boolean;
    underwritingPassed: boolean;
    noDuplicatePayout: boolean;
    bankAccountVerified: boolean;
}

export interface ChecklistResult {
    passed: boolean;
    checklist: DisbursementChecklist;
    failures: string[];
}

// ─── Response shapes ──────────────────────────────────────────────────────────

export interface DisbursementResponse {
    id: string;
    loanId: string;
    loanAccountId: string | null;
    status: DisbursementStatus;
    principalAmount: Rupees;
    processingFee: Rupees;
    netDisbursedAmount: Rupees;
    mode: DisbursementMode;
    utrNumber: string | null;
    failureReason: string | null;
    initiatedAt: Date;
    completedAt: Date | null;
}

export interface DisbursementChecklistResponse {
    loanId: string;
    checklist: DisbursementChecklist;
    passed: boolean;
    failures: string[];
}