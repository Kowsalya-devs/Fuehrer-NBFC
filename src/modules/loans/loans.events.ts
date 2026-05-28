// src/modules/loans/loans.events.ts
import { eventBus } from '@/events';
import type { LoanStatus } from '@/config/constants';
import type { Request } from 'express';
import type { Rupees } from '@/types/common.types';

export const loanEvents = {

    created(
        loan: {
            id: string; userId: string; agentId: string | null;
            amountRequested: Rupees; tenureMonths: number; productType: string
        },
        req: Request,
    ): void {
        eventBus.emit('loan.created', {
            loanId: loan.id,
            userId: loan.userId,
            agentId: loan.agentId,
            amount: loan.amountRequested,
            tenureMonths: loan.tenureMonths,
            productType: loan.productType,
            requestId: req.requestId,
        });
    },

    statusChanged(
        loan: { id: string; userId: string; agentId: string | null },
        prevStatus: LoanStatus,
        newStatus: LoanStatus,
        changedBy: string,
        req: Request,
        reason?: string,
    ): void {
        eventBus.emit('loan.status.changed', {
            loanId: loan.id,
            userId: loan.userId,
            agentId: loan.agentId,
            previousStatus: prevStatus,
            currentStatus: newStatus,
            changedBy,
            reason,
            requestId: req.requestId,
        });
    },

    approved(
        loan: { id: string; userId: string; agentId: string | null },
        terms: {
            approvedAmount: Rupees; interestRate: number;
            tenureMonths: number; monthlyEmi: Rupees
        },
        approvedBy: string,
        req: Request,
    ): void {
        eventBus.emit('loan.approved', {
            loanId: loan.id,
            userId: loan.userId,
            agentId: loan.agentId,
            approvedAmount: terms.approvedAmount,
            interestRate: terms.interestRate,
            tenureMonths: terms.tenureMonths,
            monthlyEmi: terms.monthlyEmi,
            approvedBy,
            requestId: req.requestId,
        });
    },

    rejected(
        loan: { id: string; userId: string; agentId: string | null },
        reason: string,
        rejectedBy: string,
        req: Request,
    ): void {
        eventBus.emit('loan.rejected', {
            loanId: loan.id,
            userId: loan.userId,
            agentId: loan.agentId,
            reason,
            rejectedBy,
            requestId: req.requestId,
        });
    },

    disbursed(
        account: { id: string; userId: string; applicationId: string },
        agentId: string | null,
        disbursedAmount: Rupees,
        utrNumber: string | null,
        req: Request,
    ): void {
        eventBus.emit('loan.disbursed', {
            loanId: account.applicationId,
            loanAccountId: account.id,
            userId: account.userId,
            agentId,
            disbursedAmount,
            disbursedAt: new Date(),
            utrNumber,
            requestId: req.requestId,
        });
    },

    closed(
        account: { id: string; userId: string },
        req: Request,
    ): void {
        eventBus.emit('loan.closed', {
            loanAccountId: account.id,
            userId: account.userId,
            closedAt: new Date(),
            requestId: req.requestId,
        });
    },

    npa(
        account: { id: string; userId: string },
        overdueDays: number,
        overdueAmount: Rupees,
        req: Request,
    ): void {
        eventBus.emit('loan.npa', {
            loanAccountId: account.id,
            userId: account.userId,
            overdueDays,
            overdueAmount,
            markedAt: new Date(),
            requestId: req.requestId,
        });
    },
};
