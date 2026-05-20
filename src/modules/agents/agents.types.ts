// src/modules/agents/agents.types.ts
import type { AgentStatus, CommissionStatus } from '@/config/constants';
import type { Rupees, SortOrder } from '@/types/common.types';

// ─── Core agent profile ────────────────────────────────────────────────────────

export interface AgentProfile {
    id: string;
    userId: string;         // FK to users table — agent is also a user

    agentCode: string;         // Human-readable: AGT-2026-000001
    fullName: string;
    phone: string;
    email: string | null;

    shopName: string;
    shopAddress: string;
    shopCity: string;
    shopPincode: string;

    // Banking details for commission payout
    bankAccountNo: string;         // Stored masked after onboarding
    bankIfsc: string;
    bankAccountName: string;

    status: AgentStatus;
    commissionRate: number;         // Decimal e.g. 0.015 = 1.5%

    // KYC — agents go through their own KYC
    panNumber: string | null;  // Masked: ABCDE****F
    aadhaarLast4: string | null;

    suspensionReason: string | null;
    onboardedAt: Date;
    createdAt: Date;
    updatedAt: Date;
}

// ─── Commission record ─────────────────────────────────────────────────────────

export interface AgentCommission {
    id: string;
    agentId: string;
    loanAccountId: string;
    userId: string;    // The customer's userId

    commissionAmount: Rupees;
    status: CommissionStatus;

    clawbackEligibleUntil: Date;
    clawbackReason: string | null;
    clawedBackAt: Date | null;

    payoutId: string | null;   // batch payout reference
    earnedAt: Date;
    paidAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

// ─── Commission payout batch ───────────────────────────────────────────────────

export interface CommissionPayout {
    id: string;
    agentId: string;
    totalAmount: Rupees;
    commissionIds: string[];         // Which commissions are included
    utrNumber: string | null;
    status: 'PENDING' | 'PROCESSED' | 'FAILED';
    processedAt: Date | null;
    createdAt: Date;
}

// ─── Agent dashboard summary ───────────────────────────────────────────────────

export interface AgentDashboard {
    agentId: string;
    agentCode: string;
    fullName: string;
    status: AgentStatus;
    commissionRate: number;

    // Pipeline metrics
    totalLoansSubmitted: number;
    activeLoans: number;
    rejectedLoans: number;
    totalDisbursed: Rupees;

    // Commission metrics
    totalEarned: Rupees;
    pendingCommission: Rupees;
    paidCommission: Rupees;
    clawedBackAmount: Rupees;
    nextPayoutEstimate: Rupees;

    // Recent activity
    recentLoans: AgentLoanSummary[];
}

export interface AgentLoanSummary {
    loanId: string;
    customerName: string;
    amount: Rupees;
    status: string;
    appliedAt: Date;
    commission: Rupees | null;
}

// ─── Inputs ───────────────────────────────────────────────────────────────────

export interface OnboardAgentInput {
    userId: string;
    fullName: string;
    phone: string;
    email?: string;
    shopName: string;
    shopAddress: string;
    shopCity: string;
    shopPincode: string;
    bankAccountNo: string;
    bankIfsc: string;
    bankAccountName: string;
    panNumber: string;
    aadhaarLast4: string;
    commissionRate?: number;   // Optional override; defaults to BUSINESS_RULES
}

export interface UpdateAgentInput {
    shopName?: string;
    shopAddress?: string;
    shopCity?: string;
    shopPincode?: string;
    email?: string;
    bankAccountNo?: string;
    bankIfsc?: string;
    bankAccountName?: string;
}

export interface SuspendAgentInput {
    agentId: string;
    suspendedBy: string;
    reason: string;
}

export interface ListAgentsInput {
    status?: AgentStatus;
    shopCity?: string;
    search?: string;   // matches name, agentCode, phone
    page: number;
    limit: number;
    sortBy?: 'onboardedAt' | 'fullName' | 'totalDisbursed';
    sortOrder?: SortOrder;
}

export interface ListCommissionsInput {
    agentId?: string;
    status?: CommissionStatus;
    fromDate?: Date;
    toDate?: Date;
    page: number;
    limit: number;
}

export interface ProcessPayoutInput {
    agentId: string;
    processedBy: string;
}

// ─── Response shapes ──────────────────────────────────────────────────────────

export interface AgentProfileResponse {
    id: string;
    agentCode: string;
    fullName: string;
    phone: string;
    email: string | null;
    shopName: string;
    shopCity: string;
    status: AgentStatus;
    commissionRate: number;
    panNumber: string | null;
    onboardedAt: Date;
}

export interface CommissionResponse {
    id: string;
    loanAccountId: string;
    commissionAmount: Rupees;
    status: CommissionStatus;
    earnedAt: Date;
    paidAt: Date | null;
    clawbackReason: string | null;
    clawedBackAt: Date | null;
}