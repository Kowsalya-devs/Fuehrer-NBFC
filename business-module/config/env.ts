// src/config/env.ts
import Joi from 'joi';
import dotenv from 'dotenv';
import path from 'path';

// Load the correct .env file based on NODE_ENV
// Precedence: .env.production > .env.development > .env
const envFile =
    process.env.NODE_ENV === 'production'
        ? '.env'
        : `.env.${process.env.NODE_ENV || 'development'}`;

dotenv.config({ path: path.resolve(process.cwd(), envFile) });

// ─── Schema ────────────────────────────────────────────────────────────────────

const schema = Joi.object({
    // ── Core ──────────────────────────────────────────────────────────────────
    NODE_ENV: Joi.string()
        .valid('development', 'staging', 'production', 'test')
        .default('development'),

    PORT: Joi.number().integer().min(1024).max(65535).default(3000),

    APP_NAME: Joi.string().default('feuhrer-business-api'),

    API_VERSION: Joi.string().default('v1'),

    // ── Database ──────────────────────────────────────────────────────────────
    DATABASE_URL: Joi.string()
        .uri({ scheme: ['postgresql', 'postgres'] })
        .required()
        .description('Prisma-compatible PostgreSQL connection string'),

    DATABASE_POOL_MIN: Joi.number().integer().min(1).default(2),
    DATABASE_POOL_MAX: Joi.number().integer().min(2).default(10),

    DATABASE_SSL: Joi.boolean().default(false).when('NODE_ENV', {
        is: 'production',
        then: Joi.boolean().valid(true).required(),
    }),

    // ── Redis ─────────────────────────────────────────────────────────────────
    REDIS_URL: Joi.string().required().description('Upstash or self-hosted Redis URL'),

    REDIS_TLS: Joi.boolean().default(false).when('NODE_ENV', {
        is: 'production',
        then: Joi.boolean().valid(true).required(),
    }),

    // ── Auth ──────────────────────────────────────────────────────────────────
    // JWT_SECRET is owned by the user-module team — we only consume it
    JWT_SECRET: Joi.string().min(32).required(),
    JWT_EXPIRY: Joi.string().default('24h'),

    // ── AWS Core ──────────────────────────────────────────────────────────────
    AWS_REGION: Joi.string().default('ap-south-1'),
    AWS_ACCESS_KEY_ID: Joi.string().when('NODE_ENV', {
        is: Joi.valid('production', 'staging'),
        then: Joi.string().required(),
        otherwise: Joi.string().optional(),
    }),
    AWS_SECRET_ACCESS_KEY: Joi.string().when('NODE_ENV', {
        is: Joi.valid('production', 'staging'),
        then: Joi.string().required(),
        otherwise: Joi.string().optional(),
    }),

    // ── AWS KMS (PAN / Aadhaar encryption) ────────────────────────────────────
    AWS_KMS_KEY_ID: Joi.string().when('NODE_ENV', {
        is: Joi.valid('production', 'staging'),
        then: Joi.string().required(),
    }),

    // ── AWS S3 (KYC document storage) ─────────────────────────────────────────
    AWS_S3_BUCKET: Joi.string().required(),
    AWS_S3_SIGNED_URL_EXPIRY: Joi.number().integer().default(900), // 15 minutes

    // ── AWS Secrets Manager ───────────────────────────────────────────────────
    // In production all vendor API keys are fetched from Secrets Manager
    // In dev/test they can be provided directly as env vars (stub mode)
    AWS_SECRETS_MANAGER_ENABLED: Joi.boolean().default(false).when('NODE_ENV', {
        is: 'production',
        then: Joi.boolean().valid(true).required(),
    }),

    // ── KYC Provider (Signzy) ─────────────────────────────────────────────────
    KYC_PROVIDER: Joi.string()
        .valid('signzy', 'stub')
        .default('stub'),

    SIGNZY_BASE_URL: Joi.string().when('KYC_PROVIDER', {
        is: 'signzy',
        then: Joi.string().uri().required(),
    }),
    SIGNZY_API_KEY: Joi.string().when('KYC_PROVIDER', {
        is: 'signzy',
        then: Joi.string().required(),
    }),
    SIGNZY_TIMEOUT_MS: Joi.number().integer().default(15000),

    // ── Credit Bureau ─────────────────────────────────────────────────────────
    BUREAU_PROVIDER: Joi.string()
        .valid('cibil', 'experian', 'equifax', 'crif', 'stub')
        .default('stub'),

    BUREAU_API_URL: Joi.string().when('BUREAU_PROVIDER', {
        is: Joi.valid('cibil', 'experian', 'equifax', 'crif'),
        then: Joi.string().uri().required(),
    }),
    BUREAU_API_KEY: Joi.string().when('BUREAU_PROVIDER', {
        is: Joi.valid('cibil', 'experian', 'equifax', 'crif'),
        then: Joi.string().required(),
    }),
    BUREAU_TIMEOUT_MS: Joi.number().integer().default(20000),

    // ── Payment Gateway (Razorpay) ─────────────────────────────────────────────
    PAYMENT_PROVIDER: Joi.string()
        .valid('razorpay', 'stub')
        .default('stub'),

    RAZORPAY_KEY_ID: Joi.string().when('PAYMENT_PROVIDER', {
        is: 'razorpay',
        then: Joi.string().required(),
    }),
    RAZORPAY_KEY_SECRET: Joi.string().when('PAYMENT_PROVIDER', {
        is: 'razorpay',
        then: Joi.string().required(),
    }),
    RAZORPAY_WEBHOOK_SECRET: Joi.string().when('PAYMENT_PROVIDER', {
        is: 'razorpay',
        then: Joi.string().required(),
    }),
    RAZORPAY_ACCOUNT_NUMBER: Joi.string().when('PAYMENT_PROVIDER', {
        is: 'razorpay',
        then: Joi.string().required(),
    }),

    // ── SMS (Twilio / MSG91) ──────────────────────────────────────────────────
    SMS_PROVIDER: Joi.string()
        .valid('twilio', 'msg91', 'stub')
        .default('stub'),

    TWILIO_ACCOUNT_SID: Joi.string().when('SMS_PROVIDER', {
        is: 'twilio',
        then: Joi.string().required(),
    }),
    TWILIO_AUTH_TOKEN: Joi.string().when('SMS_PROVIDER', {
        is: 'twilio',
        then: Joi.string().required(),
    }),
    TWILIO_FROM_NUMBER: Joi.string().when('SMS_PROVIDER', {
        is: 'twilio',
        then: Joi.string().required(),
    }),

    MSG91_AUTH_KEY: Joi.string().when('SMS_PROVIDER', {
        is: 'msg91',
        then: Joi.string().required(),
    }),
    MSG91_SENDER_ID: Joi.string().when('SMS_PROVIDER', {
        is: 'msg91',
        then: Joi.string().required(),
    }),
    MSG91_TEMPLATE_ID: Joi.string().when('SMS_PROVIDER', {
        is: 'msg91',
        then: Joi.string().required(),
    }),

    // ── Email (Resend) ────────────────────────────────────────────────────────
    EMAIL_PROVIDER: Joi.string()
        .valid('resend', 'stub')
        .default('stub'),

    RESEND_API_KEY: Joi.string().when('EMAIL_PROVIDER', {
        is: 'resend',
        then: Joi.string().required(),
    }),
    EMAIL_FROM_ADDRESS: Joi.string()
        .email()
        .default('noreply@feuhrer.in'),

    // ── Rate Limiting ─────────────────────────────────────────────────────────
    RATE_LIMIT_WINDOW_MS: Joi.number().integer().default(60_000),       // 1 min
    RATE_LIMIT_MAX_REQUESTS: Joi.number().integer().default(100),
    RATE_LIMIT_KYC_MAX: Joi.number().integer().default(5),              // KYC calls cost money
    RATE_LIMIT_WEBHOOK_MAX: Joi.number().integer().default(500),        // Razorpay can burst

    // ── Logging ───────────────────────────────────────────────────────────────
    LOG_LEVEL: Joi.string()
        .valid('error', 'warn', 'info', 'http', 'debug')
        .default('info'),

    LOG_PRETTY: Joi.boolean().default(false).when('NODE_ENV', {
        is: 'development',
        then: Joi.boolean().default(true),
    }),

    // ── Encryption ────────────────────────────────────────────────────────────
    // Used in dev/test only — production uses AWS KMS
    LOCAL_ENCRYPTION_KEY: Joi.string()
        .length(64)  // 32 bytes hex-encoded
        .when('NODE_ENV', {
            is: Joi.valid('development', 'test'),
            then: Joi.string().required(),
        }),

    // ── Business Rules ────────────────────────────────────────────────────────
    MAX_LOAN_AMOUNT: Joi.number().positive().default(500_000),          // ₹5L
    MIN_LOAN_AMOUNT: Joi.number().positive().default(5_000),            // ₹5K
    MAX_TENURE_MONTHS: Joi.number().integer().positive().default(36),
    MIN_TENURE_MONTHS: Joi.number().integer().positive().default(3),
    MIN_CREDIT_SCORE: Joi.number().integer().min(300).max(900).default(650),
    NPA_OVERDUE_DAYS: Joi.number().integer().positive().default(90),

    // ── CORS ──────────────────────────────────────────────────────────────────
    CORS_ALLOWED_ORIGINS: Joi.string().default(''),
    // Comma-separated list e.g. "https://app.feuhrer.in,https://admin.feuhrer.in"

}).unknown(true); // Fail on any undeclared env var in production

