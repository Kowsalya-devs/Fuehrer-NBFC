// src/types/environment.d.ts
//
// Teaches TypeScript the shape of process.env for this project.
// This does NOT validate values — that's env.ts's job.
// This only provides IDE autocomplete and catches typos at compile time.
//
// Keep in sync with src/config/env.ts — every variable in the Joi schema
// should have an entry here.

declare namespace NodeJS {
    interface ProcessEnv {

        // ── Core ────────────────────────────────────────────────────────────────
        readonly NODE_ENV: 'development' | 'staging' | 'production' | 'test';
        readonly PORT?: string;
        readonly APP_NAME?: string;
        readonly API_VERSION?: string;

        // ── Database ────────────────────────────────────────────────────────────
        readonly DATABASE_URL: string;
        readonly DATABASE_POOL_MIN?: string;
        readonly DATABASE_POOL_MAX?: string;
        readonly DATABASE_SSL?: string;

        // ── Redis ────────────────────────────────────────────────────────────────
        readonly REDIS_URL: string;
        readonly REDIS_TLS?: string;

        // ── Auth ─────────────────────────────────────────────────────────────────
        readonly JWT_SECRET: string;
        readonly JWT_EXPIRY?: string;

        // ── AWS ──────────────────────────────────────────────────────────────────
        readonly AWS_REGION?: string;
        readonly AWS_ACCESS_KEY_ID?: string;
        readonly AWS_SECRET_ACCESS_KEY?: string;
        readonly AWS_KMS_KEY_ID?: string;
        readonly AWS_S3_BUCKET: string;
        readonly AWS_S3_SIGNED_URL_EXPIRY?: string;
        readonly AWS_SECRETS_MANAGER_ENABLED?: string;

        // ── KYC ──────────────────────────────────────────────────────────────────
        readonly KYC_PROVIDER?: 'signzy' | 'stub';
        readonly SIGNZY_BASE_URL?: string;
        readonly SIGNZY_API_KEY?: string;
        readonly SIGNZY_TIMEOUT_MS?: string;

        // ── Credit Bureau ─────────────────────────────────────────────────────────
        readonly BUREAU_PROVIDER?: string;
        readonly BUREAU_API_URL?: string;
        readonly BUREAU_API_KEY?: string;
        readonly BUREAU_TIMEOUT_MS?: string;

        // ── Payments ──────────────────────────────────────────────────────────────
        readonly PAYMENT_PROVIDER?: 'razorpay' | 'stub';
        readonly RAZORPAY_KEY_ID?: string;
        readonly RAZORPAY_KEY_SECRET?: string;
        readonly RAZORPAY_WEBHOOK_SECRET?: string;
        readonly RAZORPAY_ACCOUNT_NUMBER?: string;

        // ── SMS ───────────────────────────────────────────────────────────────────
        readonly SMS_PROVIDER?: 'twilio' | 'msg91' | 'stub';
        readonly TWILIO_ACCOUNT_SID?: string;
        readonly TWILIO_AUTH_TOKEN?: string;
        readonly TWILIO_FROM_NUMBER?: string;
        readonly MSG91_AUTH_KEY?: string;
        readonly MSG91_SENDER_ID?: string;
        readonly MSG91_TEMPLATE_ID?: string;

        // ── Email ─────────────────────────────────────────────────────────────────
        readonly EMAIL_PROVIDER?: 'resend' | 'stub';
        readonly RESEND_API_KEY?: string;
        readonly EMAIL_FROM_ADDRESS?: string;

        // ── Rate Limiting ─────────────────────────────────────────────────────────
        readonly RATE_LIMIT_WINDOW_MS?: string;
        readonly RATE_LIMIT_MAX_REQUESTS?: string;
        readonly RATE_LIMIT_KYC_MAX?: string;
        readonly RATE_LIMIT_WEBHOOK_MAX?: string;

        // ── Logging ───────────────────────────────────────────────────────────────
        readonly LOG_LEVEL?: string;
        readonly LOG_PRETTY?: string;

        // ── Encryption ────────────────────────────────────────────────────────────
        readonly LOCAL_ENCRYPTION_KEY?: string;

        // ── Business Rules ────────────────────────────────────────────────────────
        readonly MAX_LOAN_AMOUNT?: string;
        readonly MIN_LOAN_AMOUNT?: string;
        readonly MAX_TENURE_MONTHS?: string;
        readonly MIN_TENURE_MONTHS?: string;
        readonly MIN_CREDIT_SCORE?: string;
        readonly NPA_OVERDUE_DAYS?: string;

        // ── CORS ──────────────────────────────────────────────────────────────────
        readonly CORS_ALLOWED_ORIGINS?: string;
    }
}
