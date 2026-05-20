// src/modules/disbursement/disbursement.repository.ts
import { prisma } from '@/config/database';
import { withTransaction } from '@/config/database';
import { createModuleLogger } from '@/config/logger';
import { toNumber } from '@/types/common.types';
import { NotFoundError } from '@/errors';
import type {
    DisbursementRecord,
    DisbursementStatus,
} from './disbursement.types';
import type { DisbursementMode } from '@/config/constants';

const log = createModuleLogger('disbursement.repository');

// ─── Mapper ───────────────────────────────────────────────────────────────────

function mapRecord(row: Record<string, unknown>): DisbursementRecord {
    return {
        id: row.id as string,
        loanId: row.loan_id as string,
        loanAccountId: row.loan_account_id as string | null,
        userId: row.user_id as string,
        beneficiaryName: row.beneficiary_name as string,
        accountNumber: row.account_number as string,
        ifsc: row.ifsc as string,
        mode: row.mode as DisbursementMode,
        principalAmount: toNumber(row.principal_amount as number),
        processingFee: toNumber(row.processing_fee as number),
        processingFeeGst: toNumber(row.processing_fee_gst as number),
        netDisbursedAmount: toNumber(row.net_disbursed_amount as number),
        razorpayPayoutId: row.razorpay_payout_id as string | null,
        utrNumber: row.utr_number as string | null,
        status: row.status as DisbursementStatus,
        failureReason: row.failure_reason as string | null,
        initiatedBy: row.initiated_by as string,
        initiatedAt: row.initiated_at as Date,
        completedAt: row.completed_at as Date | null,
        createdAt: row.created_at as Date,
        updatedAt: row.updated_at as Date,
    };
}

// ─── Repository ────────────────────────────────────────────────────────────────

export const disbursementRepository = {

    // ── Create pending record ─────────────────────────────────────────────────
    // Written before the payout call — ensures we have an audit trail even if
    // the API call hangs or times out

    async create(data: Omit
    DisbursementRecord,
    | 'id'
    | 'loanAccountId'
    | 'razorpayPayoutId'
    | 'utrNumber'
    | 'completedAt'
    | 'failureReason'
    | 'createdAt'
    | 'updatedAt'
  >): Promise<DisbursementRecord>{
    const row = await prisma.disbursements.create({
        data: {
            loan_id: data.loanId,
            loan_account_id: null,
            user_id: data.userId,
            beneficiary_name: data.beneficiaryName,
            account_number: data.accountNumber,
            ifsc: data.ifsc,
            mode: data.mode,
            principal_amount: data.principalAmount,
            processing_fee: data.processingFee,
            processing_fee_gst: data.processingFeeGst,
            net_disbursed_amount: data.netDisbursedAmount,
            status: data.status,
            initiated_by: data.initiatedBy,
            initiated_at: data.initiatedAt,
            created_at: new Date(),
            updated_at: new Date(),
        },
    });

    log.info('Disbursement record created', {
        id: row.id,
        loanId: data.loanId,
        amount: data.netDisbursedAmount,
    });

    return mapRecord(row as unknown as Record<string, unknown>);
},

    // ── Find ──────────────────────────────────────────────────────────────────

    async findById(id: string): Promise < DisbursementRecord | null > {
        const row = await prisma.disbursements.findUnique({ where: { id } });
        return row ? mapRecord(row as unknown as Record<string, unknown>) : null;
    },

        async findByIdOrThrow(id: string): Promise < DisbursementRecord > {
            const record = await this.findById(id);
            if(!record) throw new NotFoundError('Disbursement', id);
            return record;
        },

            async findByLoanId(loanId: string): Promise < DisbursementRecord | null > {
                const row = await prisma.disbursements.findFirst({
                    where: { loan_id: loanId },
                    orderBy: { created_at: 'desc' },
                });
                return row ? mapRecord(row as unknown as Record<string, unknown>) : null;
            },

                async findByPayoutId(
                    razorpayPayoutId: string,
                ): Promise < DisbursementRecord | null > {
                    const row = await prisma.disbursements.findFirst({
                        where: { razorpay_payout_id: razorpayPayoutId },
                    });
                    return row ? mapRecord(row as unknown as Record<string, unknown>) : null;
                },

                    async existsCompletedForLoan(loanId: string): Promise < boolean > {
                        const count = await prisma.disbursements.count({
                            where: {
                                loan_id: loanId,
                                status: { in: ['COMPLETED', 'IN_TRANSIT', 'INITIATED'] },
                            },
                        });
                        return count > 0;
                    },

                        // ── Status transitions ─────────────────────────────────────────────────────

                        async markInitiated(
                            id: string,
                            razorpayPayoutId: string,
                        ): Promise < DisbursementRecord > {
                            const row = await prisma.disbursements.update({
                                where: { id },
                                data: {
                                    status: 'INITIATED',
                                    razorpay_payout_id: razorpayPayoutId,
                                    updated_at: new Date(),
                                },
                            });
                            return mapRecord(row as unknown as Record<string, unknown>);
                        },

                            async markInTransit(
                                id: string,
                                razorpayPayoutId: string,
                            ): Promise < DisbursementRecord > {
                                const row = await prisma.disbursements.update({
                                    where: { id },
                                    data: {
                                        status: 'IN_TRANSIT',
                                        razorpay_payout_id: razorpayPayoutId,
                                        updated_at: new Date(),
                                    },
                                });
                                return mapRecord(row as unknown as Record<string, unknown>);
                            },

                                // ── Completion — atomic: set UTR + link loanAccountId together ────────────

                                async markCompleted(
                                    id: string,
                                    utrNumber: string,
                                    loanAccountId: string,
                                ): Promise < DisbursementRecord > {
                                    const row = await prisma.disbursements.update({
                                        where: { id },
                                        data: {
                                            status: 'COMPLETED',
                                            utr_number: utrNumber,
                                            loan_account_id: loanAccountId,
                                            completed_at: new Date(),
                                            updated_at: new Date(),
                                        },
                                    });

                                    log.info('Disbursement completed', {
                                        id,
                                        loanAccountId,
                                        utrNumber,
                                    });

                                    return mapRecord(row as unknown as Record<string, unknown>);
                                },

                                    async markFailed(
                                        id: string,
                                        reason: string,
                                    ): Promise < DisbursementRecord > {
                                        const row = await prisma.disbursements.update({
                                            where: { id },
                                            data: {
                                                status: 'FAILED',
                                                failure_reason: reason,
                                                updated_at: new Date(),
                                            },
                                        });

                                        log.warn('Disbursement failed', { id, reason });

                                        return mapRecord(row as unknown as Record<string, unknown>);
                                    },

                                        async markReversed(id: string): Promise < DisbursementRecord > {
                                            const row = await prisma.disbursements.update({
                                                where: { id },
                                                data: {
                                                    status: 'REVERSED',
                                                    updated_at: new Date(),
                                                },
                                            });
                                            return mapRecord(row as unknown as Record<string, unknown>);
                                        },
};