// ─── Validate ─────────────────────────────────────────────────────────────────

const { error, value } = schema.validate(process.env, {
    abortEarly: false,   // Report ALL errors, not just the first
    convert: true,       // Convert string "true"/"false" to booleans
    allowUnknown: process.env.NODE_ENV !== 'production', // Strict in prod
});

if (error) {
    console.error('\n❌  FATAL: Invalid environment configuration\n');
    error.details.forEach((detail) => {
        console.error(`   • ${detail.message}`);
    });
    console.error('\n   Fix the above errors before starting the server.\n');
    process.exit(1);
}

// ─── Typed export ─────────────────────────────────────────────────────────────
// One single source of truth — import `env` everywhere, never `process.env`

export const env = {
    nodeEnv: value.NODE_ENV as 'development' | 'staging' | 'production' | 'test',
    port: value.PORT as number,
    appName: value.APP_NAME as string,
    apiVersion: value.API_VERSION as string,
    isProd: value.NODE_ENV === 'production',
    isTest: value.NODE_ENV === 'test',
    isDev: value.NODE_ENV === 'development',

    db: {
        url: value.DATABASE_URL as string,
        poolMin: value.DATABASE_POOL_MIN as number,
        poolMax: value.DATABASE_POOL_MAX as number,
        ssl: value.DATABASE_SSL as boolean,
    },

    redis: {
        url: value.REDIS_URL as string,
        tls: value.REDIS_TLS as boolean,
    },

    auth: {
        jwtSecret: value.JWT_SECRET as string,
        jwtExpiry: value.JWT_EXPIRY as string,
    },

    aws: {
        region: value.AWS_REGION as string,
        accessKeyId: value.AWS_ACCESS_KEY_ID as string | undefined,
        secretAccessKey: value.AWS_SECRET_ACCESS_KEY as string | undefined,
        kmsKeyId: value.AWS_KMS_KEY_ID as string | undefined,
        s3Bucket: value.AWS_S3_BUCKET as string,
        s3SignedUrlExpiry: value.AWS_S3_SIGNED_URL_EXPIRY as number,
        secretsEnabled: value.AWS_SECRETS_MANAGER_ENABLED as boolean,
    },

    kyc: {
        provider: value.KYC_PROVIDER as 'signzy' | 'stub',
        baseUrl: value.SIGNZY_BASE_URL as string | undefined,
        apiKey: value.SIGNZY_API_KEY as string | undefined,
        timeoutMs: value.SIGNZY_TIMEOUT_MS as number,
    },

    bureau: {
        provider: value.BUREAU_PROVIDER as string,
        apiUrl: value.BUREAU_API_URL as string | undefined,
        apiKey: value.BUREAU_API_KEY as string | undefined,
        timeoutMs: value.BUREAU_TIMEOUT_MS as number,
    },

    payment: {
        provider: value.PAYMENT_PROVIDER as 'razorpay' | 'stub',
        razorpay: {
            keyId: value.RAZORPAY_KEY_ID as string | undefined,
            keySecret: value.RAZORPAY_KEY_SECRET as string | undefined,
            webhookSecret: value.RAZORPAY_WEBHOOK_SECRET as string | undefined,
            accountNumber: value.RAZORPAY_ACCOUNT_NUMBER as string | undefined,
        },
    },

    sms: {
        provider: value.SMS_PROVIDER as 'twilio' | 'msg91' | 'stub',
        twilio: {
            accountSid: value.TWILIO_ACCOUNT_SID as string | undefined,
            authToken: value.TWILIO_AUTH_TOKEN as string | undefined,
            fromNumber: value.TWILIO_FROM_NUMBER as string | undefined,
        },
        msg91: {
            authKey: value.MSG91_AUTH_KEY as string | undefined,
            senderId: value.MSG91_SENDER_ID as string | undefined,
            templateId: value.MSG91_TEMPLATE_ID as string | undefined,
        },
    },

    email: {
        provider: value.EMAIL_PROVIDER as 'resend' | 'stub',
        resendApiKey: value.RESEND_API_KEY as string | undefined,
        fromAddress: value.EMAIL_FROM_ADDRESS as string,
    },

    rateLimit: {
        windowMs: value.RATE_LIMIT_WINDOW_MS as number,
        maxRequests: value.RATE_LIMIT_MAX_REQUESTS as number,
        kycMax: value.RATE_LIMIT_KYC_MAX as number,
        webhookMax: value.RATE_LIMIT_WEBHOOK_MAX as number,
    },

    logging: {
        level: value.LOG_LEVEL as string,
        pretty: value.LOG_PRETTY as boolean,
    },

    encryption: {
        localKey: value.LOCAL_ENCRYPTION_KEY as string | undefined,
    },

    business: {
        maxLoanAmount: value.MAX_LOAN_AMOUNT as number,
        minLoanAmount: value.MIN_LOAN_AMOUNT as number,
        maxTenureMonths: value.MAX_TENURE_MONTHS as number,
        minTenureMonths: value.MIN_TENURE_MONTHS as number,
        minCreditScore: value.MIN_CREDIT_SCORE as number,
        npaOverdueDays: value.NPA_OVERDUE_DAYS as number,
    },

    cors: {
        allowedOrigins: (value.CORS_ALLOWED_ORIGINS as string)
            .split(',')
            .map((o: string) => o.trim())
            .filter(Boolean),
    },
} as const;

export type Env = typeof env;