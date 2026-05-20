// src/modules/payments/payments.service.ts
import type { Request } from 'express';
import { paymentsRepository } from './payments.repository';
import { paymentEvents } from './payments.events';
import { emiRepository } from '@/modules/emi';
import { emiService } from '@/modules/emi';
import { loansRepository } from '@/modules/loans';
import { loansService } from '@/modules/loans';
import { getPaymentProvider } from '@/providers';
import { getRedisClient, RedisKeys, RedisTTL } from '@/config/redis';
import {
    PAYMENT_STATUS,
    PAYMENT_CHANNEL,
    AUDIT_ACTION,
    EMI_STATUS,
    BUSINESS_RULES,
    LOAN_STATUS,
} from '@/config/constants';
import {
    roundRupees,
    toNumber,
    parsePagination,
} from '@/types/common.types';
import { setAuditContext } from '@/middlewares';
import { allocatePartialPayment } from '@/modules/emi/emi.calculator';
import {
    NotFoundError,
    ConflictError,
    EmiAlreadyPaidError,
    PAYMENT_ERRORS,
    CONFLICT_ERRORS,
} from '@/errors';
import { createModuleLogger } from '@/config/logger';
import type {
    PaymentRecord,
    MandateRecord,
    PaymentResponse,
    MandateResponse,
    PaymentLinkResponse,
    CreateMandateInput,
    ProcessNachDebitInput,
    ManualPaymentLinkInput,
    RecordCashPaymentInput,
    RazorpayWebhookPayload,
    ListPaymentsInput,
} from './payments.types';

const log = createModuleLogger('payments.service');

// ─── Response shapers ──────────────────────────────────────────────────────────

function toPaymentResponse(p: PaymentRecord): PaymentResponse {
    return {
        id: p.id,
        loanAccountId: p.loanAccountId,
        emiId: p.emiId,
        paymentType: p.paymentType,
        amount: p.amount,
        penaltyAmount: p.penaltyAmount,
        totalCollected: p.totalCollected,
        channel: p.channel,
        status: p.status,
        utrNumber: p.utrNumber,
        failureReason: p.failureReason,
        initiatedAt: p.initiatedAt,
        settledAt: p.settledAt,
    };
}

function toMandateResponse(m: MandateRecord): MandateResponse {
    return {
        id: m.id,
        loanAccountId: m.loanAccountId,
        razorpayMandateId: m.razorpayMandateId,
        bankAccount: m.bankAccount,
        status: m.status,
        maxAmount: m.maxAmount,
        registeredAt: m.registeredAt,
    };
}

// ─── Service ───────────────────────────────────────────────────────────────────

