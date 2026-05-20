// src/utils/loanStateMachine.util.ts
//
// Loan state machine utilities.
//
// The transition table (LOAN_TRANSITIONS) and LoanStateError live in
// config/constants.ts and src/errors/LoanStateError.ts respectively.
// This util re-exports the core guard and adds higher-level helpers that
// services use to reason about loan status without inline string comparisons.
//
// State flow (complete):
//
//   DRAFT
//     └─► KYC_PENDING
//           ├─► UNDERWRITING        (KYC complete)
//           └─► KYC_REJECTED        (hard KYC fail — terminal)
//                 └─► (no transitions)
//   UNDERWRITING
//     ├─► PENDING_APPROVAL
//     └─► REJECTED                  (auto-reject — terminal)
//   PENDING_APPROVAL
//     ├─► APPROVED
//     └─► REJECTED
//   APPROVED
//     ├─► ESIGN_PENDING
//     └─► REJECTED
//   ESIGN_PENDING
//     └─► DISBURSED                 (eSign + eStamp + eNACH all confirmed)
//   DISBURSED
//     └─► ACTIVE                    (first EMI schedule live)
//   ACTIVE
//     ├─► CLOSED                    (all EMIs paid)
//     └─► NPA                       (90+ days overdue)
//   NPA
//     ├─► ACTIVE                    (recovery — payments received)
//     └─► WRITTEN_OFF               (terminal — no recovery expected)
//   CLOSED / WRITTEN_OFF / REJECTED / KYC_REJECTED → terminal (no transitions)

import { LOAN_STATUS, LOAN_TRANSITIONS } from '@/config/constants';
import { LoanStateError } from '@/errors';
import type { LoanStatus } from '@/config/constants';

// Re-export for convenience — callers import everything from this util
export { LoanStateError };
export type { LoanStatus };

// ─── Core transition guard ────────────────────────────────────────────────────
// Thin wrapper around LoanStateError.assert — use this in services instead of
// calling the error class directly, so the import stays in one place.

export function assertTransition(
    loanId: string,
    from: LoanStatus,
    to: LoanStatus,
): void {
    LoanStateError.assert(loanId, from, to);
}

export function canTransition(from: LoanStatus, to: LoanStatus): boolean {
    return LOAN_TRANSITIONS[from]?.includes(to) ?? false;
}

export function getAllowedTransitions(from: LoanStatus): LoanStatus[] {
    return LOAN_TRANSITIONS[from] ?? [];
}

// ─── Terminal state checks ────────────────────────────────────────────────────
// A terminal state has no outgoing transitions — once reached, the loan
// cannot move to any other status.

const TERMINAL_STATES = new Set<LoanStatus>([
    LOAN_STATUS.CLOSED,
    LOAN_STATUS.REJECTED,
    LOAN_STATUS.KYC_REJECTED,
    LOAN_STATUS.WRITTEN_OFF,
]);

export function isTerminal(status: LoanStatus): boolean {
    return TERMINAL_STATES.has(status);
}

// ─── Status category helpers ──────────────────────────────────────────────────
// Used by reports, collections, and admin dashboard queries.

export function isActive(status: LoanStatus): boolean {
    return status === LOAN_STATUS.ACTIVE;
}

export function isOverdue(status: LoanStatus): boolean {
    return status === LOAN_STATUS.NPA;
}

export function isDisbursed(status: LoanStatus): boolean {
    return (
        status === LOAN_STATUS.DISBURSED ||
        status === LOAN_STATUS.ACTIVE ||
        status === LOAN_STATUS.NPA ||
        status === LOAN_STATUS.CLOSED ||
        status === LOAN_STATUS.WRITTEN_OFF
    );
}

export function isPendingDisbursal(status: LoanStatus): boolean {
    return status === LOAN_STATUS.ESIGN_PENDING;
}

export function isInProgress(status: LoanStatus): boolean {
    return (
        status === LOAN_STATUS.DRAFT ||
        status === LOAN_STATUS.KYC_PENDING ||
        status === LOAN_STATUS.UNDERWRITING ||
        status === LOAN_STATUS.PENDING_APPROVAL ||
        status === LOAN_STATUS.APPROVED ||
        status === LOAN_STATUS.ESIGN_PENDING
    );
}

// ─── Disbursement gate check ──────────────────────────────────────────────────
// All three conditions must be met before disbursement is allowed.
// Called by disbursement.service before triggering Razorpay payout.

export interface DisbursementGate {
    eSignComplete: boolean;
    eStampComplete: boolean;
    eNachConfirmed: boolean;
}

export function assertDisbursementReady(
    loanId: string,
    gate: DisbursementGate,
): void {
    const missing: string[] = [];

    if (!gate.eSignComplete) missing.push('eSign not completed');
    if (!gate.eStampComplete) missing.push('eStamp not applied');
    if (!gate.eNachConfirmed) missing.push('eNACH mandate not confirmed');

    if (missing.length > 0) {
        throw new LoanStateError(
            loanId,
            LOAN_STATUS.ESIGN_PENDING,
            LOAN_STATUS.DISBURSED,
        );
    }
}

// ─── Status display label ─────────────────────────────────────────────────────
// Human-readable labels for admin dashboard and customer app.

const STATUS_LABELS: Record<LoanStatus, string> = {
    [LOAN_STATUS.DRAFT]: 'Draft',
    [LOAN_STATUS.KYC_PENDING]: 'KYC Pending',
    [LOAN_STATUS.KYC_REJECTED]: 'KYC Rejected',
    [LOAN_STATUS.UNDERWRITING]: 'Under Review',
    [LOAN_STATUS.PENDING_APPROVAL]: 'Pending Approval',
    [LOAN_STATUS.APPROVED]: 'Approved',
    [LOAN_STATUS.REJECTED]: 'Rejected',
    [LOAN_STATUS.ESIGN_PENDING]: 'Agreement Pending',
    [LOAN_STATUS.DISBURSED]: 'Disbursed',
    [LOAN_STATUS.ACTIVE]: 'Active',
    [LOAN_STATUS.CLOSED]: 'Closed',
    [LOAN_STATUS.NPA]: 'Overdue',
    [LOAN_STATUS.WRITTEN_OFF]: 'Written Off',
};

export function getStatusLabel(status: LoanStatus): string {
    return STATUS_LABELS[status] ?? status;
}