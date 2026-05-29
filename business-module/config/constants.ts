// src/config/constants.ts
//
// Single source of truth for every magic number, status enum,
// and string constant used across the business module.
// Never hardcode these anywhere else — import from here.

// ─── Loan Status ───────────────────────────────────────────────────────────────

export const LOAN_STATUS = {
    DRAFT: 'DRAFT',
    KYC_PENDING: 'KYC_PENDING',
    KYC_REJECTED: 'KYC_REJECTED',
    UNDERWRITING: 'UNDERWRITING',
    PENDING_APPROVAL: 'PENDING_APPROVAL',
    APPROVED: 'APPROVED',
    REJECTED: 'REJECTED',
    ESIGN_PENDING: 'ESIGN_PENDING',
    DISBURSED: 'DISBURSED',
    ACTIVE: 'ACTIVE',
    CLOSED: 'CLOSED',
    NPA: 'NPA',
    WRITTEN_OFF: 'WRITTEN_OFF',
} as const;

export type LoanStatus = (typeof LOAN_STATUS)[keyof typeof LOAN_STATUS];

// Valid state transitions — enforced by the loan state machine
// Key = current state, Value = array of allowed next states
export const LOAN_TRANSITIONS: Record<LoanStatus, LoanStatus[]> = {
    [LOAN_STATUS.DRAFT]: [LOAN_STATUS.KYC_PENDING],
    [LOAN_STATUS.KYC_PENDING]: [LOAN_STATUS.UNDERWRITING, LOAN_STATUS.KYC_REJECTED],
    [LOAN_STATUS.KYC_REJECTED]: [],
    [LOAN_STATUS.UNDERWRITING]: [LOAN_STATUS.PENDING_APPROVAL, LOAN_STATUS.REJECTED],
    [LOAN_STATUS.PENDING_APPROVAL]: [LOAN_STATUS.APPROVED, LOAN_STATUS.REJECTED],
    [LOAN_STATUS.APPROVED]: [LOAN_STATUS.ESIGN_PENDING, LOAN_STATUS.REJECTED],
    [LOAN_STATUS.REJECTED]: [],
    [LOAN_STATUS.ESIGN_PENDING]: [LOAN_STATUS.DISBURSED],
    [LOAN_STATUS.DISBURSED]: [LOAN_STATUS.ACTIVE],
    [LOAN_STATUS.ACTIVE]: [LOAN_STATUS.CLOSED, LOAN_STATUS.NPA],
    [LOAN_STATUS.CLOSED]: [],
    [LOAN_STATUS.NPA]: [LOAN_STATUS.ACTIVE, LOAN_STATUS.WRITTEN_OFF],
    [LOAN_STATUS.WRITTEN_OFF]: [],
};

// ─── KYC Status ───────────────────────────────────────────────────────────────

export const KYC_STATUS = {
    NOT_STARTED: 'NOT_STARTED',
    IN_PROGRESS: 'IN_PROGRESS',
    AADHAAR_DONE: 'AADHAAR_DONE',
    PAN_DONE: 'PAN_DONE',
    FACE_DONE: 'FACE_DONE',
    BANK_DONE: 'BANK_DONE',
    COMPLETE: 'COMPLETE',
    REJECTED: 'REJECTED',
} as const;

export type KycStatus = (typeof KYC_STATUS)[keyof typeof KYC_STATUS];

// ─── KYC Check Types ──────────────────────────────────────────────────────────

export const KYC_CHECK = {
    AADHAAR_VERIFY: 'AADHAAR_VERIFY',
    PAN_VERIFY: 'PAN_VERIFY',
    FACE_MATCH: 'FACE_MATCH',
    LIVENESS: 'LIVENESS',
    AADHAAR_OCR: 'AADHAAR_OCR',
    PAN_OCR: 'PAN_OCR',
    BANK_ACCOUNT: 'BANK_ACCOUNT',
    BANK_STATEMENT: 'BANK_STATEMENT',
    RISK_SCORE: 'RISK_SCORE',
    DATA_BREACH: 'DATA_BREACH',
    ESIGN: 'ESIGN',
    ESTAMP: 'ESTAMP',
    GST_VERIFY: 'GST_VERIFY',
} as const;

