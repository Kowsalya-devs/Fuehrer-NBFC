// src/events/eventBus.ts
import { EventEmitter } from 'events';
import { createModuleLogger } from '@/config/logger';
import type {
    LoanStatus,
    KycStatus,
    PaymentStatus,
    EmiStatus,
    AgentStatus,
} from '@/config/constants';
import type { Rupees } from '@/types/common.types';

const log = createModuleLogger('eventBus');

// ─── Event payload definitions ─────────────────────────────────────────────────
// Every event has a typed payload. Add new events here ONLY.
// Handlers import these types — never construct payloads inline.

export interface LoanCreatedPayload {
    loanId: string;
    userId: string;
    agentId: string | null;
    amount: Rupees;
    tenureMonths: number;
    productType: string;
    requestId: string;
}

export interface LoanStatusChangedPayload {
    loanId: string;
    userId: string;
    agentId: string | null;
    previousStatus: LoanStatus;
    currentStatus: LoanStatus;
    changedBy: string;       // userId of the staff member who changed it
    reason?: string;       // Populated on rejection
    requestId: string;
}

export interface LoanApprovedPayload {
    loanId: string;
    userId: string;
    agentId: string | null;
    approvedAmount: Rupees;
    interestRate: number;
    tenureMonths: number;
    monthlyEmi: Rupees;
    approvedBy: string;
    requestId: string;
}

export interface LoanRejectedPayload {
    loanId: string;
    userId: string;
    agentId: string | null;
    reason: string;
    rejectedBy: string;
    requestId: string;
}

export interface LoanDisbursedPayload {
    loanId: string;
    loanAccountId: string;
    userId: string;
    agentId: string | null;
    disbursedAmount: Rupees;
    disbursedAt: Date;
    utrNumber: string | null;
    requestId: string;
}

export interface LoanClosedPayload {
    loanAccountId: string;
    userId: string;
    closedAt: Date;
    requestId: string;
}

export interface LoanNpaPayload {
    loanAccountId: string;
    userId: string;
    overdueDays: number;
    overdueAmount: Rupees;
    markedAt: Date;
    requestId: string;
}

// ── KYC events ────────────────────────────────────────────────────────────────

export interface KycInitiatedPayload {
    userId: string;
    requestId: string;
}

export interface KycCheckCompletedPayload {
    userId: string;
    checkType: string;
    passed: boolean;
    score?: number;
    requestId: string;
}

export interface KycStatusChangedPayload {
    userId: string;
    previousStatus: KycStatus;
    currentStatus: KycStatus;
    requestId: string;
}

export interface KycCompletedPayload {
    userId: string;
    creditScore: number | null;
    requestId: string;
}

export interface KycRejectedPayload {
    userId: string;
    reason: string;
    failedChecks: string[];
    requestId: string;
}

// ── Payment events ────────────────────────────────────────────────────────────

export interface PaymentReceivedPayload {
    paymentId: string;
    loanAccountId: string;
    userId: string;
    emiId: string;
    emiNumber: number;
    amount: Rupees;
    channel: string;
    gatewayTxnId: string;
    paidAt: Date;
    requestId: string;
}

export interface PaymentFailedPayload {
    paymentId: string;
    loanAccountId: string;
    userId: string;
    emiId: string;
    emiNumber: number;
    amount: Rupees;
    reason: string;
    gatewayCode: string | null;
    requestId: string;
}

export interface EmiOverduePayload {
    loanAccountId: string;
    userId: string;
    emiId: string;
    emiNumber: number;
    dueDate: Date;
    overdueDays: number;
    overdueAmount: Rupees;
    penaltyAmount: Rupees;
}

export interface EmiBouncedPayload {
    loanAccountId: string;
    userId: string;
    emiId: string;
    emiNumber: number;
    amount: Rupees;
    bounceReason: string;
    retryCount: number;
    nextRetryAt: Date | null;
}

export interface MandateCreatedPayload {
    loanAccountId: string;
    userId: string;
    mandateId: string;
    bankAccount: string;
    requestId: string;
}

// ── Collection events ─────────────────────────────────────────────────────────

export interface CollectionAssignedPayload {
    loanAccountId: string;
    userId: string;
    assignedAgentId: string;
    overdueDays: number;
    overdueAmount: Rupees;
}

export interface CollectionPaymentLoggedPayload {
    loanAccountId: string;
    collectionId: string;
    amount: Rupees;
    channel: string;
    loggedBy: string;
    requestId: string;
}

// ── Agent events ──────────────────────────────────────────────────────────────

export interface AgentOnboardedPayload {
    agentId: string;
    userId: string;
    shopName: string;
    requestId: string;
}

export interface AgentStatusChangedPayload {
    agentId: string;
    previousStatus: AgentStatus;
    currentStatus: AgentStatus;
    changedBy: string;
    requestId: string;
}

export interface CommissionEarnedPayload {
    commissionId: string;
    agentId: string;
    loanAccountId: string;
    amount: Rupees;
    earnedAt: Date;
}

// ─── Event map — all events and their payload types ───────────────────────────
// This is the single source of truth for the entire event system.
// TypeScript infers all listener signatures from here.

export interface AppEvents {
    // Loan
    'loan.created': LoanCreatedPayload;
    'loan.status.changed': LoanStatusChangedPayload;
    'loan.approved': LoanApprovedPayload;
    'loan.rejected': LoanRejectedPayload;
    'loan.disbursed': LoanDisbursedPayload;
    'loan.closed': LoanClosedPayload;
    'loan.npa': LoanNpaPayload;