export const paymentsService = {

    // ── 1. Create eNACH mandate ────────────────────────────────────────────────
    // Called after loan is activated (DISBURSED → ACTIVE).
    // Customer registers their bank account for monthly auto-debit.

    async createMandate(
        input: CreateMandateInput,
        req: Request,
    ): Promise<MandateResponse> {
        const { loanAccountId, userId } = input;

        // Prevent duplicate active mandates
        const existing = await paymentsRepository.findMandateByLoanAccountId(
            loanAccountId,
        );
        if (existing) {
            throw CONFLICT_ERRORS.mandateAlreadyActive(loanAccountId);
        }

        const account = await loansRepository.findAccountByIdOrThrow(loanAccountId);

        const provider = getPaymentProvider();

        const result = await provider.createMandate({
            customerId: userId,
            customerName: input.customerName,
            customerEmail: input.customerEmail,
            customerPhone: input.customerPhone,
            bankAccount: input.bankAccount,
            ifsc: input.ifsc,
            // Max debit = EMI + max possible penalty
            maxAmount: roundRupees(
                account.monthlyEmi * (1 + BUSINESS_RULES.EMI_BOUNCE_PENALTY_RATE * 3),
            ),
            loanAccountId,
        });

        // Mask account number for storage — never store full account in mandate table
        const maskedAccount = input.bankAccount.slice(-4).padStart(
            input.bankAccount.length, 'X',
        );

        const mandate = await paymentsRepository.createMandate({
            loanAccountId,
            userId,
            razorpayMandateId: result.mandateId,
            bankAccount: maskedAccount,
            ifsc: input.ifsc,
            maxAmount: account.monthlyEmi * 2,
        });

        // Update loan account with mandate ID
        await loansRepository.updateMandateId(loanAccountId, result.mandateId);

        setAuditContext(req, {
            action: 'MANDATE_CREATED',
            entityType: 'enach_mandates',
            entityId: mandate.id,
        });

        paymentEvents.mandateCreated({
            loanAccountId,
            userId,
            mandateId: result.mandateId,
            bankAccount: maskedAccount,
            requestId: req.requestId,
        });

        log.info('eNACH mandate created', {
            mandateId: mandate.id,
            loanAccountId,
            razorpayId: result.mandateId,
        });

        return toMandateResponse(mandate);
    },

    // ── 2. Process eNACH debit ─────────────────────────────────────────────────
    // Called by the nachDebit.job cron every morning.
    // Attempts to debit the customer's registered bank account.

    async processNachDebit(
        input: ProcessNachDebitInput,
        req: Request,
    ): Promise<PaymentResponse> {
        const { emiId, loanAccountId, mandateId, amount, penaltyAmount } = input;

        const emi = await emiRepository.findByIdOrThrow(emiId);

        if (emi.status === EMI_STATUS.PAID) {
            throw new EmiAlreadyPaidError(emi.id, emi.emiNumber);
        }

        const totalDebit = roundRupees(amount + penaltyAmount);

        // Write PENDING payment record before calling gateway
        const payment = await paymentsRepository.createPayment({
            loanAccountId,
            userId: emi.loanAccountId, // Resolved via account
            emiId,
            paymentType: 'EMI',
            amount,
            penaltyAmount,
            channel: PAYMENT_CHANNEL.ENACH,
            gateway: 'razorpay',
            mandateId,
            debitAttemptNo: emi.bounceCount + 1,
            status: PAYMENT_STATUS.PENDING,
        });

        const provider = getPaymentProvider();

        try {
            const result = await provider.debitMandate({
                mandateId,
                amount: totalDebit,
                emiId,
                description: input.description,
            });

            if (result.status === 'SUCCESS') {
                await paymentsRepository.markPaymentSuccess(
                    payment.id, null, new Date(),
                );
                // EMI marked paid via webhook — not here
                // Prevents marking paid before bank confirms
                log.info('NACH debit initiated successfully', {
                    paymentId: payment.id,
                    emiId,
                    amount: totalDebit,
                    razorpayId: result.paymentId,
                });
            }

            return toPaymentResponse(
                await paymentsRepository.findPaymentByIdOrThrow(payment.id),
            );

        } catch (err) {
            await paymentsRepository.markPaymentFailed(
                payment.id,
                (err as Error).message,
            );

            await emiService.applyBounce(emiId, (err as Error).message, req);

            throw err;
        }
    },

    // ── 3. Create manual payment link ─────────────────────────────────────────
    // For overdue EMIs where eNACH has exhausted retries.
    // Sends an SMS/WhatsApp link to the customer.

    async createPaymentLink(
        input: ManualPaymentLinkInput,
        req: Request,
    ): Promise<PaymentLinkResponse> {
        const emi = await emiRepository.findByIdOrThrow(input.emiId);

        if (emi.status === EMI_STATUS.PAID) {
            throw new EmiAlreadyPaidError(emi.id, emi.emiNumber);
        }

        const totalAmount = roundRupees(
            toNumber(emi.emiAmount) + toNumber(emi.penaltyAmount),
        );

        const provider = getPaymentProvider();

        const result = await provider.createPaymentLink({
            customerId: input.userId,
            customerName: input.customerName,
            customerPhone: input.customerPhone,
            amount: totalAmount,
            emiId: input.emiId,
            description: input.description,
            expiryMinutes: input.expiryMinutes,
        });

        log.info('Payment link created', {
            emiId: input.emiId,
            linkId: result.linkId,
            amount: totalAmount,
            expiresAt: result.expiresAt,
        });

        return {
            linkId: result.linkId,
            shortUrl: result.shortUrl,
            amount: totalAmount,
            expiresAt: result.expiresAt,
        };
    },

    // ── 4. Record cash / field collection payment ──────────────────────────────
    // Collection agents log offline payments (cash / UPI from customer).
    // No gateway involved — manual entry with collection case reference.

    async recordCashPayment(
        input: RecordCashPaymentInput,
        req: Request,
    ): Promise<PaymentResponse> {
        const { loanAccountId, userId, emiId, amount, collectedBy, collectionId } =
            input;

        const emi = await emiRepository.findByIdOrThrow(emiId);

        if (emi.status === EMI_STATUS.PAID) {
            throw new EmiAlreadyPaidError(emi.id, emi.emiNumber);
        }

        // Allocate payment: penalty first, then interest, then principal
        const allocation = allocatePartialPayment({
            paymentAmount: amount,
            penaltyDue: toNumber(emi.penaltyAmount),
            interestDue: toNumber(emi.interestComponent),
            principalDue: toNumber(emi.principalComponent),
        });

        const payment = await paymentsRepository.createPayment({
            loanAccountId,
            userId,
            emiId,
            paymentType: 'EMI',
            amount,
            penaltyAmount: allocation.penaltySettled,
            channel: PAYMENT_CHANNEL.CASH,
            gateway: 'manual',
            debitAttemptNo: 1,
            status: PAYMENT_STATUS.SUCCESS,
        });

        await paymentsRepository.markPaymentSuccess(payment.id, null, new Date());

        // Mark EMI paid with collection reference
        await emiService.markPaid(
            {
                emiId,
                paidAmount: amount,
                paidAt: new Date(),
                channel: 'CASH',
                collectionId,
            },
            req,
        );

        setAuditContext(req, {
            action: AUDIT_ACTION.PAYMENT_SUCCESS,
            entityType: 'payments',
            entityId: payment.id,
            after: {
                emiId,
                amount,
                channel: PAYMENT_CHANNEL.CASH,
                collectedBy,
                collectionId,
            },
        });

        paymentEvents.received({
            paymentId: payment.id,
            loanAccountId,
            userId,
            emiId,
            emiNumber: emi.emiNumber,
            amount,
            channel: PAYMENT_CHANNEL.CASH,
            gatewayTxnId: collectionId,
            paidAt: new Date(),
            requestId: req.requestId,
        });

        log.info('Cash payment recorded', {
            paymentId: payment.id,
            emiId,
            amount,
            collectedBy,
        });

        return toPaymentResponse(
            await paymentsRepository.findPaymentByIdOrThrow(payment.id),
        );
    },

    // ── 5. Process Razorpay webhook ────────────────────────────────────────────
    // Central webhook handler — called by webhooks module after signature
    // verification and idempotency check.
    // All payment events from Razorpay funnel through here.

    async processRazorpayWebhook(
        payload: RazorpayWebhookPayload,
        requestId: string,
    ): Promise<void> {
        const { event } = payload;

        log.info('Processing Razorpay webhook', { event, requestId });

        switch (event) {

            // ── Payment captured (manual link / UPI) ─────────────────────────────
            case 'payment.captured': {
                const entity = payload.payload.payment?.entity;
                if (!entity) return;
                await this._handlePaymentCaptured(entity, requestId);
                break;
            }

            // ── Payment failed ────────────────────────────────────────────────────
            case 'payment.failed': {
                const entity = payload.payload.payment?.entity;
                if (!entity) return;
                await this._handlePaymentFailed(entity, requestId);
                break;
            }

            // ── eNACH debit confirmed ─────────────────────────────────────────────
            case 'subscription.charged': {
                const entity = payload.payload.subscription?.entity;
                if (!entity) return;
                await this._handleNachCharged(
                    entity as Record<string, unknown>, requestId,
                );
                break;
            }

            // ── Mandate registered ────────────────────────────────────────────────
            case 'subscription.activated':
            case 'mandate.confirmed': {
                await this._handleMandateActivated(payload, requestId);
                break;
            }

            // ── Mandate cancelled ─────────────────────────────────────────────────
            case 'mandate.cancelled': {
                await this._handleMandateCancelled(payload, requestId);
                break;
            }

            default:
                log.debug('Unhandled Razorpay webhook event', { event });
        }
    },

    // ── Internal webhook handlers ──────────────────────────────────────────────

    async _handlePaymentCaptured(
        entity: Record<string, unknown>,
        requestId: string,
    ): Promise<void> {
        const gatewayTxnId = entity.id as string;

        // Idempotency check — Redis first, then DB fallback
        const redis = getRedisClient();
        const lockKey = RedisKeys.webhookProcessed(gatewayTxnId);
        const alreadyDone = await redis.get(lockKey);
        if (alreadyDone) {
            log.info('Webhook already processed (Redis cache)', { gatewayTxnId });
            return;
        }

        // DB idempotency check
        const existing = await paymentsRepository.findByGatewayTxnId(gatewayTxnId);
        if (existing?.status === PAYMENT_STATUS.SUCCESS) {
            await redis.setex(lockKey, RedisTTL.WEBHOOK_PROCESSED, '1');
            log.info('Webhook already processed (DB)', { gatewayTxnId });
            return;
        }

        // Extract EMI ID from Razorpay notes (set when creating the payment link)
        const emiId = (entity.notes as Record<string, string>)?.emiId;
        if (!emiId) {
            log.warn('Payment captured but no emiId in notes', { gatewayTxnId });
            return;
        }

        const emi = await emiRepository.findByIdOrThrow(emiId);
        if (emi.status === EMI_STATUS.PAID) {
            await redis.setex(lockKey, RedisTTL.WEBHOOK_PROCESSED, '1');
            return;
        }

        const amountRupees = roundRupees(
            toNumber(entity.amount as number) / 100,
        );
        const utrNumber = (entity.acquirer_data as Record<string, string>)?.rrn
            ?? null;

        // Find or create the payment record
        let payment = existing;
        if (!payment) {
            payment = await paymentsRepository.createPayment({
                loanAccountId: emi.loanAccountId,
                userId: '', // Resolved from EMI → loan account
                emiId,
                paymentType: 'EMI',
                amount: amountRupees,
                penaltyAmount: 0,
                channel: PAYMENT_CHANNEL.PAYMENT_LINK,
                gateway: 'razorpay',
                gatewayTxnId,
                debitAttemptNo: 1,
                status: PAYMENT_STATUS.PENDING,
            });
        }

        // Mark payment successful
        await paymentsRepository.markPaymentSuccess(
            payment.id, utrNumber, new Date(),
        );

        // Mark EMI paid
        await emiService.markPaid(
            {
                emiId,
                paidAmount: amountRupees,
                paidAt: new Date(),
                channel: PAYMENT_CHANNEL.PAYMENT_LINK,
            },
            { requestId } as unknown as Request,
        );

        // Cache processed status
        await redis.setex(lockKey, RedisTTL.WEBHOOK_PROCESSED, '1');

        // Resolve userId for event
        const account = await loansRepository.findAccountByIdOrThrow(
            emi.loanAccountId,
        );

        paymentEvents.received({
            paymentId: payment.id,
            loanAccountId: emi.loanAccountId,
            userId: account.userId,
            emiId,
            emiNumber: emi.emiNumber,
            amount: amountRupees,
            channel: PAYMENT_CHANNEL.PAYMENT_LINK,
            gatewayTxnId,
            paidAt: new Date(),
            requestId,
        });

        log.info('Payment captured and EMI marked paid', {
            gatewayTxnId,
            emiId,
            amount: amountRupees,
        });
    },

    async _handlePaymentFailed(
        entity: Record<string, unknown>,
        requestId: string,
    ): Promise<void> {
        const gatewayTxnId = entity.id as string;

        const existing = await paymentsRepository.findByGatewayTxnId(gatewayTxnId);
        if (!existing || existing.status === PAYMENT_STATUS.FAILED) return;

        await paymentsRepository.markPaymentFailed(
            existing.id,
            entity.error_description as string ?? 'Payment failed',
            entity.error_code as string ?? undefined,
        );

        const emiId = (entity.notes as Record<string, string>)?.emiId;
        if (!emiId) return;

        const emi = await emiRepository.findByIdOrThrow(emiId);
        const account = await loansRepository.findAccountByIdOrThrow(
            emi.loanAccountId,
        );

        paymentEvents.failed({
            paymentId: existing.id,
            loanAccountId: emi.loanAccountId,
            userId: account.userId,
            emiId,
            emiNumber: emi.emiNumber,
            amount: toNumber(emi.emiAmount),
            reason: entity.error_description as string ?? 'Unknown failure',
            gatewayCode: entity.error_code as string ?? null,
            requestId,
        });
    },

    async _handleNachCharged(
        entity: Record<string, unknown>,
        requestId: string,
    ): Promise<void> {
        // Razorpay subscription.charged → eNACH debit succeeded
        const razorpayPaymentId = entity.payment_id as string;
        if (!razorpayPaymentId) return;

        const existing = await paymentsRepository.findByGatewayTxnId(
            razorpayPaymentId,
        );
        if (!existing || existing.status === PAYMENT_STATUS.SUCCESS) return;

        const utrNumber = (entity as Record<string, Record<string, string>>)
            .acquirer_data?.rrn ?? null;

        await paymentsRepository.markPaymentSuccess(
            existing.id, utrNumber, new Date(),
        );

        if (existing.emiId) {
            const emi = await emiRepository.findByIdOrThrow(existing.emiId);
            const account = await loansRepository.findAccountByIdOrThrow(
                existing.loanAccountId,
            );

            await emiService.markPaid(
                {
                    emiId: existing.emiId,
                    paidAmount: existing.totalCollected,
                    paidAt: new Date(),
                    channel: PAYMENT_CHANNEL.ENACH,
                },
                { requestId } as unknown as Request,
            );

            paymentEvents.received({
                paymentId: existing.id,
                loanAccountId: existing.loanAccountId,
                userId: account.userId,
                emiId: existing.emiId,
                emiNumber: emi.emiNumber,
                amount: existing.amount,
                channel: PAYMENT_CHANNEL.ENACH,
                gatewayTxnId: razorpayPaymentId,
                paidAt: new Date(),
                requestId,
            });
        }

        log.info('NACH debit confirmed', {
            paymentId: existing.id,
            emiId: existing.emiId,
            utrNumber,
        });
    },

    async _handleMandateActivated(
        payload: RazorpayWebhookPayload,
        requestId: string,
    ): Promise<void> {
        const mandateId = (
            payload.payload.subscription?.entity as Record<string, string>
        )?.id;
        if (!mandateId) return;

        const mandate = await paymentsRepository.findMandateByRazorpayId(mandateId);
        if (!mandate) {
            log.warn('Mandate activation for unknown mandate', { mandateId });
            return;
        }

        await paymentsRepository.updateMandateStatus(
            mandate.id,
            'ACTIVE',
            { registered_at: new Date() },
        );

        // Activate the loan account
        await loansService.activateLoan(
            mandate.loanAccountId,
            mandateId,
            { requestId } as unknown as Request,
        );

        log.info('eNACH mandate activated', {
            mandateId: mandate.id,
            loanAccountId: mandate.loanAccountId,
        });
    },

    async _handleMandateCancelled(
        payload: RazorpayWebhookPayload,
        requestId: string,
    ): Promise<void> {
        const mandateId = (
            payload.payload.subscription?.entity as Record<string, string>
        )?.id;
        if (!mandateId) return;

        const mandate = await paymentsRepository.findMandateByRazorpayId(mandateId);
        if (!mandate) return;

        await paymentsRepository.updateMandateStatus(
            mandate.id,
            'CANCELLED',
            { cancelled_at: new Date() },
        );

        log.warn('eNACH mandate cancelled', {
            mandateId: mandate.id,
            loanAccountId: mandate.loanAccountId,
        });
    },

    // ── 6. Get payments for a loan account ────────────────────────────────────

    async listPayments(input: ListPaymentsInput) {
        return paymentsRepository.listPayments(input);
    },

    async getPayment(paymentId: string): Promise<PaymentResponse> {
        const p = await paymentsRepository.findPaymentByIdOrThrow(paymentId);
        return toPaymentResponse(p);
    },

    async getMandateForAccount(
        loanAccountId: string,
    ): Promise<MandateResponse | null> {
        const m = await paymentsRepository.findMandateByLoanAccountId(
            loanAccountId,
        );
        return m ? toMandateResponse(m) : null;
    },
};