// src/config/secrets.ts
//
// In production: all vendor API keys live in AWS Secrets Manager, never in env vars.
// At startup, this module fetches them once, caches them in memory, and exposes
// a typed getSecret() function. The rest of the codebase never calls AWS SDK directly.
//
// In development/test: returns values from env vars directly (stub mode).

import {
    SecretsManagerClient,
    GetSecretValueCommand,
    type GetSecretValueCommandOutput,
} from '@aws-sdk/client-secrets-manager';
import { env } from './env';
import { logger } from './logger';

// ─── Secret names (must match what's created in AWS Secrets Manager) ──────────

const SECRET_NAMES = {
    SIGNZY: 'feuhrer/signzy',
    RAZORPAY: 'feuhrer/razorpay',
    CREDIT_BUREAU: 'feuhrer/credit-bureau',
    TWILIO: 'feuhrer/twilio',
    MSG91: 'feuhrer/msg91',
    RESEND: 'feuhrer/resend',
    JWT: 'feuhrer/jwt',
    KMS: 'feuhrer/kms',
} as const;

// ─── Typed secret shapes ───────────────────────────────────────────────────────

interface SignzySecret {
    apiKey: string;
    baseUrl: string;
}

interface RazorpaySecret {
    keyId: string;
    keySecret: string;
    webhookSecret: string;
    accountNumber: string;
}

interface CreditBureauSecret {
    apiKey: string;
    apiUrl: string;
    provider: string;
}

interface TwilioSecret {
    accountSid: string;
    authToken: string;
    fromNumber: string;
}

interface Msg91Secret {
    authKey: string;
    senderId: string;
    templateId: string;
}

interface ResendSecret {
    apiKey: string;
}

export interface AllSecrets {
    signzy: SignzySecret;
    razorpay: RazorpaySecret;
    creditBureau: CreditBureauSecret;
    twilio: TwilioSecret;
    msg91: Msg91Secret;
    resend: ResendSecret;
}

// ─── In-memory cache ───────────────────────────────────────────────────────────
// Fetched once at startup. Refreshed only on explicit cache bust
// (e.g. after a secret rotation — App Runner restart handles this naturally)

let secretsCache: AllSecrets | null = null;

// ─── AWS Secrets Manager client ────────────────────────────────────────────────

const smClient = new SecretsManagerClient({
    region: env.aws.region,
    ...(env.aws.accessKeyId
        ? {
            credentials: {
                accessKeyId: env.aws.accessKeyId,
                secretAccessKey: env.aws.secretAccessKey!,
            },
        }
        : {}), // On App Runner, IAM role provides credentials automatically
});

async function fetchSecret<T>(secretName: string): Promise<T> {
    const command = new GetSecretValueCommand({ SecretId: secretName });
    let response: GetSecretValueCommandOutput;

    try {
        response = await smClient.send(command);
    } catch (error: any) {
        throw new Error(
            `Failed to fetch secret "${secretName}": ${error.message}`,
        );
    }

    if (!response.SecretString) {
        throw new Error(`Secret "${secretName}" is empty or binary — expected JSON string`);
    }

    try {
        return JSON.parse(response.SecretString) as T;
    } catch {
        throw new Error(`Secret "${secretName}" is not valid JSON`);
    }
}

// ─── Stub secrets (dev / test) ────────────────────────────────────────────────
// Pulled directly from env vars — no AWS call needed

function buildStubSecrets(): AllSecrets {
    return {
        signzy: {
            apiKey: env.kyc.apiKey ?? 'stub-signzy-key',
            baseUrl: env.kyc.baseUrl ?? 'https://stub.signzy.local',
        },
        razorpay: {
            keyId: env.payment.razorpay.keyId ?? 'rzp_test_stub',
            keySecret: env.payment.razorpay.keySecret ?? 'stub-secret',
            webhookSecret: env.payment.razorpay.webhookSecret ?? 'stub-webhook-secret',
            accountNumber: env.payment.razorpay.accountNumber ?? '1234567890',
        },
        creditBureau: {
            provider: env.bureau.provider,
            apiKey: env.bureau.apiKey ?? 'stub-bureau-key',
            apiUrl: env.bureau.apiUrl ?? 'https://stub.bureau.local',
        },
        twilio: {
            accountSid: env.sms.twilio.accountSid ?? 'stub-sid',
            authToken: env.sms.twilio.authToken ?? 'stub-token',
            fromNumber: env.sms.twilio.fromNumber ?? '+919999999999',
        },
        msg91: {
            authKey: env.sms.msg91.authKey ?? 'stub-msg91-key',
            senderId: env.sms.msg91.senderId ?? 'FEUHR',
            templateId: env.sms.msg91.templateId ?? 'stub-template',
        },
        resend: {
            apiKey: env.email.resendApiKey ?? 're_stub_key',
        },
    };
}

// ─── Main loader ───────────────────────────────────────────────────────────────

export async function loadSecrets(): Promise<AllSecrets> {
    // Return cached secrets if already loaded
    if (secretsCache) return secretsCache;

    // In dev/test: skip AWS — use env vars
    if (!env.aws.secretsEnabled) {
        logger.info('Secrets: using stub mode (env vars)');
        secretsCache = buildStubSecrets();
        return secretsCache;
    }

    logger.info('Secrets: loading from AWS Secrets Manager...');

    try {
        // Fetch all secrets in parallel — fail fast if any are missing
        const [signzy, razorpay, creditBureau, twilio, msg91, resend] =
            await Promise.all([
                fetchSecret<SignzySecret>(SECRET_NAMES.SIGNZY),
                fetchSecret<RazorpaySecret>(SECRET_NAMES.RAZORPAY),
                fetchSecret<CreditBureauSecret>(SECRET_NAMES.CREDIT_BUREAU),
                fetchSecret<TwilioSecret>(SECRET_NAMES.TWILIO),
                fetchSecret<Msg91Secret>(SECRET_NAMES.MSG91),
                fetchSecret<ResendSecret>(SECRET_NAMES.RESEND),
            ]);

        secretsCache = { signzy, razorpay, creditBureau, twilio, msg91, resend };

        logger.info('Secrets: all loaded successfully', {
            secrets: Object.keys(secretsCache),
        });

        return secretsCache;
    } catch (error: any) {
        logger.error('Secrets: failed to load from AWS Secrets Manager', {
            error: error.message,
        });
        throw error; // Fatal — server must not start without secrets
    }
}

// ─── Accessor ─────────────────────────────────────────────────────────────────
// Call getSecrets() anywhere after loadSecrets() has run at startup

export function getSecrets(): AllSecrets {
    if (!secretsCache) {
        throw new Error(
            'Secrets not loaded. Call loadSecrets() during app startup before accessing secrets.',
        );
    }
    return secretsCache;
}

// ─── For testing: clear cache between tests ────────────────────────────────────

export function _clearSecretsCache(): void {
    secretsCache = null;
}