    // KYC
    'kyc.initiated': KycInitiatedPayload;
    'kyc.check.completed': KycCheckCompletedPayload;
    'kyc.status.changed': KycStatusChangedPayload;
    'kyc.completed': KycCompletedPayload;
    'kyc.rejected': KycRejectedPayload;

    // Payment
    'payment.received': PaymentReceivedPayload;
    'payment.failed': PaymentFailedPayload;
    'emi.overdue': EmiOverduePayload;
    'emi.bounced': EmiBouncedPayload;
    'mandate.created': MandateCreatedPayload;

    // Collection
    'collection.assigned': CollectionAssignedPayload;
    'collection.payment.logged': CollectionPaymentLoggedPayload;

    // Agent
    'agent.onboarded': AgentOnboardedPayload;
    'agent.status.changed': AgentStatusChangedPayload;
    'commission.earned': CommissionEarnedPayload;
}

export type AppEventName = keyof AppEvents;
export type AppEventPayload<E extends AppEventName> = AppEvents[E];

// ─── Typed EventBus class ─────────────────────────────────────────────────────

type Listener<E extends AppEventName> = (
    payload: AppEventPayload<E>,
) => Promise<void> | void;

class TypedEventBus {
    private readonly emitter: EventEmitter;

    // Track registered listeners for graceful shutdown + debugging
    private readonly registry: Map<
        AppEventName,
        Array<{ name: string; fn: Listener<AppEventName> }>
    > = new Map();

    constructor() {
        this.emitter = new EventEmitter();
        // Raise the limit — we have many listeners across modules
        this.emitter.setMaxListeners(50);
    }

    // ── on ───────────────────────────────────────────────────────────────────
    // Register a named listener. The name is used for logging and debugging.
    // Errors thrown inside listeners are caught and logged — they never
    // propagate back to the emitter and never crash the request.

    on<E extends AppEventName>(
        event: E,
        name: string,
        listener: Listener<E>,
    ): void {
        const wrapped = async (payload: AppEventPayload<E>): Promise<void> => {
            const start = Date.now();
            try {
                await listener(payload);
                log.debug('Event listener completed', {
                    event,
                    listener: name,
                    durationMs: Date.now() - start,
                });
            } catch (err) {
                // Listener failure must never affect the primary request flow
                log.error('Event listener threw an error', {
                    event,
                    listener: name,
                    error: (err as Error).message,
                    stack: (err as Error).stack,
                    payload,
                });
            }
        };

        this.emitter.on(event, wrapped as (...args: unknown[]) => void);

        // Register in the registry for introspection
        if (!this.registry.has(event)) {
            this.registry.set(event, []);
        }
        this.registry.get(event)!.push({
            name,
            fn: listener as Listener<AppEventName>,
        });

        log.debug('Event listener registered', { event, listener: name });
    }

    // ── once ─────────────────────────────────────────────────────────────────
    // Register a one-time listener — fires once then auto-removes.
    // Useful for tests and one-off coordination between modules.

    once<E extends AppEventName>(
        event: E,
        name: string,
        listener: Listener<E>,
    ): void {
        const wrapped = async (payload: AppEventPayload<E>): Promise<void> => {
            try {
                await listener(payload);
            } catch (err) {
                log.error('One-time event listener threw an error', {
                    event,
                    listener: name,
                    error: (err as Error).message,
                });
            }
        };

        this.emitter.once(event, wrapped as (...args: unknown[]) => void);
        log.debug('One-time event listener registered', { event, listener: name });
    }

    // ── emit ─────────────────────────────────────────────────────────────────
    // Fire an event. All registered async listeners run concurrently.
    // If no listeners are registered, the event is silently dropped — this is
    // intentional. Emitting an event is a fire-and-forget side effect.

    emit<E extends AppEventName>(
        event: E,
        payload: AppEventPayload<E>,
    ): void {
        const listenerCount = this.emitter.listenerCount(event);

        log.debug('Emitting event', {
            event,
            listenerCount,
        });

        // setImmediate defers emission to the next iteration of the event loop.
        // This ensures the primary business operation (DB write, response) completes
        // BEFORE listeners run — critical for audit logs and notifications.
        setImmediate(() => {
            this.emitter.emit(event, payload);
        });
    }

    // ── emitSync ─────────────────────────────────────────────────────────────
    // Synchronous emit — listeners run in the current event loop tick.
    // Only use when the calling code explicitly needs to wait for listeners.
    // Prefer emit() for all normal use cases.

    emitSync<E extends AppEventName>(
        event: E,
        payload: AppEventPayload<E>,
    ): void {
        this.emitter.emit(event, payload);
    }

    // ── off ──────────────────────────────────────────────────────────────────

    off<E extends AppEventName>(
        event: E,
        listener: Listener<E>,
    ): void {
        this.emitter.off(event, listener as (...args: unknown[]) => void);
    }

    // ── Introspection ─────────────────────────────────────────────────────────

    listenerCount(event: AppEventName): number {
        return this.emitter.listenerCount(event);
    }

    registeredListeners(): Record<string, string[]> {
        const result: Record<string, string[]> = {};
        for (const [event, listeners] of this.registry.entries()) {
            result[event] = listeners.map((l) => l.name);
        }
        return result;
    }

    removeAllListeners(): void {
        this.emitter.removeAllListeners();
        this.registry.clear();
    }
}

// ─── Singleton export ─────────────────────────────────────────────────────────
// One bus for the entire application.
// Import `eventBus` everywhere — never instantiate TypedEventBus directly.

export const eventBus = new TypedEventBus();