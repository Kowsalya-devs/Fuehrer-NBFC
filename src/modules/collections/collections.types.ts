// src/modules/collections/collections.types.ts
import type { Rupees, SortOrder } from '@/types/common.types';

// ─── DPD buckets (Days Past Due) ──────────────────────────────────────────────
// Standard RBI classification for overdue accounts

export type DpdBucket =
    | 'CURRENT'       // 0 DPD — not overdue
    | 'BUCKET_1'      // 1–30 DPD — early delinquency
    | 'BUCKET_2'      // 31–60 DPD — moderate
    | 'BUCKET_3'      // 61–90 DPD — severe
    | 'NPA'           // 90+ DPD — non-performing asset
    | 'WRITTEN_OFF';  // 180+ DPD — written off

export function classifyDpd(overdueDays: number): DpdBucket {
    if (overdueDays <= 0) return 'CURRENT';
    if (overdueDays <= 30) return 'BUCKET_1';
    if (overdueDays <= 60) return 'BUCKET_2';
    if (overdueDays <= 90) return 'BUCKET_3';
    if (overdueDays <= 180) return 'NPA';
    return 'WRITTEN_OFF';
}

// ─── Collection case status ────────────────────────────────────────────────────

export type CollectionCaseStatus =
    | 'OPEN'          // Active — being worked
    | 'RESOLVED'      // All overdue EMIs cleared
    | 'CLOSED'        // Manually closed (loan closed / written off)
    | 'ESCALATED';    // Moved to legal / senior team

// ─── Contact attempt outcome ───────────────────────────────────────────────────

export type ContactOutcome =
    | 'CONNECTED_PTP'         // Customer gave Promise-To-Pay date
    | 'CONNECTED_REFUSED'     // Customer refused to pay
    | 'CONNECTED_DISPUTE'     // Customer disputes the amount
    | 'CONNECTED_PARTIAL'     // Partial payment arranged
    | 'NOT_REACHABLE'         // Phone not answered / switched off
    | 'WRONG_NUMBER'          // Number is wrong
    | 'FIELD_VISIT_DONE'      // Physical visit completed
    | 'FIELD_VISIT_NOT_HOME'  // Visited but customer not home
    | 'PAYMENT_RECEIVED';     // Payment collected during contact

// ─── Core collection case ─────────────────────────────────────────────────────

export interface CollectionCase {
    id: string;
    loanAccountId: string;
    userId: string;
    assignedTo: string | null;    // collection agent userId

    overdueDays: number;
    overdueAmount: Rupees;
    penaltyAmount: Rupees;
    totalDue: Rupees;
    dpdBucket: DpdBucket;

    status: CollectionCaseStatus;

    // Promise to pay
    ptpDate: Date | null;
    ptpAmount: Rupees | null;
    ptpBroken: boolean;

    openedAt: Date;
    resolvedAt: Date | null;
    closedAt: Date | null;
    closeReason: string | null;

    lastContactAt: Date | null;
    contactCount: number;

    escalationLevel: number;           // 0 = normal, 1 = supervisor, 2 = legal
    escalatedAt: Date | null;
    escalationReason: string | null;

    notes: string | null;
    createdAt: Date;
    updatedAt: Date;
}

// ─── Contact log ──────────────────────────────────────────────────────────────

export interface ContactLog {
    id: string;
    caseId: string;
    loggedBy: string;           // collection agent userId
    outcome: ContactOutcome;
    channel: string;           // 'PHONE' | 'FIELD' | 'SMS' | 'WHATSAPP'
    ptpDate: Date | null;
    ptpAmount: Rupees | null;
    paymentReceived: Rupees | null;
    notes: string;
    contactedAt: Date;
    createdAt: Date;
}

// ─── Portfolio overview ────────────────────────────────────────────────────────

export interface CollectionPortfolioSummary {
    totalCases: number;
    openCases: number;
    resolvedCases: number;
    escalatedCases: number;
    totalOverdue: Rupees;
    bucketBreakdown: Record<DpdBucket, { count: number; amount: Rupees }>;
    ptpThisWeek: number;
    collectionRate: number;          // % of overdue collected this month
}

// ─── Inputs ───────────────────────────────────────────────────────────────────

export interface CreateCaseInput {
    loanAccountId: string;
    userId: string;
    overdueDays: number;
    overdueAmount: Rupees;
    penaltyAmount: Rupees;
    assignedTo?: string;
}

export interface LogContactInput {
    caseId: string;
    loggedBy: string;
    outcome: ContactOutcome;
    channel: string;
    ptpDate?: Date;
    ptpAmount?: Rupees;
    paymentReceived?: Rupees;
    notes: string;
}

export interface AssignCaseInput {
    caseId: string;
    assignTo: string;
    assignedBy: string;
    reason?: string;
}

export interface EscalateCaseInput {
    caseId: string;
    escalatedBy: string;
    reason: string;
    level: number;
}

export interface CloseCaseInput {
    caseId: string;
    closedBy: string;
    reason: string;
    status: 'RESOLVED' | 'CLOSED';
}

export interface ListCasesInput {
    status?: CollectionCaseStatus;
    dpdBucket?: DpdBucket;
    assignedTo?: string;
    userId?: string;
    page: number;
    limit: number;
    sortBy?: 'overdueDays' | 'overdueAmount' | 'openedAt' | 'lastContactAt';
    sortOrder?: SortOrder;
}

// ─── Response shapes ──────────────────────────────────────────────────────────

export interface CollectionCaseResponse {
    id: string;
    loanAccountId: string;
    userId: string;
    assignedTo: string | null;
    overdueDays: number;
    overdueAmount: Rupees;
    totalDue: Rupees;
    dpdBucket: DpdBucket;
    status: CollectionCaseStatus;
    ptpDate: Date | null;
    ptpAmount: Rupees | null;
    ptpBroken: boolean;
    contactCount: number;
    escalationLevel: number;
    lastContactAt: Date | null;
    openedAt: Date;
    resolvedAt: Date | null;
}

export interface ContactLogResponse {
    id: string;
    caseId: string;
    loggedBy: string;
    outcome: ContactOutcome;
    channel: string;
    ptpDate: Date | null;
    ptpAmount: Rupees | null;
    paymentReceived: Rupees | null;
    notes: string;
    contactedAt: Date;
}
