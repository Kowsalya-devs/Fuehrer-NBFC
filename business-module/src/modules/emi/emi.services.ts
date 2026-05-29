// src/modules/emi/emi.service.ts
import type { Request } from 'express';
import { emiRepository } from './emi.repository';
import {
    buildAmortizationSchedule,
    computeMonthlyEmi,
    computeDailyOverduePenalty,
    computeBouncePenalty,
    computeForeclosureAmount,
} from './emi.calculator';
import { eventBus } from '@/events';
import { setAuditContext } from '@/middlewares';
import {
    EMI_STATUS,
    BUSINESS_RULES,
    AUDIT_ACTION,
} from '@/config/constants';
import {
    roundRupees,
    daysBetween,
    toNumber,
} from '@/types/common.types';
import {
    NotFoundError,
    ConflictError,
    DomainError,
    EmiAlreadyPaidError,
} from '@/errors';
import { createModuleLogger } from '@/config/logger';
import type {
    EmiScheduleEntry,
    AmortizationSchedule,
    EmiScheduleSummary,
    ListEmiScheduleInput,
    MarkEmiPaidInput,
    WaiveEmiInput,
    OverdueEmiResult,
    EmiReminderTarget,
    NachDebitTarget,
} from './emi.types';

const log = createModuleLogger('emi.service');

