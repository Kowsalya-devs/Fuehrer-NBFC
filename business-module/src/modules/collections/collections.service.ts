// src/modules/collections/collections.service.ts
import type { Request } from 'express';
import { collectionsRepository } from './collections.repository';
import { collectionEvents } from './collections.events';
import { emiRepository } from '@/modules/emi';
import { loansRepository } from '@/modules/loans';
import { loansService } from '@/modules/loans';
import { setAuditContext } from '@/middlewares';
import {
    LOAN_STATUS,
    EMI_STATUS,
    BUSINESS_RULES,
    AUDIT_ACTION,
} from '@/config/constants';
import { roundRupees, toNumber } from '@/types/common.types';
import { createModuleLogger } from '@/config/logger';
import {
    NotFoundError,
    ForbiddenError,
    DomainError,
    ConflictError,
} from '@/errors';
import type {
    CollectionCase,
    CollectionCaseResponse,
    ContactLogResponse,
    CollectionPortfolioSummary,
    CreateCaseInput,
    LogContactInput,
    AssignCaseInput,
    EscalateCaseInput,
    CloseCaseInput,
    ListCasesInput,
} from './collections.types';
import { classifyDpd } from './collections.types';
import type { OverdueEmiResult } from '@/modules/emi/emi.types';

const log = createModuleLogger('collections.service');

// ─── Response shaper ──────────────────────────────────────────────────────────

function toCaseResponse(c: CollectionCase): CollectionCaseResponse {
    return {
        id: c.id,
        loanAccountId: c.loanAccountId,
        userId: c.userId,
        assignedTo: c.assignedTo,
        overdueDays: c.overdueDays,
        overdueAmount: c.overdueAmount,
        totalDue: c.totalDue,
        dpdBucket: c.dpdBucket,
        status: c.status,
        ptpDate: c.ptpDate,
        ptpAmount: c.ptpAmount,
        ptpBroken: c.ptpBroken,
        contactCount: c.contactCount,
        escalationLevel: c.escalationLevel,
        lastContactAt: c.lastContactAt,
        openedAt: c.openedAt,
        resolvedAt: c.resolvedAt,
    };
}

// ─── Service ───────────────────────────────────────────────────────────────────