export type KycCheck = (typeof KYC_CHECK)[keyof typeof KYC_CHECK];

// ─── EMI Status ───────────────────────────────────────────────────────────────

export const EMI_STATUS = {
    PENDING: 'PENDING',
    PAID: 'PAID',
    OVERDUE: 'OVERDUE',
    WAIVED: 'WAIVED',
    BOUNCED: 'BOUNCED',
    PARTIAL: 'PARTIAL',
} as const;

export type EmiStatus = (typeof EMI_STATUS)[keyof typeof EMI_STATUS];

// ─── Payment Status ───────────────────────────────────────────────────────────

export const PAYMENT_STATUS = {
    INITIATED: 'INITIATED',
    SUCCESS: 'SUCCESS',
    FAILED: 'FAILED',
    REFUNDED: 'REFUNDED',
    PENDING: 'PENDING',
} as const;

export type PaymentStatus = (typeof PAYMENT_STATUS)[keyof typeof PAYMENT_STATUS];

// ─── Payment Channel ──────────────────────────────────────────────────────────

export const PAYMENT_CHANNEL = {
    ENACH: 'ENACH',
    UPI: 'UPI',
    BANK_TRANSFER: 'BANK_TRANSFER',
    PAYMENT_LINK: 'PAYMENT_LINK',
    CASH: 'CASH',
} as const;

export type PaymentChannel = (typeof PAYMENT_CHANNEL)[keyof typeof PAYMENT_CHANNEL];

// ─── Roles ────────────────────────────────────────────────────────────────────

export const ROLE = {
    CUSTOMER: 'CUSTOMER',
    AGENT: 'AGENT',
    OPS_EXECUTIVE: 'OPS_EXECUTIVE',
    CREDIT_MANAGER: 'CREDIT_MANAGER',
    COLLECTION_AGENT: 'COLLECTION_AGENT',
    FINANCE: 'FINANCE',
    SUPER_ADMIN: 'SUPER_ADMIN',
} as const;

export type Role = (typeof ROLE)[keyof typeof ROLE];

// ─── Agent Status ─────────────────────────────────────────────────────────────

export const AGENT_STATUS = {
    PENDING: 'PENDING',
    ACTIVE: 'ACTIVE',
    SUSPENDED: 'SUSPENDED',
    TERMINATED: 'TERMINATED',
} as const;

export type AgentStatus = (typeof AGENT_STATUS)[keyof typeof AGENT_STATUS];

// ─── Commission Status ────────────────────────────────────────────────────────

export const COMMISSION_STATUS = {
    PENDING: 'PENDING',
    EARNED: 'EARNED',
    PAID: 'PAID',
    CLAWED_BACK: 'CLAWED_BACK',
} as const;

export type CommissionStatus = (typeof COMMISSION_STATUS)[keyof typeof COMMISSION_STATUS];

// ─── Product Types ────────────────────────────────────────────────────────────

export const PRODUCT_TYPE = {
    CONSUMER_DURABLE: 'CONSUMER_DURABLE',
    TWO_WHEELER: 'TWO_WHEELER',
    EDUCATION_DEVICE: 'EDUCATION_DEVICE',
} as const;

export type ProductType = (typeof PRODUCT_TYPE)[keyof typeof PRODUCT_TYPE];

// ─── Disbursement Mode ────────────────────────────────────────────────────────

export const DISBURSEMENT_MODE = {
    UPI: 'UPI',
    NEFT: 'NEFT',
    IMPS: 'IMPS',
    RTGS: 'RTGS',
} as const;

export type DisbursementMode = (typeof DISBURSEMENT_MODE)[keyof typeof DISBURSEMENT_MODE];

// ─── Audit Actions ────────────────────────────────────────────────────────────