export const emiService = {

    // ── 1. Generate and persist schedule at disbursement ─────────────────────
    // Called once per loan at the moment of disbursement.
    // Returns the schedule for immediate use by the disbursement module.

    async createSchedule(params: {
        loanAccountId: string;
        principal: number;
        annualRatePct: number;
        tenureMonths: number;
        disbursementDate: Date;
    }): Promise<AmortizationSchedule> {
        // Build the full schedule in memory — pure calculation, no DB
        const schedule = buildAmortizationSchedule({
            loanAccountId: params.loanAccountId,
            principal: params.principal,
            annualRatePct: params.annualRatePct,
            tenureMonths: params.tenureMonths,
            disbursementDate: params.disbursementDate,
        });

        // Persist atomically — all entries or none
        await emiRepository.createSchedule(schedule);

        log.info('EMI schedule persisted', {
            loanAccountId: params.loanAccountId,
            tenure: params.tenureMonths,
            monthlyEmi: schedule.monthlyEmi,
            firstEmiDate: schedule.firstEmiDate,
            totalPayable: schedule.totalPayable,
        });

        return schedule;
    },

    // ── 2. Get full schedule ──────────────────────────────────────────────────

    async getSchedule(
        input: ListEmiScheduleInput,
    ): Promise<EmiScheduleEntry[]> {
        return emiRepository.findByLoanAccountId(input);
    },

    // ── 3. Get summary ────────────────────────────────────────────────────────

    async getSummary(loanAccountId: string): Promise<EmiScheduleSummary> {
        return emiRepository.getSummary(loanAccountId);
    },

    // ── 4. Get single EMI ─────────────────────────────────────────────────────

    async getEmi(emiId: string): Promise<EmiScheduleEntry> {
        return emiRepository.findByIdOrThrow(emiId);
    },

    // ── 5. Mark EMI as paid ───────────────────────────────────────────────────
    // Called by payments.service on successful payment capture.
    // Also called by collections module for cash/UPI collections.

    async markPaid(
        input: MarkEmiPaidInput,
        req: Request,
    ): Promise<EmiScheduleEntry> {
        const emi = await emiRepository.findByIdOrThrow(input.emiId);

        if (emi.status === EMI_STATUS.PAID) {
            throw new EmiAlreadyPaidError(emi.id, emi.emiNumber);
        }
        if (emi.status === EMI_STATUS.WAIVED) {
            throw new ConflictError(
                `EMI #${emi.emiNumber} has been waived and cannot be marked paid`,
            );
        }

        const updated = await emiRepository.markPaid(
            emi.id,
            input.paidAt,
            input.collectionId,
        );

        setAuditContext(req, {
            action: AUDIT_ACTION.EMI_PAID,
            entityType: 'emi_schedule',
            entityId: emi.id,
            before: { status: emi.status, penaltyAmount: emi.penaltyAmount },
            after: { status: EMI_STATUS.PAID, paidAt: input.paidAt },
        });

        // Emit payment.received — loan handlers check for loan closure
        eventBus.emit('payment.received', {
            paymentId: input.emiId,   // Placeholder; real paymentId from payments module
            loanAccountId: emi.loanAccountId,
            userId: '',            // Resolved by payments module
            emiId: emi.id,
            emiNumber: emi.emiNumber,
            amount: input.paidAmount,
            channel: input.channel,
            gatewayTxnId: '',
            paidAt: input.paidAt,
            requestId: req.requestId,
        });

        log.info('EMI marked paid', {
            emiId: emi.id,
            emiNumber: emi.emiNumber,
            loanAccountId: emi.loanAccountId,
            channel: input.channel,
        });

        return updated;
    },

    // ── 6. Apply bounce ───────────────────────────────────────────────────────
    // Called by payments.service when eNACH debit fails.

    async applyBounce(
        emiId: string,
        bounceReason: string,
        req: Request,
    ): Promise<EmiScheduleEntry> {
        const emi = await emiRepository.findByIdOrThrow(emiId);

        if (emi.status === EMI_STATUS.PAID) {
            throw new EmiAlreadyPaidError(emi.id, emi.emiNumber);
        }

        // Bounce penalty
        const bouncePenalty = computeBouncePenalty(
            emi.emiAmount,
            BUSINESS_RULES.EMI_BOUNCE_PENALTY_RATE * 100, // convert 0.02 → 2
        );

        // Add to existing penalty
        await emiRepository.incrementPenalty(emiId, Math.round(bouncePenalty * 100));

        // Calculate next retry date
        const newBounceCount = emi.bounceCount + 1;
        const nextRetryAt = newBounceCount < BUSINESS_RULES.ENACH_RETRY_LIMIT
            ? new Date(
                Date.now() +
                BUSINESS_RULES.ENACH_RETRY_INTERVAL_DAYS * 24 * 60 * 60 * 1000,
            )
            : null; // No more retries

        const updated = await emiRepository.markBounced(emiId, nextRetryAt);

        eventBus.emit('emi.bounced', {
            loanAccountId: emi.loanAccountId,
            userId: '', // Resolved by payments module
            emiId: emi.id,
            emiNumber: emi.emiNumber,
            amount: emi.emiAmount,
            bounceReason,
            retryCount: newBounceCount,
            nextRetryAt,
        });

        log.warn('EMI bounce applied', {
            emiId,
            emiNumber: emi.emiNumber,
            bounceCount: newBounceCount,
            bouncePenalty,
            nextRetryAt,
        });

        return updated;
    },

    // ── 7. Apply daily overdue penalty ────────────────────────────────────────
    // Called by npaWatch.job for each overdue EMI each day.

    async applyOverduePenalty(emiId: string): Promise<void> {
        const emi = await emiRepository.findByIdOrThrow(emiId);

        if (
            emi.status === EMI_STATUS.PAID ||
            emi.status === EMI_STATUS.WAIVED
        ) return;

        const dailyPenalty = computeDailyOverduePenalty(
            emi.emiAmount,
            BUSINESS_RULES.EMI_OVERDUE_PENALTY_RATE * 100, // 0.24 → 24%
        );

        await emiRepository.incrementPenalty(
            emiId,
            Math.round(dailyPenalty * 100), // to paisa
        );

        // Mark overdue if not already
        if (emi.status !== EMI_STATUS.OVERDUE && emi.status !== EMI_STATUS.BOUNCED) {
            await emiRepository.markOverdue(emiId);
        }
    },

    // ── 8. Waive EMI (Super Admin / Finance only) ──────────────────────────────

    async waiveEmi(
        input: WaiveEmiInput,
        req: Request,
    ): Promise<EmiScheduleEntry> {
        const emi = await emiRepository.findByIdOrThrow(input.emiId);

        if (emi.status === EMI_STATUS.PAID) {
            throw new EmiAlreadyPaidError(emi.id, emi.emiNumber);
        }

        const updated = await emiRepository.waiveEmi(emi.id);

        setAuditContext(req, {
            action: 'EMI_WAIVED',
            entityType: 'emi_schedule',
            entityId: emi.id,
            before: { status: emi.status, penaltyAmount: emi.penaltyAmount },
            after: { status: EMI_STATUS.WAIVED, reason: input.reason },
            metadata: { waivedBy: input.waivedBy },
        });

        log.warn('EMI waived', {
            emiId: emi.id,
            emiNumber: emi.emiNumber,
            waivedBy: input.waivedBy,
            reason: input.reason,
        });

        return updated;
    },

    // ── 9. Foreclosure quote ──────────────────────────────────────────────────

    async getForeclosureQuote(
        loanAccountId: string,
    ): Promise<ReturnType<typeof computeForeclosureAmount>> {
        const summary = await emiRepository.getSummary(loanAccountId);
        const nextDue = await emiRepository.findNextDueEmi(loanAccountId);

        if (!nextDue) {
            throw new DomainError(
                'No outstanding EMIs — loan may already be closed',
                'NO_OUTSTANDING_EMIS',
            );
        }

        // Last paid EMI date as starting point for accrued interest
        const lastPaidDate = summary.lastPaidAt ?? new Date();

        return computeForeclosureAmount({
            outstandingPrincipal: summary.totalOutstanding,
            annualRatePct: 0, // Fetched from loan account in controller
            lastEmiDate: lastPaidDate,
            settlementDate: new Date(),
            foreclosureFeePct: 2,   // 2% foreclosure fee
            accumulatedPenalty: summary.totalPenalty,
        });
    },

    // ── 10. Cron job helpers ──────────────────────────────────────────────────

    async getReminders(
        targetDate: Date,
        daysBefore: number,
    ): Promise<EmiReminderTarget[]> {
        return emiRepository.findEmisForReminder(targetDate, daysBefore);
    },

    async getNachDebitTargets(
        debitDate: Date,
    ): Promise<NachDebitTarget[]> {
        return emiRepository.findEmisForNachDebit(debitDate);
    },

    async getOverdueEmis(
        gracePeriodDays?: number,
    ): Promise<OverdueEmiResult[]> {
        return emiRepository.findOverdueEmis(
            gracePeriodDays ?? BUSINESS_RULES.EMI_GRACE_PERIOD_DAYS,
        );
    },

    // ── 11. Count remaining — used by payments module to detect loan closure ──

    async countUnpaid(loanAccountId: string): Promise<number> {
        return emiRepository.countUnpaidEmis(loanAccountId);
    },
};
