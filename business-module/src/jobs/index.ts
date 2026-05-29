// src/jobs/settlement.job.ts
import cron from 'node-cron';
import { prisma } from '@/config/database';
import { emiService } from '@/modules/emi';
import { createModuleLogger } from '@/config/logger';
import { CRON_SCHEDULE } from '@/config/constants';
import { toNumber } from '@/types/common.types';

const log = createModuleLogger('job:settlement');

export async function runSettlementJob(): Promise<void> {
    const jobStart = Date.now();
    log.info('Settlement job started');

    const stats = {
        stalePaymentsResolved: 0,
        orphanedAccountsRecovered: 0,
        staleDisbursementsDetected: 0,
        errors: 0,
    };

    try {

        // ── Step 1: Resolve stale PENDING payments ────────────────────────────────
        // Payments in PENDING for more than 10 minutes need reconciliation.
        // These are payments where the gateway call succeeded but the webhook
        // has not arrived yet — or the webhook failed silently.

        const stalePayments = await prisma.payments.findMany({
            where: {
                status: 'PENDING',
                initiated_at: {
                    lt: new Date(Date.now() - 10 * 60 * 1000),
                },
            },
            select: {
                id: true,
                gateway_txn_id: true,
                emi_id: true,
                loan_account_id: true,
                amount: true,
            },
            take: 100,
        });

        log.info(`Settlement: ${stalePayments.length} stale payments to reconcile`);

        for (const payment of stalePayments) {
            try {
                // If no gateway transaction ID, mark as failed
                if (!payment.gateway_txn_id) {
                    await prisma.payments.update({
                        where: { id: payment.id },
                        data: {
                            status: 'FAILED',
                            failure_reason: 'No gateway transaction ID after timeout',
                            updated_at: new Date(),
                        },
                    });
                    stats.stalePaymentsResolved++;
                    continue;
                }

                // Check if the associated EMI was somehow marked paid by another path
                if (payment.emi_id) {
                    const emi = await prisma.emi_schedule.findUnique({
                        where: { id: payment.emi_id },
                        select: { status: true },
                    });

                    if (emi?.status === 'PAID') {
                        // EMI is paid — mark the payment as success
                        await prisma.payments.update({
                            where: { id: payment.id },
                            data: {
                                status: 'SUCCESS',
                                settled_at: new Date(),
                                updated_at: new Date(),
                            },
                        });
                        stats.stalePaymentsResolved++;
                        log.info('Stale payment resolved via EMI status', {
                            paymentId: payment.id,
                        });
                        continue;
                    }
                }

                // Otherwise mark as failed — will be retried by debitRetry job
                await prisma.payments.update({
                    where: { id: payment.id },
                    data: {
                        status: 'FAILED',
                        failure_reason: 'Reconciliation timeout — no webhook received',
                        updated_at: new Date(),
                    },
                });

                stats.stalePaymentsResolved++;

            } catch (err) {
                stats.errors++;
                log.error('Stale payment reconciliation failed', {
                    paymentId: payment.id,
                    error: (err as Error).message,
                });
            }
        }

        // ── Step 2: Detect orphaned loan accounts (no EMI schedule) ───────────────
        // Can happen if EMI schedule creation failed after the account was created.

        const orphanedAccounts = await prisma.$queryRaw<Array<{
            id: string;
            monthly_emi: number;
            principal_amount: number;
            interest_rate: number;
            tenure_months: number;
            disbursed_at: Date;
        }>>`
      SELECT
        la.id,
        la.monthly_emi::numeric,
        la.principal_amount::numeric,
        la.interest_rate::numeric,
        la.tenure_months,
        la.disbursed_at
      FROM loan_accounts la
      WHERE
        la.status IN ('ACTIVE', 'DISBURSED')
        AND la.monthly_emi = 0
        AND la.disbursed_at IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM emi_schedule es
          WHERE es.loan_account_id = la.id
        )
    `;

        if (orphanedAccounts.length > 0) {
            log.warn('Orphaned loan accounts detected', {
                count: orphanedAccounts.length,
                ids: orphanedAccounts.map((a) => a.id),
            });

            for (const account of orphanedAccounts) {
                try {
                    // Regenerate the EMI schedule
                    const schedule = await emiService.createSchedule({
                        loanAccountId: account.id,
                        principal: toNumber(account.principal_amount),
                        annualRatePct: toNumber(account.interest_rate),
                        tenureMonths: account.tenure_months,
                        disbursementDate: account.disbursed_at,
                    });

                    // Update the loan account with the correct EMI amount
                    await prisma.loan_accounts.update({
                        where: { id: account.id },
                        data: {
                            monthly_emi: schedule.monthlyEmi,
                            total_interest: schedule.totalInterest,
                            outstanding_balance: toNumber(account.principal_amount) +
                                schedule.totalInterest,
                            updated_at: new Date(),
                        },
                    });

                    stats.orphanedAccountsRecovered++;

                    log.info('Orphaned account recovered', {
                        accountId: account.id,
                        monthlyEmi: schedule.monthlyEmi,
                    });

                } catch (err) {
                    stats.errors++;
                    log.error('Orphaned account recovery failed', {
                        accountId: account.id,
                        error: (err as Error).message,
                    });
                }
            }
        }

        // ── Step 3: Detect stale INITIATED disbursements ──────────────────────────
        // Disbursements in INITIATED/IN_TRANSIT for more than 24 hours
        // without a webhook are flagged for manual review.

        const staleDisbursements = await prisma.disbursements.findMany({
            where: {
                status: { in: ['INITIATED', 'IN_TRANSIT'] },
                initiated_at: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
            },
            select: {
                id: true,
                loan_id: true,
                razorpay_payout_id: true,
                net_disbursed_amount: true,
                initiated_at: true,
            },
        });

        if (staleDisbursements.length > 0) {
            stats.staleDisbursementsDetected = staleDisbursements.length;

            log.warn('Stale disbursements detected — require manual review', {
                count: staleDisbursements.length,
                ids: staleDisbursements.map((d) => d.id),
            });

            // Alert via audit log — these need finance team intervention
            await prisma.audit_logs.createMany({
                data: staleDisbursements.map((d) => ({
                    action: 'DISBURSEMENT_STALE_ALERT',
                    entity_type: 'disbursements',
                    entity_id: d.id,
                    request_id: `job:settlement:stale:${d.id}`,
                    after_state: JSON.stringify({
                        loanId: d.loan_id,
                        payoutId: d.razorpay_payout_id,
                        amount: d.net_disbursed_amount,
                        initiatedAt: d.initiated_at,
                        staleSinceHours: 24,
                    }),
                    created_at: new Date(),
                })),
            });
        }

        const durationMs = Date.now() - jobStart;
        log.info('Settlement job completed', { ...stats, durationMs });

    } catch (err) {
        log.error('Settlement job crashed', {
            error: (err as Error).message,
            stack: (err as Error).stack,
            durationMs: Date.now() - jobStart,
        });
    }
}

export function scheduleSettlementJob(): cron.ScheduledTask {
    log.info('Settlement job scheduled', {
        schedule: CRON_SCHEDULE.SETTLEMENT,
    });
    return cron.schedule(CRON_SCHEDULE.SETTLEMENT, runSettlementJob, {
        timezone: 'Asia/Kolkata',
    });
}