export const AUDIT_ACTION = {
    LOAN_CREATED: 'LOAN_CREATED',
    LOAN_SUBMITTED: 'LOAN_SUBMITTED',
    LOAN_APPROVED: 'LOAN_APPROVED',
    LOAN_REJECTED: 'LOAN_REJECTED',
    LOAN_DISBURSED: 'LOAN_DISBURSED',
    LOAN_CLOSED: 'LOAN_CLOSED',
    LOAN_NPA: 'LOAN_NPA',
    KYC_INITIATED: 'KYC_INITIATED',
    KYC_CHECK_PASSED: 'KYC_CHECK_PASSED',
    KYC_CHECK_FAILED: 'KYC_CHECK_FAILED',
    KYC_COMPLETED: 'KYC_COMPLETED',
    KYC_REJECTED: 'KYC_REJECTED',
    EMI_PAID: 'EMI_PAID',
    EMI_BOUNCED: 'EMI_BOUNCED',
    PAYMENT_INITIATED: 'PAYMENT_INITIATED',
    PAYMENT_SUCCESS: 'PAYMENT_SUCCESS',
    PAYMENT_FAILED: 'PAYMENT_FAILED',
    AGENT_ONBOARDED: 'AGENT_ONBOARDED',
    AGENT_SUSPENDED: 'AGENT_SUSPENDED',
    COMMISSION_EARNED: 'COMMISSION_EARNED',
    COMMISSION_PAID: 'COMMISSION_PAID',
    DOCUMENT_UPLOADED: 'DOCUMENT_UPLOADED',
    ADMIN_OVERRIDE: 'ADMIN_OVERRIDE',
} as const;

export type AuditAction = (typeof AUDIT_ACTION)[keyof typeof AUDIT_ACTION];

// ─── Business Rule Constants ──────────────────────────────────────────────────
// These are defaults — actual limits come from env.business (configurable)

export const BUSINESS_RULES = {
    // EMI
    EMI_BOUNCE_PENALTY_RATE: 0.02,   // 2% of EMI amount per bounce
    EMI_OVERDUE_PENALTY_RATE: 0.24,   // 24% p.a. on overdue principal
    EMI_GRACE_PERIOD_DAYS: 3,      // Days after due date before marking overdue

    // NPA (RBI NBFC guidelines)
    NPA_TRIGGER_DAYS: 90,     // 90 DPD → NPA
    WRITE_OFF_TRIGGER_DAYS: 180,    // 180 DPD → Write off

    // Disbursement
    MIN_CREDIT_SCORE: 650,
    MAX_FOIR: 0.55,   // Fixed Obligation to Income Ratio (55%)
    PROCESSING_FEE_RATE: 0.02,   // 2% of loan amount
    GST_ON_PROCESSING_FEE: 0.18,   // 18% GST

    // Commission
    AGENT_COMMISSION_RATE: 0.015,  // 1.5% of disbursed amount
    COMMISSION_CLAWBACK_DAYS: 90,     // Clawback if loan NPA within 90 days

    // eNACH
    ENACH_RETRY_LIMIT: 3,      // Max auto-debit retry attempts per EMI
    ENACH_RETRY_INTERVAL_DAYS: 2,      // Days between retries

    // File limits
    KYC_DOC_MAX_SIZE_MB: 5,
    KYC_DOC_ALLOWED_TYPES: ['image/jpeg', 'image/png', 'application/pdf'],
} as const;

// ─── HTTP Status Codes ────────────────────────────────────────────────────────
// Explicit list — prevents magic numbers in controllers

export const HTTP = {
    OK: 200,
    CREATED: 201,
    NO_CONTENT: 204,
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    CONFLICT: 409,
    UNPROCESSABLE_ENTITY: 422,
    TOO_MANY_REQUESTS: 429,
    INTERNAL_ERROR: 500,
    BAD_GATEWAY: 502,
    SERVICE_UNAVAILABLE: 503,
} as const;

// ─── Pagination defaults ──────────────────────────────────────────────────────

export const PAGINATION = {
    DEFAULT_PAGE: 1,
    DEFAULT_LIMIT: 20,
    MAX_LIMIT: 100,
} as const;

// ─── Job schedules (node-cron syntax) ────────────────────────────────────────

export const CRON_SCHEDULE = {
    EMI_REMINDER: '0 9 * * *',    // Daily 9:00 AM IST
    NACH_DEBIT: '0 8 * * *',    // Daily 8:00 AM IST
    DEBIT_RETRY: '0 11 * * *',   // Daily 11:00 AM IST (after bounce window)
    NPA_WATCH: '0 1 * * *',    // Daily 1:00 AM IST (low traffic window)
    SETTLEMENT: '0 22 * * *',   // Daily 10:00 PM IST
} as const;