// src/constants/index.ts
//
// Barrel re-export for all module-level constants.
//
// Import from individual files for focused imports:
//   import { EMI_BOUNCE_PENALTY_RATE } from '@/constants/emi.constants'
//
// Or import from here for convenience:
//   import { EMI_BOUNCE_PENALTY_RATE, NPA_DECLARE_TRIGGER_DAYS } from '@/constants'
//
// DO NOT define any values in this file — all constants live in their
// respective files. This file is a pure re-export barrel.

// ─── EMI constants ────────────────────────────────────────────────────────────
export {
    EMI_STATUS,
    PAYMENT_STATUS,
    PAYMENT_CHANNEL,
    EMI_BOUNCE_PENALTY_RATE,
    EMI_OVERDUE_PENALTY_RATE,
    EMI_GRACE_PERIOD_DAYS,
    ENACH_RETRY_LIMIT,
    ENACH_RETRY_INTERVAL_DAYS,
    EMI_REMINDER_DAYS,
    EMI_TERMINAL_STATUSES,
    CRON_EMI_REMINDER,
    CRON_NACH_DEBIT,
    CRON_DEBIT_RETRY,
    DEBIT_RETRY_OFFSETS_DAYS,
    isEmiTerminal,
} from './emi.constants';

export type {
    EmiStatus,
    PaymentStatus,
    PaymentChannel,
} from './emi.constants';

// ─── NPA constants ────────────────────────────────────────────────────────────
export {
    NPA_DAYS,
    NPA_WATCH_TRIGGER_DAYS,
    NPA_DECLARE_TRIGGER_DAYS,
    WRITE_OFF_TRIGGER_DAYS,
    DPD_BUCKETS,
    PROVISIONING_RATES,
    COLLECTION_ESCALATION,
    NPA_PENAL_RATE_PA,
    CRON_NPA_WATCH,
    classifyDpd,
    getDpdLabel,
    calculateProvision,
} from './npa.constants';

export type { DpdBucketKey } from './npa.constants';

// ─── Roles constants ──────────────────────────────────────────────────────────
export {
    ROLE,
    ROLE_HIERARCHY,
    SUPER_ADMIN_ONLY,
    CREDIT_ROLES,
    FINANCE_ROLES,
    COLLECTION_ROLES,
    STAFF_ROLES,
    REPORT_ROLES,
    APPLICATION_ROLES,
    hasMinimumRole,
    isStaffRole,
    isCustomerFacingRole,
} from './roles.constants';

export type { Role, RoleName } from './roles.constants';

// ─── Vendor constants ─────────────────────────────────────────────────────────
export {
    VENDOR,
    VENDORS,
    WEBHOOK_SOURCE,
    VENDOR_TIMEOUT_MS,
    VENDOR_RETRY_LIMIT,
    PERFIOS_API,
} from './vendor.constants';

export type {
    VendorName,
    WebhookSource,
    PerfiosApiName,
} from './vendor.constants';
