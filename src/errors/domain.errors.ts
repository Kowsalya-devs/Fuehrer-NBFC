// src/errors/domain.errors.ts
import { AppError } from './AppError';
import { HTTP } from '@/config/constants';

// ─── Base domain error — 422 Unprocessable Entity ────────────────────────────
// Data is structurally valid but violates a business rule

export class DomainError extends AppError {
    constructor(
        message: string,
        errorCode: string,
        details?: Record<string, unknown>,
    ) {
        super({
            message,
            statusCode: HTTP.UNPROCESSABLE_ENTITY,
            errorCode,
            details: details ?? null,
        });
    }
}

// ─── KYC domain errors ────────────────────────────────────────────────────────

export class KycIncompleteError extends DomainError {
    constructor(userId: string, missingChecks?: string[]) {
        super(
            'KYC must be completed before proceeding',
            'KYC_INCOMPLETE',
            { userId, missingChecks: missingChecks ?? [] },
        );
    }
}

export class KycRejectedError extends DomainError {
    constructor(userId: string, reason: string) {
        super(
            `KYC has been rejected: ${reason}`,
            'KYC_REJECTED',
            { userId, reason },
        );
    }
}

// ─── Underwriting domain errors ───────────────────────────────────────────────

export class CreditScoreTooLowError extends DomainError {
    constructor(score: number, required: number) {
        super(
            `Credit score ${score} is below the minimum required score of ${required}`,
            'CREDIT_SCORE_TOO_LOW',
            { score, required },
        );
    }
}

export class FoirExceededError extends DomainError {
    constructor(actualFoir: number, maxFoir: number) {
        super(
            `Fixed Obligation to Income Ratio of ${(actualFoir * 100).toFixed(1)}% exceeds the maximum allowed ${(maxFoir * 100).toFixed(1)}%`,
            'FOIR_EXCEEDED',
            {
                actualFoir: Number(actualFoir.toFixed(4)),
                maxFoir: Number(maxFoir.toFixed(4)),
                actualPct: `${(actualFoir * 100).toFixed(1)}%`,
                maxPct: `${(maxFoir * 100).toFixed(1)}%`,
            },
        );
    }
}

// ─── Loan domain errors ───────────────────────────────────────────────────────

export class LoanAmountOutOfRangeError extends DomainError {
    constructor(amount: number, min: number, max: number) {
        super(
            `Loan amount ₹${amount.toLocaleString('en-IN')} is outside the allowed range of ₹${min.toLocaleString('en-IN')} – ₹${max.toLocaleString('en-IN')}`,
            'LOAN_AMOUNT_OUT_OF_RANGE',
            { amount, min, max },
        );
    }
}

export class TenureOutOfRangeError extends DomainError {
    constructor(tenure: number, min: number, max: number) {
        super(
            `Tenure of ${tenure} months is outside the allowed range of ${min}–${max} months`,
            'TENURE_OUT_OF_RANGE',
            { tenure, min, max },
        );
    }
}

export class LoanAlreadyClosedError extends DomainError {
    constructor(loanId: string) {
        super(
            'This loan account is already closed',
            'LOAN_ALREADY_CLOSED',
            { loanId },
        );
    }
}

// ─── EMI domain errors ────────────────────────────────────────────────────────

export class EmiAlreadyPaidError extends DomainError {
    constructor(emiId: string, emiNumber: number) {
        super(
            `EMI #${emiNumber} has already been paid`,
            'EMI_ALREADY_PAID',
            { emiId, emiNumber },
        );
    }
}

export class EmiNotDueYetError extends DomainError {
    constructor(emiId: string, dueDate: Date) {
        super(
            `EMI is not due until ${dueDate.toLocaleDateString('en-IN')}`,
            'EMI_NOT_DUE',
            { emiId, dueDate: dueDate.toISOString() },
        );
    }
}

// ─── Disbursement domain errors ───────────────────────────────────────────────

export class ESignNotCompletedError extends DomainError {
    constructor(loanId: string) {
        super(
            'Loan agreement must be eSigned before disbursement',
            'ESIGN_NOT_COMPLETED',
            { loanId },
        );
    }
}

export class DisbursementAlreadyDoneError extends DomainError {
    constructor(loanId: string) {
        super(
            'This loan has already been disbursed',
            'DISBURSEMENT_ALREADY_DONE',
            { loanId },
        );
    }
}

// ─── Agent domain errors ──────────────────────────────────────────────────────

export class AgentNotActiveError extends DomainError {
    constructor(agentId: string, status: string) {
        super(
            `Agent is not active (current status: ${status})`,
            'AGENT_NOT_ACTIVE',
            { agentId, status },
        );
    }
}

export class CommissionClawbackError extends DomainError {
    constructor(commissionId: string, reason: string) {
        super(
            `Commission clawback triggered: ${reason}`,
            'COMMISSION_CLAWBACK',
            { commissionId, reason },
        );
    }
}