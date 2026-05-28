// src/jobs/npaWatch.job.ts
import cron from 'node-cron';
import { prisma } from '@/config/database';
import { emiService } from '@/modules/emi';
import { loansService } from '@/modules/loans';
import { collectionsService } from '@/modules/collections';
import { createModuleLogger } from '@/config/logger';
import {
    CRON_SCHEDULE,
    BUSINESS_RULES,
    EMI_STATUS,
    LOAN_STATUS,
} from '@/config/constants';
import { toNumber, roundRupees } from '@/types/common.types';

const log = createModuleLogger('job:npaWatch');

export async function runNpaWatchJob(): Promise<void> {
    const jobStart = Date.now();
    log.info('NPA watch job started');

    const stats = {
        overdueEmisProcessed: 0,
        penaltiesApplied: 0,
        loansMarkedNpa: 0,
        casesOpened: 0,
        casesUpdated: 0,
        ptpsBroken: 0,
        errors: 0,
    };

    try {

        // ── Step 1: Apply daily overdue penalty to all overdue EMIs ───────────────
        const overdueEmis = await emiService.getOverdueEmis(
            BUSINESS_RULES.EMI_GRACE_PERIOD_DAYS,
        );

        log.info(`NPA watch: ${overdueEmis.length} overdue EMIs found`);

        for (const emi of overdueEmis) {
            try {
                await emiService.applyOverduePenalty(emi.emiId);
                stats.overdueEmisProcessed++;
                stats.penaltiesApplied++;
            } catch (err) {
                stats.errors++;
                log.error('Penalty application failed', {
                    emiId: emi.emiId,
                    error: (err as Error).message,
                });
            }
        }

        // ── Step 2: Mark loans NPA (90+ DPD) ──────────────────────────────────────
        const npaEligible = await prisma.$queryRaw<Array<{
            loan_account_id: string;
            user_id: string;
            overdue_days: number;
            overdue_amount: number;
        }>>`
      SELECT
        la.id                                         AS loan_account_id,
        la.user_id,
        MAX(EXTRACT(DAY FROM NOW() - es.due_date))::int AS overdue_days,
        SUM(es.emi_amount + COALESCE(es.penalty_amount, 0))::numeric AS overdue_amount
      FROM loan_accounts la
      JOIN emi_schedule es ON es.loan_account_id = la.id
      WHERE
        la.status   = 'ACTIVE'
        AND es.status IN ('OVERDUE', 'BOUNCED', 'PENDING')
        AND es.due_date < NOW() - INTERVAL '${BUSINESS_RULES.NPA_TRIGGER_DAYS} days'
      GROUP BY la.id, la.user_id
      HAVING MAX(EXTRACT(DAY FROM NOW() - es.due_date)) >= ${BUSINESS_RULES.NPA_TRIGGER_DAYS}
    `;

        for (const row of npaEligible) {
            try {
                const fakeReq = {
                    requestId: `job:npa:${row.loan_account_id}`,
                    requestLogger: log,
                    user: null,
                    auditContext: {},
                } as unknown as import('express').Request;

                await loansService.markNpa(
                    row.loan_account_id,
                    row.overdue_days,
                    roundRupees(toNumber(row.overdue_amount)),
                    fakeReq,
                );

                stats.loansMarkedNpa++;

                log.warn('Loan marked NPA', {
                    loanAccountId: row.loan_account_id,
                    overdueDays: row.overdue_days,
                    overdueAmount: row.overdue_amount,
                });

            } catch (err) {
                // Might already be NPA — not an error
                if (!(err as Error).message?.includes('INVALID_LOAN_STATE')) {
                    stats.errors++;
                    log.error('NPA marking failed', {
                        loanAccountId: row.loan_account_id,
                        error: (err as Error).message,
                    });
                }
            }
        }

        // ── Step 3: Auto-open collection cases for 30+ DPD loans ─────────────────
        const caseResult = await collectionsService.autoOpenCasesForOverdueLoans();
        stats.casesOpened += caseResult.opened;
        stats.casesUpdated += caseResult.skipped;

        // ── Step 4: Mark broken PTPs ──────────────────────────────────────────────
        stats.ptpsBroken = await collectionsService.markBrokenPtps();

        if (stats.ptpsBroken > 0) {
            log.warn('Broken PTPs marked', { count: stats.ptpsBroken });
        }

        // ── Step 5: Send overdue notifications ────────────────────────────────────
        // EMIs 3+ days overdue get a reminder SMS
        const overdueNotificationTargets = overdueEmis.filter(
            (e) => e.overdueDays >= 3 && e.overdueDays % 3 === 0, // Every 3 days
        );

        const { notificationsService } = await import('@/modules/notifications');
        for (const target of overdueNotificationTargets) {
            try {
                const recipient = await notificationsService.resolveRecipient(
                    target.userId,
                );
                const account = await prisma.loan_accounts.findUnique({
                    where: { id: target.loanAccountId },
                    select: { account_number: true },
                });

                await notificationsService.dispatch({
                    template: 'EMI_OVERDUE',
                    variables: {
                        customerName: recipient.phone ?? 'Customer',
                        overdueDays: target.overdueDays,
                        emiAmount: target.emiAmount,
                        penaltyAmount: target.penaltyAmount,
                        totalDue: roundRupees(target.emiAmount + target.penaltyAmount),
                        accountNumber: (account?.account_number as string) ?? '',
                    },
                    channels: ['SMS'],
                    recipient,
                    dedupeKey: `emi_overdue:${target.emiId}:${new Date().toDateString()}`,
                    dedupeTtl: 86400,
                });
            } catch (err) {
                log.error('Overdue notification failed', {
                    emiId: target.emiId,
                    error: (err as Error).message,
                });
            }
        }

        const durationMs = Date.now() - jobStart;
        log.info('NPA watch job completed', { ...stats, durationMs });

    } catch (err) {
        log.error('NPA watch job crashed', {
            error: (err as Error).message,
            stack: (err as Error).stack,
            stats,
            durationMs: Date.now() - jobStart,
        });
    }
}

export function scheduleNpaWatchJob(): cron.ScheduledTask {
    log.info('NPA watch job scheduled', {
        schedule: CRON_SCHEDULE.NPA_WATCH,
    });
    return cron.schedule(CRON_SCHEDULE.NPA_WATCH, runNpaWatchJob, {
        timezone: 'Asia/Kolkata',
    });
}
