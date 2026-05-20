// src/errors/VendorErrors.ts
import { AppError } from './AppError';
import { HTTP } from '@/config/constants';

// ─── Base vendor error ────────────────────────────────────────────────────────

export class VendorError extends AppError {
    public readonly vendor: string;
    public readonly vendorCode?: string;     // The vendor's own error code
    public readonly vendorMessage?: string;  // The vendor's raw message
    public readonly retryable: boolean;

    constructor(options: {
        vendor: string;
        message: string;
        errorCode: string;
        statusCode?: number;
        vendorCode?: string;
        vendorMessage?: string;
        retryable?: boolean;
        cause?: unknown;
    }) {
        super({
            message: options.message,
            statusCode: options.statusCode ?? HTTP.BAD_GATEWAY,
            errorCode: options.errorCode,
            details: {
                vendor: options.vendor,
                vendorCode: options.vendorCode ?? null,
                vendorMessage: options.vendorMessage ?? null,
                retryable: options.retryable ?? false,
            },
            cause: options.cause,
        });

        this.vendor = options.vendor;
        this.vendorCode = options.vendorCode;
        this.vendorMessage = options.vendorMessage;
        this.retryable = options.retryable ?? false;
    }
}

// ─── KYC vendor errors (Signzy) ────────────────────────────────────────────────

export class KycVendorError extends VendorError {
    public readonly checkType: string;

    constructor(options: {
        checkType: string;
        message: string;
        vendorCode?: string;
        vendorMessage?: string;
        retryable?: boolean;
        cause?: unknown;
    }) {
        super({
            vendor: 'signzy',
            message: options.message,
            errorCode: 'KYC_VENDOR_ERROR',
            vendorCode: options.vendorCode,
            vendorMessage: options.vendorMessage,
            retryable: options.retryable ?? false,
            cause: options.cause,
        });

        this.checkType = options.checkType;
    }
}

export const KYC_VENDOR_ERRORS = {
    aadhaarVerifyFailed: (cause?: unknown) =>
        new KycVendorError({
            checkType: 'AADHAAR_VERIFY',
            message: 'Aadhaar verification failed at provider',
            retryable: true,
            cause,
        }),

    panVerifyFailed: (cause?: unknown) =>
        new KycVendorError({
            checkType: 'PAN_VERIFY',
            message: 'PAN verification failed at provider',
            retryable: true,
            cause,
        }),

    faceMatchFailed: (cause?: unknown) =>
        new KycVendorError({
            checkType: 'FACE_MATCH',
            message: 'Face match check failed at provider',
            retryable: true,
            cause,
        }),

    livenessFailed: (cause?: unknown) =>
        new KycVendorError({
            checkType: 'LIVENESS',
            message: 'Liveness check failed at provider',
            retryable: true,
            cause,
        }),

    bankStatementFailed: (cause?: unknown) =>
        new KycVendorError({
            checkType: 'BANK_STATEMENT',
            message: 'Bank statement analysis failed at provider',
            retryable: true,
            cause,
        }),

    eSignFailed: (cause?: unknown) =>
        new KycVendorError({
            checkType: 'ESIGN',
            message: 'eSign request failed at provider',
            retryable: false, // Don't auto-retry eSign — user interaction needed
            cause,
        }),

    timeout: (checkType: string) =>
        new KycVendorError({
            checkType,
            message: `Signzy timed out on ${checkType} check`,
            retryable: true,
        }),
} as const;

// ─── Credit Bureau errors ─────────────────────────────────────────────────────

export class BureauVendorError extends VendorError {
    constructor(options: {
        provider: string;
        message: string;
        vendorCode?: string;
        vendorMessage?: string;
        retryable?: boolean;
        cause?: unknown;
    }) {
        super({
            vendor: options.provider,
            message: options.message,
            errorCode: 'BUREAU_VENDOR_ERROR',
            vendorCode: options.vendorCode,
            vendorMessage: options.vendorMessage,
            retryable: options.retryable ?? true,
            cause: options.cause,
        });
    }
}

export const BUREAU_ERRORS = {
    fetchFailed: (provider: string, cause?: unknown) =>
        new BureauVendorError({
            provider,
            message: `Failed to fetch credit report from ${provider}`,
            retryable: true,
            cause,
        }),

    noHit: (provider: string) =>
        new BureauVendorError({
            provider,
            message: `No credit history found for this customer at ${provider}`,
            retryable: false,
        }),

    timeout: (provider: string) =>
        new BureauVendorError({
            provider,
            message: `${provider} request timed out`,
            retryable: true,
        }),
} as const;

// ─── Payment gateway errors (Razorpay) ───────────────────────────────────────

export class PaymentVendorError extends VendorError {
    constructor(options: {
        message: string;
        vendorCode?: string;
        vendorMessage?: string;
        retryable?: boolean;
        cause?: unknown;
    }) {
        super({
            vendor: 'razorpay',
            message: options.message,
            errorCode: 'PAYMENT_VENDOR_ERROR',
            statusCode: HTTP.BAD_GATEWAY,
            vendorCode: options.vendorCode,
            vendorMessage: options.vendorMessage,
            retryable: options.retryable ?? false,
            cause: options.cause,
        });
    }
}

export const PAYMENT_ERRORS = {
    mandateCreationFailed: (cause?: unknown) =>
        new PaymentVendorError({
            message: 'eNACH mandate creation failed',
            retryable: false,
            cause,
        }),

    debitFailed: (vendorCode?: string, vendorMessage?: string) =>
        new PaymentVendorError({
            message: 'Auto-debit failed',
            vendorCode,
            vendorMessage,
            retryable: false, // Debit failures are handled by the retry job
        }),

    payoutFailed: (cause?: unknown) =>
        new PaymentVendorError({
            message: 'Loan disbursement payout failed',
            retryable: true,
            cause,
        }),

    invalidWebhookSignature: () =>
        new PaymentVendorError({
            message: 'Razorpay webhook signature verification failed',
            retryable: false,
        }),

    timeout: () =>
        new PaymentVendorError({
            message: 'Razorpay API timed out',
            retryable: true,
        }),
} as const;

// ─── SMS vendor errors ────────────────────────────────────────────────────────

export class SmsVendorError extends VendorError {
    constructor(options: {
        provider: string;
        message: string;
        retryable?: boolean;
        cause?: unknown;
    }) {
        super({
            vendor: options.provider,
            message: options.message,
            errorCode: 'SMS_VENDOR_ERROR',
            retryable: options.retryable ?? true,
            cause: options.cause,
        });
    }
}

// ─── Storage vendor errors (AWS S3) ──────────────────────────────────────────

export class StorageVendorError extends VendorError {
    constructor(options: {
        operation: string;
        bucket?: string;
        key?: string;
        cause?: unknown;
    }) {
        super({
            vendor: 'aws-s3',
            message: `S3 ${options.operation} failed`,
            errorCode: 'STORAGE_VENDOR_ERROR',
            retryable: true,
            cause: options.cause,
            ...(options.bucket || options.key
                ? {
                    details: {
                        vendor: 'aws-s3',
                        operation: options.operation,
                        bucket: options.bucket ?? null,
                        key: options.key ?? null,
                    },
                }
                : {}),
        });
    }
}