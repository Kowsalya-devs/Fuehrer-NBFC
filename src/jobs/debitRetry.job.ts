// src/jobs/debitRetry.job.ts
import cron from 'node-cron';
import { prisma } from '@/config/database';
import { paymentsService } from '@/modules/payments';
import { createModuleLogger } from '@/config/logger';
import { CRON_SCHEDULE, BUSINESS_RULES, EMI_STATUS } from '@/config/constants';
import { toNumber } from '@/types/common.types';

const log = createModuleLogger('job:debitRetry');

export async function runDebitRetryJob(): Promise<void> {
    const jobStart = Date.now();
    log.info('Debit retry job started');

    let retried = 0;
    let succeeded = 0;
    let failed = 0;

    try {
        const now = new Date();

        // Find bounced EMIs that are eligible for retry
        const bouncedEmis = await prisma.emi_schedule.findMany({
            where: {
                status: EMI_STATUS.BOUNCED,
                next_retry_at: { lte: now },
                bounce_count: { lt: BUSINESS_RULES.ENACH_RETRY_LIMIT },
            },
            include: {
                loan_account: {
                    select: {
                        id: true,
                        user_id: true,
                        razorpay_mandate_id: true,
                        status: true,
                    },
                },
            },
            take: 200,  // Process max 200 retries per run
        });

        log.info(`Debit retry: ${bouncedEmis.length} EMIs eligible for retry`);

        for (const emi of bouncedEmis) {
            const account = emi.loan_account;

            // Skip if loan is no longer active
            if (!account || !['ACTIVE', 'DISBURSED'].includes(account.status as string)) {
                continue;
            }

            // Skip if mandate is not available
            if (!account.razorpay_mandate_id) {
                log.warn('Retry skipped — no mandate', { emiId: emi.id });
                continue;
            }

            retried++;

            try {
                const fakeReq = {
                    requestId: `job:retry:${emi.id}`,
                    requestLogger: log,
                    user: null,
                    auditContext: {},
                } as unknown as import('express').Request;

                await paymentsService.processNachDebit(
                    {
                        emiId: emi.id,
                        loanAccountId: account.id as string,
                        mandateId: account.razorpay_mandate_id as string,
                        amount: toNumber(emi.emi_amount as unknown as number),
                        penaltyAmount: toNumber(emi.penalty_amount as unknown as number),
                        description: `Retry debit EMI #${emi.emi_number} attempt ${(emi.bounce_count as number) + 1}`,
                    },
                    fakeReq,
                );

                succeeded++;

                log.info('Debit retry initiated', {
                    emiId: emi.id,
                    emiNumber: emi.emi_number,
                    retryCount: (emi.bounce_count as number) + 1,
                    loanAccount: account.id,
                });

            } catch (err) {
                failed++;
                log.error('Debit retry failed', {
                    emiId: emi.id,
                    error: (err as Error).message,
                });
            }

            await sleep(150);
        }

        log.info('Debit retry job completed', {
            retried,
            succeeded,
            failed,
            durationMs: Date.now() - jobStart,
        });

    } catch (err) {
        log.error('Debit retry job crashed', {
            error: (err as Error).message,
            stack: (err as Error).stack,
            durationMs: Date.now() - jobStart,
        });
    }
}

export function scheduleDebitRetryJob(): cron.ScheduledTask {
    log.info('Debit retry job scheduled', {
        schedule: CRON_SCHEDULE.DEBIT_RETRY,
    });
    return cron.schedule(CRON_SCHEDULE.DEBIT_RETRY, runDebitRetryJob, {
        timezone: 'Asia/Kolkata',
    });
}

function sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
}
