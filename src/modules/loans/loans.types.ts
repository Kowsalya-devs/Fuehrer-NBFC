// src/modules/loans/loans.types.ts
import type { LoanStatus, ProductType, DisbursementMode } from '@/config/constants';
import type { Rupees, PaginationParams, SortOrder } from '@/types/common.types';

// ─── Core loan application model ───────────────────────────────────────────────

export interface LoanApplication {
    id: string;
    userId: string;
    agentId: string | null;
    status: LoanStatus;

    // Request details
    amountRequested: Rupees;
    tenureMonths: number;
    productType: ProductType;
    purpose: string;
    storeName: string;
    storeCity: string;

    // Approval details — populated by credit manager
    approvedAmount: Rupees | null;
    interestRate: number | null;   // Annual % e.g. 18.00
    processingFee: Rupees | null;
    processingFeeGst: Rupees | null;

    // Decision details
    rejectionReason: string | null;
    reviewedBy: string | null;
    reviewedAt: Date | null;

    // Timestamps
    appliedAt: Date;
    updatedAt: Date;
}

// ─── Active loan account — created on disbursement ────────────────────────────

export interface LoanAccount {
    id: string;
    applicationId: string;
    userId: string;
    accountNumber: string;   // Human-readable: FHR-2026-000001

    principalAmount: Rupees;
    interestRate: number;
    tenureMonths: number;
    monthlyEmi: Rupees;
    outstandingBalance: Rupees;
    totalInterest: Rupees;

    status: LoanStatus;
    repaymentMode: DisbursementMode;
    razorpayMandateId: string | null;

    disbursedAt: Date | null;
    closedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

// ─── Input / output DTOs ───────────────────────────────────────────────────────

export interface CreateLoanApplicationInput {
    userId: string;
    agentId: string | null;
    amount: Rupees;
    tenureMonths: number;
    productType: ProductType;
    purpose: string;
    storeName: string;
    storeCity: string;
}

export interface SubmitLoanApplicationInput {
    loanId: string;
    userId: string;
}

export interface ApproveLoanInput {
    loanId: string;
    approvedBy: string;
    approvedAmount: Rupees;
    interestRate: number;
    processingFee: Rupees;
}

export interface RejectLoanInput {
    loanId: string;
    rejectedBy: string;
    reason: string;
}

export interface ListLoansInput extends PaginationParams {
    userId?: string;
    agentId?: string;
    status?: LoanStatus;
    productType?: ProductType;
    sortBy?: 'appliedAt' | 'amount' | 'updatedAt';
    sortOrder?: SortOrder;
    fromDate?: Date;
    toDate?: Date;
}

// ─── Safe public response shapes ──────────────────────────────────────────────
// What we expose through the API — no internal DB ids beyond what's necessary

export interface LoanApplicationResponse {
    id: string;
    status: LoanStatus;
    amountRequested: Rupees;
    approvedAmount: Rupees | null;
    tenureMonths: number;
    interestRate: number | null;
    monthlyEmi: Rupees | null;
    processingFee: Rupees | null;
    productType: ProductType;
    purpose: string;
    storeName: string;
    storeCity: string;
    rejectionReason: string | null;
    appliedAt: Date;
    updatedAt: Date;
    reviewedAt: Date | null;
}

export interface LoanAccountResponse {
    id: string;
    accountNumber: string;
    principalAmount: Rupees;
    interestRate: number;
    tenureMonths: number;
    monthlyEmi: Rupees;
    outstandingBalance: Rupees;
    totalInterest: Rupees;
    status: LoanStatus;
    disbursedAt: Date | null;
    closedAt: Date | null;
}

// ─── EMI preview — shown to customer before applying ──────────────────────────

export interface EmiPreviewInput {
    amount: Rupees;
    tenureMonths: number;
    interestRate: number;
}

export interface EmiPreviewResult {
    monthlyEmi: Rupees;
    totalAmount: Rupees;
    totalInterest: Rupees;
    processingFee: Rupees;
    effectiveRate: number;   // APR
}

// ─── Status transition metadata ────────────────────────────────────────────────

export interface StatusTransitionResult {
    loanId: string;
    previousStatus: LoanStatus;
    currentStatus: LoanStatus;
    transitionedAt: Date;
}
