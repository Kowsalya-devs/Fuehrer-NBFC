// src/errors/LoanStateError.ts
import { AppError } from './AppError';
import { HTTP, LOAN_TRANSITIONS } from '@/config/constants';
import type { LoanStatus } from '@/config/constants';

export class LoanStateError extends AppError {
    public readonly currentStatus: LoanStatus;
    public readonly attemptedStatus: LoanStatus;
    public readonly allowedTransitions: LoanStatus[];

    constructor(
        loanId: string,
        currentStatus: LoanStatus,
        attemptedStatus: LoanStatus,
    ) {
        const allowed = LOAN_TRANSITIONS[currentStatus];

        super({
            message: `Invalid loan state transition: cannot move from '${currentStatus}' to '${attemptedStatus}'`,
            statusCode: HTTP.CONFLICT,
            errorCode: 'INVALID_LOAN_STATE_TRANSITION',
            details: {
                loanId,
                currentStatus,
                attemptedStatus,
                allowedTransitions: allowed,
            },
        });

        this.currentStatus = currentStatus;
        this.attemptedStatus = attemptedStatus;
        this.allowedTransitions = allowed;
    }

    // ─── Static guard ─────────────────────────────────────────────────────────
    // Use this in loan.service.ts before every status change

    static assert(
        loanId: string,
        currentStatus: LoanStatus,
        targetStatus: LoanStatus,
    ): void {
        const allowed = LOAN_TRANSITIONS[currentStatus];
        if (!allowed.includes(targetStatus)) {
            throw new LoanStateError(loanId, currentStatus, targetStatus);
        }
    }

    // ─── Specific transition errors ───────────────────────────────────────────

    static cannotApprove(loanId: string, currentStatus: LoanStatus): LoanStateError {
        return new LoanStateError(loanId, currentStatus, 'APPROVED' as LoanStatus);
    }

    static cannotDisburse(loanId: string, currentStatus: LoanStatus): LoanStateError {
        return new LoanStateError(loanId, currentStatus, 'DISBURSED' as LoanStatus);
    }

    static cannotReject(loanId: string, currentStatus: LoanStatus): LoanStateError {
        return new LoanStateError(loanId, currentStatus, 'REJECTED' as LoanStatus);
    }
}