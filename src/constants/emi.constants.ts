// src/constants/emi.constants.ts
//
// EMI-related constants for the Feuhrer business module.
//
// Source of truth is config/constants.ts (BUSINESS_RULES, EMI_STATUS,
// CRON_SCHEDULE). This file re-exports the EMI-specific values under
// descriptive names so services and jobs can import from a single focused
// path rather than destructuring the full BUSINESS_RULES object.
//
// DO NOT define new values here — add them to config/constants.ts first,
// then re-export here. Keeping config/constants.ts as the single source
// ensures env.ts validation stays in sync.

export {
    EMI_STATUS,
    PAYMENT_STATUS,
    PAYMENT_CHANNEL,
} from '@/config/constants';

export type {
    EmiStatus,
    PaymentStatus,
    PaymentChannel,
} from '@/config/constants';

// ─── EMI business rules ───────────────────────────────────────────────────────
// Pulled from BUSINESS_RULES and aliased for clarity at the call site.

import { BUSINESS_RULES, CRON_SCHEDULE } from '@/config/constants';

/** 2% of EMI amount charged per NACH bounce */
export const EMI_BOUNCE_PENALTY_RATE = BUSINESS_RULES.EMI_BOUNCE_PENALTY_RATE;

/** 24% p.a. penal interest on overdue outstanding principal (RBI compliant) */
export const EMI_OVERDUE_PENALTY_RATE = BUSINESS_RULES.EMI_OVERDUE_PENALTY_RATE;

/**
 * Grace period after due date before EMI is marked OVERDUE.
 * Default: 3 days. During grace period, status stays PENDING.
 */
export const EMI_GRACE_PERIOD_DAYS = BUSINESS_RULES.EMI_GRACE_PERIOD_DAYS;

/** Maximum number of NACH auto-debit retry attempts per EMI */
export const ENACH_RETRY_LIMIT = BUSINESS_RULES.ENACH_RETRY_LIMIT;

/** Days between each NACH retry attempt */
export const ENACH_RETRY_INTERVAL_DAYS = BUSINESS_RULES.ENACH_RETRY_INTERVAL_DAYS;

// ─── Cron schedules ───────────────────────────────────────────────────────────

/** node-cron expression — Daily 9:00 AM IST */
export const CRON_EMI_REMINDER = CRON_SCHEDULE.EMI_REMINDER;

/** node-cron expression — Daily 8:00 AM IST */
export const CRON_NACH_DEBIT = CRON_SCHEDULE.NACH_DEBIT;

/** node-cron expression — Daily 11:00 AM IST (after bounce settlement window) */
export const CRON_DEBIT_RETRY = CRON_SCHEDULE.DEBIT_RETRY;

// ─── Reminder windows ─────────────────────────────────────────────────────────
// Days before due date to send reminder SMS/push.
// emiReminder.job uses these to query the three reminder buckets concurrently.

export const EMI_REMINDER_DAYS = [3, 1, 0] as const;

// ─── EMI terminal statuses ────────────────────────────────────────────────────
// An EMI in a terminal status cannot be updated by the payment webhook.
// Use this set to guard against duplicate webhook processing.

import { EMI_STATUS } from '@/config/constants';

export const EMI_TERMINAL_STATUSES = new Set([
    EMI_STATUS.PAID,
    EMI_STATUS.WAIVED,
]);

/**
 * Returns true if an EMI is in a status that cannot be further updated.
 * Called by payment webhook handler before processing.
 */
export function isEmiTerminal(status: string): boolean {
    return EMI_TERMINAL_STATUSES.has(status as typeof EMI_STATUS[keyof typeof EMI_STATUS]);
}

// ─── Debit retry schedule ─────────────────────────────────────────────────────
// Offset in days from due date for each retry attempt.
// Attempt 1: due date + 2 days
// Attempt 2: due date + 4 days
// Attempt 3: due date + 6 days (final — after this, EMI → OVERDUE)

export const DEBIT_RETRY_OFFSETS_DAYS = [
    ENACH_RETRY_INTERVAL_DAYS * 1,
    ENACH_RETRY_INTERVAL_DAYS * 2,
    ENACH_RETRY_INTERVAL_DAYS * 3,
] as const;