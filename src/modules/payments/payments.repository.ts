// src/modules/payments/payments.repository.ts
import { prisma } from '@/config/database';
import { withTransaction } from '@/config/database';
import { createModuleLogger } from '@/config/logger';
import {
    PAYMENT_STATUS,
    PAGINATION,
} from '@/config/constants';
import type { PaymentStatus, PaymentChannel } from '@/config/constants';
import {
    toNumber,
    toPrismaPage,
    buildPaginationMeta,
} from '@/types/common.types';
import type { PaginatedResult } from '@/types/common.types';
import { NotFoundError } from '@/errors';
import type {
    PaymentRecord,
    MandateRecord,
    PaymentType,
    MandateStatus,
    ListPaymentsInput,
} from './payments.types';
import type { Rupees } from '@/types/common.types';

const log = createModuleLogger('payments.repository');

// ─── Mappers ──────────────────────────────────────────────────────────────────

function mapPayment(row: Record<string, unknown>): PaymentRecord {
    return {
        id: row.id as string,
        loanAccountId: row.loan_account_id as string,
        userId: row.user_id as string,
        emiId: row.emi_id as string | null,
        paymentType: row.payment_type as PaymentType,
        amount: toNumber(row.amount as number),
        penaltyAmount: toNumber(row.penalty_amount as number),
        totalCollected: toNumber(row.total_collected as number),
        channel: row.channel as PaymentChannel,
        gateway: row.gateway as string,
        gatewayTxnId: row.gateway_txn_id as string | null,
        utrNumber: row.utr_number as string | null,
        status: row.status as PaymentStatus,
        failureReason: row.failure_reason as string | null,
        failureCode: row.failure_code as string | null,
        mandateId: row.mandate_id as string | null,
        debitAttemptNo: (row.debit_attempt_no as number) ?? 1,
        initiatedAt: row.initiated_at as Date,
        settledAt: row.settled_at as Date | null,
        createdAt: row.created_at as Date,
        updatedAt: row.updated_at as Date,
    };
}

function mapMandate(row: Record<string, unknown>): MandateRecord {
    return {
        id: row.id as string,
        loanAccountId: row.loan_account_id as string,
        userId: row.user_id as string,
        razorpayMandateId: row.razorpay_mandate_id as string,
        bankAccount: row.bank_account as string,
        ifsc: row.ifsc as string,
        maxAmount: toNumber(row.max_amount as number),
        status: row.status as MandateStatus,
        registeredAt: row.registered_at as Date | null,
        cancelledAt: row.cancelled_at as Date | null,
        createdAt: row.created_at as Date,
        updatedAt: row.updated_at as Date,
    };
}

// ─── Repository ────────────────────────────────────────────────────────────────

