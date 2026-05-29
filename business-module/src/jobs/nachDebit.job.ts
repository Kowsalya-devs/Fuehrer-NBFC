// src/jobs/emiReminder.job.ts
import cron from 'node-cron';
import { emiService } from '@/modules/emi';
import { notificationsService } from '@/modules/notifications';
import { createModuleLogger } from '@/config/logger';
import { CRON_SCHEDULE } from '@/config/constants';
import { prisma } from '@/config/database';
import { toNumber } from '@/types/common.types';

const log = createModuleLogger('job:emiReminder');

// ─── Job logic ─────────────────────────────────────────────────────────────────

export async function runEmiReminderJob(): Promise<void> {
    const jobStart = Date.now();
    log.info('EMI reminder job started');

    let sent3Day = 0;
    let sent1Day = 0;
    let sentToday = 0;
    let errors = 0;

    try {
        const today = new Date();

        // Fetch all three reminder buckets concurrently
        const [targets3Day, targets1Day, targetsDueToday] = await Promise.all([
            emiService.getReminders(today, 3),
            emiService.getReminders(today, 1),
            emiService.getReminders(today, 0),
        ]);

        // ── 3-day reminders ──────────────────────────────────────────────────────
        for (const target of targets3Day) {
            // Skip if also in the 1-day bucket — avoid double notification
            const isAlso1Day = targets1Day.some((t) => t.emiId === target.emiId);
            if (isAlso1Day) continue;

            try {
                const recipient = await notificationsService.resolveRecipient(
                    target.userId,
                );

                // Fetch account number for the SMS template
                const account = await prisma.loan_accounts.findUnique({
                    where: { id: target.loanAccountId },
                    select: { account_number: true },
                });

                await notificationsService.dispatch({
                    template: 'EMI_REMINDER_3_DAYS',
                    variables: {
                        customerName: recipient.phone ?? 'Customer',
                        emiAmount: target.emiAmount,
                        dueDate: target.dueDate.toLocaleDateString('en-IN'),
                        accountNumber: (account?.account_number as string) ?? '',
                    },
                    channels: ['SMS', 'PUSH'],
                    recipient,
                    // Deduplication: one 3-day reminder per EMI per day
                    dedupeKey: `emi_reminder_3d:${target.emiId}:${today.toDateString()}`,
                    dedupeTtl: 86400,
                });

                sent3Day++;
            } catch (err) {
                errors++;
                log.error('3-day reminder failed', {
                    emiId: target.emiId,
                    userId: target.userId,
                    error: (err as Error).message,
                });
            }
        }

        // ── 1-day reminders ──────────────────────────────────────────────────────
        for (const target of targets1Day) {
            const isAlsoToday = targetsDueToday.some((t) => t.emiId === target.emiId);
            if (isAlsoToday) continue;

            try {
                const recipient = await notificationsService.resolveRecipient(
                    target.userId,
                );
                const account = await prisma.loan_accounts.findUnique({
                    where: { id: target.loanAccountId },
                    select: { account_number: true },
                });

                await notificationsService.dispatch({
                    template: 'EMI_REMINDER_1_DAY',
                    variables: {
                        customerName: recipient.phone ?? 'Customer',
                        emiAmount: target.emiAmount,
                        dueDate: target.dueDate.toLocaleDateString('en-IN'),
                        accountNumber: (account?.account_number as string) ?? '',
                    },
                    channels: ['SMS', 'PUSH'],
                    recipient,
                    dedupeKey: `emi_reminder_1d:${target.emiId}:${today.toDateString()}`,
                    dedupeTtl: 86400,
                });

                sent1Day++;
            } catch (err) {
                errors++;
                log.error('1-day reminder failed', {
                    emiId: target.emiId,
                    error: (err as Error).message,
                });
            }
        }

        // ── Due today ─────────────────────────────────────────────────────────────
        for (const target of targetsDueToday) {
            try {
                const recipient = await notificationsService.resolveRecipient(
                    target.userId,
                );
                const account = await prisma.loan_accounts.findUnique({
                    where: { id: target.loanAccountId },
                    select: { account_number: true },
                });

                await notificationsService.dispatch({
                    template: 'EMI_DUE_TODAY',
                    variables: {
                        customerName: recipient.phone ?? 'Customer',
                        emiAmount: target.emiAmount,
                        accountNumber: (account?.account_number as string) ?? '',
                    },
                    channels: ['SMS', 'PUSH'],
                    recipient,
                    dedupeKey: `emi_due_today:${target.emiId}:${today.toDateString()}`,
                    dedupeTtl: 86400,
                });

                sentToday++;
            } catch (err) {
                errors++;
                log.error('Due today reminder failed', {
                    emiId: target.emiId,
                    error: (err as Error).message,
                });
            }
        }

        const durationMs = Date.now() - jobStart;
        log.info('EMI reminder job completed', {
            sent3Day,
            sent1Day,
            sentToday,
            errors,
            durationMs,
        });

    } catch (err) {
        log.error('EMI reminder job crashed', {
            error: (err as Error).message,
            stack: (err as Error).stack,
            durationMs: Date.now() - jobStart,
        });
    }
}

// ─── Scheduler ────────────────────────────────────────────────────────────────

export function scheduleEmiReminderJob(): cron.ScheduledTask {
    log.info('EMI reminder job scheduled', {
        schedule: CRON_SCHEDULE.EMI_REMINDER,
    });

    return cron.schedule(CRON_SCHEDULE.EMI_REMINDER, runEmiReminderJob, {
        timezone: 'Asia/Kolkata',
    });
}