export const collectionsService = {

    // ── 1. Open collection case ────────────────────────────────────────────────
    // Called by loan.handlers.ts when loan.npa fires, and by the npaWatch
    // cron job for cases that crossed the 30-DPD threshold.
    // Idempotent — returns existing open case if one already exists.

    async openCase(
        input: CreateCaseInput,
    ): Promise<CollectionCaseResponse> {
        // Idempotency — never open a duplicate case for the same account
        const existing = await collectionsRepository.findOpenByLoanAccount(
            input.loanAccountId,
        );
        if (existing) {
            log.info('Collection case already open', {
                caseId: existing.id,
                loanAccountId: input.loanAccountId,
            });
            return toCaseResponse(existing);
        }

        // Auto-assign to the least loaded collection agent
        const assignedTo = input.assignedTo
            ?? await collectionsRepository.findLeastLoadedAgent();

        const collCase = await collectionsRepository.createCase({
            loanAccountId: input.loanAccountId,
            userId: input.userId,
            overdueDays: input.overdueDays,
            overdueAmount: input.overdueAmount,
            penaltyAmount: input.penaltyAmount,
            assignedTo,
        });

        collectionEvents.caseOpened({
            caseId: collCase.id,
            loanAccountId: collCase.loanAccountId,
            userId: collCase.userId,
            assignedTo: collCase.assignedTo,
            overdueDays: collCase.overdueDays,
            overdueAmount: collCase.overdueAmount,
        });

        return toCaseResponse(collCase);
    },

    // ── 2. Log contact attempt ─────────────────────────────────────────────────
    // The most frequent operation — field agents call this multiple times per day.

    async logContact(
        input: LogContactInput,
        req: Request,
    ): Promise<ContactLogResponse> {
        const collCase = await collectionsRepository.findByIdOrThrow(input.caseId);

        if (collCase.status !== 'OPEN' && collCase.status !== 'ESCALATED') {
            throw new DomainError(
                `Cannot log contact for a ${collCase.status} case`,
                'INVALID_CASE_STATUS_FOR_CONTACT',
                { caseId: input.caseId, status: collCase.status },
            );
        }

        const contactLog = await collectionsRepository.createContactLog({
            caseId: input.caseId,
            loggedBy: input.loggedBy,
            outcome: input.outcome,
            channel: input.channel,
            ptpDate: input.ptpDate ?? null,
            ptpAmount: input.ptpAmount ?? null,
            paymentReceived: input.paymentReceived ?? null,
            notes: input.notes,
        });

        // If payment was received at the time of contact, trigger the payment event
        if (
            input.outcome === 'PAYMENT_RECEIVED' &&
            input.paymentReceived &&
            input.paymentReceived > 0
        ) {
            collectionEvents.paymentLogged({
                caseId: input.caseId,
                loanAccountId: collCase.loanAccountId,
                userId: collCase.userId,
                amount: input.paymentReceived,
                channel: input.channel,
                loggedBy: input.loggedBy,
                requestId: req.requestId,
            });
        }

        setAuditContext(req, {
            action: 'COLLECTION_CONTACT_LOGGED',
            entityType: 'contact_logs',
            entityId: contactLog.id,
            after: {
                caseId: input.caseId,
                outcome: input.outcome,
                channel: input.channel,
            },
        });

        log.info('Contact logged', {
            contactId: contactLog.id,
            caseId: input.caseId,
            outcome: input.outcome,
            loggedBy: input.loggedBy,
        });

        return {
            id: contactLog.id,
            caseId: contactLog.caseId,
            loggedBy: contactLog.loggedBy,
            outcome: contactLog.outcome,
            channel: contactLog.channel,
            ptpDate: contactLog.ptpDate,
            ptpAmount: contactLog.ptpAmount,
            paymentReceived: contactLog.paymentReceived,
            notes: contactLog.notes,
            contactedAt: contactLog.contactedAt,
        };
    },

    // ── 3. Assign / reassign case ──────────────────────────────────────────────

    async assignCase(
        input: AssignCaseInput,
        req: Request,
    ): Promise<CollectionCaseResponse> {
        const collCase = await collectionsRepository.findByIdOrThrow(input.caseId);

        if (collCase.status === 'CLOSED' || collCase.status === 'RESOLVED') {
            throw new DomainError(
                'Cannot reassign a closed or resolved case',
                'CASE_NOT_REASSIGNABLE',
                { caseId: input.caseId, status: collCase.status },
            );
        }

        const updated = await collectionsRepository.updateCase(input.caseId, {
            assigned_to: input.assignTo,
        });

        setAuditContext(req, {
            action: 'COLLECTION_CASE_ASSIGNED',
            entityType: 'collection_cases',
            entityId: input.caseId,
            before: { assignedTo: collCase.assignedTo },
            after: { assignedTo: input.assignTo, reason: input.reason },
            metadata: { assignedBy: input.assignedBy },
        });

        log.info('Case reassigned', {
            caseId: input.caseId,
            from: collCase.assignedTo,
            to: input.assignTo,
            by: input.assignedBy,
        });

        return toCaseResponse(updated);
    },

    // ── 4. Escalate case ───────────────────────────────────────────────────────
    // Level 1 → supervisor review
    // Level 2 → legal / recovery team

    async escalateCase(
        input: EscalateCaseInput,
        req: Request,
    ): Promise<CollectionCaseResponse> {
        const collCase = await collectionsRepository.findByIdOrThrow(input.caseId);

        if (collCase.status === 'CLOSED' || collCase.status === 'RESOLVED') {
            throw new DomainError(
                'Cannot escalate a closed or resolved case',
                'CASE_NOT_ESCALATABLE',
                { caseId: input.caseId, status: collCase.status },
            );
        }

        if (input.level <= collCase.escalationLevel) {
            throw new DomainError(
                `Case is already at escalation level ${collCase.escalationLevel}`,
                'INVALID_ESCALATION_LEVEL',
                {
                    caseId: input.caseId,
                    currentLevel: collCase.escalationLevel,
                    requestedLevel: input.level,
                },
            );
        }

        const updated = await collectionsRepository.updateCase(input.caseId, {
            status: 'ESCALATED',
            escalation_level: input.level,
            escalated_at: new Date(),
            escalation_reason: input.reason,
        });

        setAuditContext(req, {
            action: 'COLLECTION_CASE_ESCALATED',
            entityType: 'collection_cases',
            entityId: input.caseId,
            before: { escalationLevel: collCase.escalationLevel },
            after: { escalationLevel: input.level, reason: input.reason },
            metadata: { escalatedBy: input.escalatedBy },
        });

        collectionEvents.caseEscalated({
            caseId: input.caseId,
            level: input.level,
            reason: input.reason,
            escalatedBy: input.escalatedBy,
        });

        log.warn('Case escalated', {
            caseId: input.caseId,
            level: input.level,
            reason: input.reason,
        });

        return toCaseResponse(updated);
    },

    // ── 5. Close / resolve case ────────────────────────────────────────────────

    async closeCase(
        input: CloseCaseInput,
        req: Request,
    ): Promise<CollectionCaseResponse> {
        const collCase = await collectionsRepository.findByIdOrThrow(input.caseId);

        if (collCase.status === 'CLOSED' || collCase.status === 'RESOLVED') {
            return toCaseResponse(collCase);
        }

        const now = new Date();
        const updated = await collectionsRepository.updateCase(input.caseId, {
            status: input.status,
            close_reason: input.reason,
            ...(input.status === 'RESOLVED'
                ? { resolved_at: now }
                : { closed_at: now }),
        });

        setAuditContext(req, {
            action: 'COLLECTION_CASE_CLOSED',
            entityType: 'collection_cases',
            entityId: input.caseId,
            before: { status: collCase.status },
            after: { status: input.status, reason: input.reason },
            metadata: { closedBy: input.closedBy },
        });

        collectionEvents.caseClosed({
            caseId: input.caseId,
            reason: input.reason,
            status: input.status,
        });

        log.info('Case closed', {
            caseId: input.caseId,
            status: input.status,
            reason: input.reason,
        });

        return toCaseResponse(updated);
    },

    // ── 6. Get case ────────────────────────────────────────────────────────────

    async getCase(
        caseId: string,
        userId: string,
        role: string,
    ): Promise<CollectionCaseResponse> {
        const collCase = await collectionsRepository.findByIdOrThrow(caseId);

        // Collection agents can only view cases assigned to them
        if (
            role === 'COLLECTION_AGENT' &&
            collCase.assignedTo !== userId
        ) {
            throw new ForbiddenError(
                'You can only view cases assigned to you',
            );
        }

        return toCaseResponse(collCase);
    },

    // ── 7. Get case for loan account ───────────────────────────────────────────

    async getCaseByLoanAccount(
        loanAccountId: string,
    ): Promise<CollectionCaseResponse | null> {
        const collCase = await collectionsRepository.findOpenByLoanAccount(
            loanAccountId,
        );
        return collCase ? toCaseResponse(collCase) : null;
    },

    // ── 8. List cases ──────────────────────────────────────────────────────────

    async listCases(
        input: ListCasesInput,
        userId: string,
        role: string,
    ) {
        // Collection agents can only see their own assigned cases
        if (role === 'COLLECTION_AGENT') {
            input = { ...input, assignedTo: userId };
        }

        const result = await collectionsRepository.list(input);
        return {
            ...result,
            data: result.data.map(toCaseResponse),
        };
    },

    // ── 9. Get contact history ─────────────────────────────────────────────────

    async getContactHistory(
        caseId: string,
        page: number,
        limit: number,
        userId: string,
        role: string,
    ) {
        const collCase = await collectionsRepository.findByIdOrThrow(caseId);

        if (
            role === 'COLLECTION_AGENT' &&
            collCase.assignedTo !== userId
        ) {
            throw new ForbiddenError('You can only view contacts for your cases');
        }

        const result = await collectionsRepository.listContactLogs(
            caseId, page, limit,
        );

        return {
            ...result,
            data: result.data.map((c) => ({
                id: c.id,
                caseId: c.caseId,
                loggedBy: c.loggedBy,
                outcome: c.outcome,
                channel: c.channel,
                ptpDate: c.ptpDate,
                ptpAmount: c.ptpAmount,
                paymentReceived: c.paymentReceived,
                notes: c.notes,
                contactedAt: c.contactedAt,
            })),
        };
    },

    // ── 10. Portfolio summary ──────────────────────────────────────────────────

    async getPortfolioSummary(): Promise<CollectionPortfolioSummary> {
        return collectionsRepository.getPortfolioSummary();
    },

    // ── 11. Sync overdue figures (called by npaWatch cron) ────────────────────

    async syncOverdueFigures(caseId: string): Promise<void> {
        await collectionsRepository.syncOverdueFigures(caseId);
    },

    // ── 12. Mark broken PTPs (called by npaWatch cron) ────────────────────────

    async markBrokenPtps(): Promise<number> {
        const count = await collectionsRepository.markBrokenPtps();
        if (count > 0) {
            log.warn('Broken PTPs marked', { count });
        }
        return count;
    },

    // ── 13. Auto-open cases for newly overdue loans ────────────────────────────
    // Called by npaWatch.job — finds active loans with EMIs 30+ DPD
    // and opens collection cases for any that don't have one.

    async autoOpenCasesForOverdueLoans(): Promise<{
        opened: number;
        skipped: number;
    }> {
        const overdueLoans = await loansRepository
            .findActiveLoansWithOverdueEmis(30);

        let opened = 0;
        let skipped = 0;

        for (const loan of overdueLoans) {
            const existing = await collectionsRepository.findOpenByLoanAccount(
                loan.loanAccountId,
            );

            if (existing) {
                // Sync figures on existing case
                await collectionsRepository.syncOverdueFigures(existing.id);
                skipped++;
                continue;
            }

            // Fetch current overdue amount — use findOverdueEmis (correct method name)
            const emiStats: OverdueEmiResult[] = await emiRepository.findOverdueEmis(0);
            const thisLoan = emiStats.filter(
                (e: OverdueEmiResult) => e.loanAccountId === loan.loanAccountId,
            );

            const overdueAmount = thisLoan.reduce(
                (sum: number, e: OverdueEmiResult) => sum + Number(e.emiAmount), 0,
            );
            const penaltyAmount = thisLoan.reduce(
                (sum: number, e: OverdueEmiResult) => sum + Number(e.penaltyAmount), 0,
            );

            await this.openCase({
                loanAccountId: loan.loanAccountId,
                userId: loan.userId,
                overdueDays: loan.overdueDays,
                overdueAmount: roundRupees(overdueAmount),
                penaltyAmount: roundRupees(penaltyAmount),
            });

            opened++;
        }

        log.info('Auto-open cases completed', { opened, skipped });
        return { opened, skipped };
    },
};