export const paymentsRepository = {

    // ── Payment CRUD ──────────────────────────────────────────────────────────

    async createPayment(data: {
        loanAccountId: string;
        userId: string;
        emiId: string | null;
        paymentType: PaymentType;
        amount: Rupees;
        penaltyAmount: Rupees;
        channel: PaymentChannel;
        gateway: string;
        gatewayTxnId?: string;
        mandateId?: string;
        debitAttemptNo: number;
        status: PaymentStatus;
    }): Promise<PaymentRecord> {
        const row = await prisma.payments.create({
            data: {
                loan_account_id: data.loanAccountId,
                user_id: data.userId,
                emi_id: data.emiId,
                payment_type: data.paymentType,
                amount: data.amount,
                penalty_amount: data.penaltyAmount,
                total_collected: data.amount + data.penaltyAmount,
                channel: data.channel,
                gateway: data.gateway,
                gateway_txn_id: data.gatewayTxnId ?? null,
                mandate_id: data.mandateId ?? null,
                debit_attempt_no: data.debitAttemptNo,
                status: data.status,
                initiated_at: new Date(),
                created_at: new Date(),
                updated_at: new Date(),
            },
        });
        return mapPayment(row as unknown as Record<string, unknown>);
    },

    async findPaymentById(id: string): Promise<PaymentRecord | null> {
        const row = await prisma.payments.findUnique({ where: { id } });
        return row ? mapPayment(row as unknown as Record<string, unknown>) : null;
    },

    async findPaymentByIdOrThrow(id: string): Promise<PaymentRecord> {
        const p = await this.findPaymentById(id);
        if (!p) throw new NotFoundError('Payment', id);
        return p;
    },

    // ── Idempotency — find by gateway transaction ID ──────────────────────────
    // Critical: prevents double-processing of the same Razorpay webhook

    async findByGatewayTxnId(
        gatewayTxnId: string,
    ): Promise<PaymentRecord | null> {
        const row = await prisma.payments.findFirst({
            where: { gateway_txn_id: gatewayTxnId },
        });
        return row ? mapPayment(row as unknown as Record<string, unknown>) : null;
    },

    async markPaymentSuccess(
        id: string,
        utrNumber: string | null,
        settledAt: Date,
    ): Promise<PaymentRecord> {
        const row = await prisma.payments.update({
            where: { id },
            data: {
                status: PAYMENT_STATUS.SUCCESS,
                utr_number: utrNumber,
                settled_at: settledAt,
                updated_at: new Date(),
            },
        });
        return mapPayment(row as unknown as Record<string, unknown>);
    },

    async markPaymentFailed(
        id: string,
        reason: string,
        failureCode?: string,
    ): Promise<PaymentRecord> {
        const row = await prisma.payments.update({
            where: { id },
            data: {
                status: PAYMENT_STATUS.FAILED,
                failure_reason: reason,
                failure_code: failureCode ?? null,
                updated_at: new Date(),
            },
        });
        return mapPayment(row as unknown as Record<string, unknown>);
    },

    async listPayments(
        input: ListPaymentsInput,
    ): Promise<PaginatedResult<PaymentRecord>> {
        const where: Record<string, unknown> = {};
        if (input.loanAccountId) where.loan_account_id = input.loanAccountId;
        if (input.userId) where.user_id = input.userId;
        if (input.status) where.status = input.status;
        if (input.channel) where.channel = input.channel;

        const [rows, total] = await prisma.$transaction([
            prisma.payments.findMany({
                where,
                orderBy: { initiated_at: 'desc' },
                ...toPrismaPage({ page: input.page, limit: input.limit }),
            }),
            prisma.payments.count({ where }),
        ]);

        return {
            data: rows.map(
                (r) => mapPayment(r as unknown as Record<string, unknown>),
            ),
            pagination: buildPaginationMeta(input.page, input.limit, total),
        };
    },

    // ── Mandate CRUD ──────────────────────────────────────────────────────────

    async createMandate(data: {
        loanAccountId: string;
        userId: string;
        razorpayMandateId: string;
        bankAccount: string;
        ifsc: string;
        maxAmount: Rupees;
    }): Promise<MandateRecord> {
        const row = await prisma.enach_mandates.create({
            data: {
                loan_account_id: data.loanAccountId,
                user_id: data.userId,
                razorpay_mandate_id: data.razorpayMandateId,
                bank_account: data.bankAccount,
                ifsc: data.ifsc,
                max_amount: data.maxAmount,
                status: 'CREATED',
                created_at: new Date(),
                updated_at: new Date(),
            },
        });
        return mapMandate(row as unknown as Record<string, unknown>);
    },

    async findMandateByLoanAccountId(
        loanAccountId: string,
    ): Promise<MandateRecord | null> {
        const row = await prisma.enach_mandates.findFirst({
            where: { loan_account_id: loanAccountId, status: 'ACTIVE' },
            orderBy: { created_at: 'desc' },
        });
        return row ? mapMandate(row as unknown as Record<string, unknown>) : null;
    },

    async findMandateByRazorpayId(
        razorpayMandateId: string,
    ): Promise<MandateRecord | null> {
        const row = await prisma.enach_mandates.findFirst({
            where: { razorpay_mandate_id: razorpayMandateId },
        });
        return row ? mapMandate(row as unknown as Record<string, unknown>) : null;
    },

    async updateMandateStatus(
        id: string,
        status: MandateStatus,
        extra?: Record<string, unknown>,
    ): Promise<MandateRecord> {
        const row = await prisma.enach_mandates.update({
            where: { id },
            data: {
                status,
                ...extra,
                updated_at: new Date(),
            },
        });
        return mapMandate(row as unknown as Record<string, unknown>);
    },

    // ── Stats for jobs ─────────────────────────────────────────────────────────

    async countSuccessfulPaymentsForLoan(
        loanAccountId: string,
    ): Promise<number> {
        return prisma.payments.count({
            where: {
                loan_account_id: loanAccountId,
                status: PAYMENT_STATUS.SUCCESS,
            },
        });
    },
};
