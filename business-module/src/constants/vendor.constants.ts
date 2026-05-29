// src/constants/vendor.constants.ts
//
// External vendor and API provider constants.
//
// Vendor names are used as string identifiers in:
//   - Audit logs  (which vendor processed a KYC check)
//   - Error logs  (provider.utils.ts logs vendor name on failures)
//   - Webhook routing (webhooks.service identifies the source)
//   - CloudWatch metrics (grouped by vendor for cost monitoring)
//
// Timeout values are defaults — actual values come from env.ts so they can
// be tuned per environment without a code deploy.

// ─── Vendor identifiers ───────────────────────────────────────────────────────
// These string values appear in logs, audit records and CloudWatch.
// Keep them lowercase-hyphenated — consistent with provider.utils.ts usage.

export const VENDOR = {
    // ── KYC & Identity ────────────────────────────────────────────────────────
    SIGNZY: 'signzy',       // Primary KYC, eSign, eStamp
    KARZA: 'karza',        // Aadhaar, PAN, bank verify (alternative)
    HYPERVERGE: 'hyperverge',   // Face match, liveness, OCR (alternative)
    IDFY: 'idfy',         // Fraud / risk score (alternative)
    AUTHBRIDGE: 'authbridge',   // AML, background check (alternative)

    // ── Perfios (20 APIs — wired as placeholders, activate when keys ready) ──
    PERFIOS: 'perfios',

    // ── Payments ──────────────────────────────────────────────────────────────
    RAZORPAY: 'razorpay',     // eNACH, payouts, payment links

    // ── Communications ────────────────────────────────────────────────────────
    TWILIO: 'twilio',       // SMS OTP (fallback)
    MSG91: 'msg91',        // SMS primary (DLT registered, India)
    RESEND: 'resend',       // Transactional email

    // ── Credit Bureau ──────────────────────────────────────────────────────────
    CIBIL: 'cibil',        // TransUnion CIBIL
    EXPERIAN: 'experian',
    EQUIFAX: 'equifax',
    CRIF: 'crif',

    // ── AWS ───────────────────────────────────────────────────────────────────
    AWS_KMS: 'aws-kms',
    AWS_S3: 'aws-s3',
} as const;

// Legacy alias — matches stub in constants/index.ts
export const VENDORS = {
    KARZA: VENDOR.KARZA,
    HYPERVERGE: VENDOR.HYPERVERGE,
    IDFY: VENDOR.IDFY,
    AUTHBRIDGE: VENDOR.AUTHBRIDGE,
    SIGNZY: VENDOR.SIGNZY,
    RAZORPAY: VENDOR.RAZORPAY,
    MSG91: VENDOR.MSG91,
    RESEND: VENDOR.RESEND,
} as const;

export type VendorName = typeof VENDOR[keyof typeof VENDOR];

// ─── Webhook source identifiers ───────────────────────────────────────────────
// Matches WebhookSource type in webhooks.types.ts.
// Used by webhooks.service to route incoming callbacks.

export const WEBHOOK_SOURCE = {
    RAZORPAY: 'razorpay',
    SIGNZY: 'signzy',
    BUREAU: 'bureau',
    ESIGN: 'esign',
    PERFIOS: 'perfios',
} as const;

export type WebhookSource = typeof WEBHOOK_SOURCE[keyof typeof WEBHOOK_SOURCE];

// ─── Default vendor timeouts (milliseconds) ───────────────────────────────────
// env.ts overrides these per environment. These are compile-time fallbacks
// used in stub providers and as documentation of expected SLAs.

export const VENDOR_TIMEOUT_MS = {
    SIGNZY: 15_000,   // 15s — KYC checks, face match
    KARZA: 10_000,   // 10s — PAN/Aadhaar verify
    HYPERVERGE: 20_000,   // 20s — liveness + face match (image processing)
    RAZORPAY: 30_000,   // 30s — payment operations
    MSG91: 5_000,   //  5s — SMS dispatch
    RESEND: 5_000,   //  5s — email dispatch
    BUREAU: 20_000,   // 20s — CIBIL/Experian credit report
    PERFIOS: 15_000,   // 15s — placeholder, update when API docs confirmed
    AWS_KMS: 3_000,   //  3s — KMS should be fast within same region
    AWS_S3: 10_000,   // 10s — document upload
} as const;

// ─── Vendor retry limits ──────────────────────────────────────────────────────
// Maximum retry attempts for transient vendor failures.
// 4xx errors are never retried — only network errors and 5xx.

export const VENDOR_RETRY_LIMIT = {
    SIGNZY: 3,
    KARZA: 3,
    RAZORPAY: 2,   // Fewer retries — payment ops are sensitive to duplicates
    MSG91: 3,
    RESEND: 3,
    BUREAU: 2,
    PERFIOS: 3,
    AWS_KMS: 3,
    AWS_S3: 3,
} as const;

// ─── Perfios API list (placeholders) ─────────────────────────────────────────
// These 20 APIs are wired as stubs. Wire each live.ts when Perfios
// credentials are available. Do not remove — they document the full scope.

export const PERFIOS_API = {
    AADHAAR_VERIFY: 'aadhaar-number-verification',
    AADHAAR_MOBILE_LINK: 'aadhaar-mobile-link',
    PAN_AUTH: 'pan-authentication',
    PAN_AUTH_ADVANCED: 'pan-authentication-advanced',
    PAN_LINK_STATUS: 'pan-link-status',
    SILENT_LIVENESS: 'silent-liveness',
    FACE_MATCHING: 'face-matching',
    NAME_SIMILARITY: 'name-similarity',
    BANK_AC_VERIFY: 'bank-ac-verification',
    BANK_AC_VERIFY_ADVANCED: 'bank-ac-verification-advanced',
    SILENT_BANK_VERIFY: 'silent-bank-account-verification',
    GST_AUTH: 'gst-authentication',
    AML_SANCTIONS: 'aml-sanctions-screening',
    PEP_DETAILS: 'pep-details',
    ALERTS: 'alerts',
    BANK_DEFAULTERS: 'bank-defaulters',
    EMPLOYMENT_VERIFY: 'employment-verification-advanced',
    GST_OCR: 'gst-certificate-parsing',
    ITR_BUSINESS: 'itr-business',
    ITR_SALARIED: 'itr-salaried',
} as const;

export type PerfiosApiName = typeof PERFIOS_API[keyof typeof PERFIOS_API];
