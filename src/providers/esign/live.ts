// src/providers/esign/live.ts
//
// Signzy eSign + eStamp — production implementation.
//
// Flow:
//   1. createSignRequest  → POST /esign/create
//      Uploads the loan agreement PDF and creates a signing session.
//      Returns a signingUrl the customer opens to sign via Aadhaar OTP.
//
//   2. getSignStatus      → GET /esign/status/:requestId
//      Called by the Signzy webhook handler and admin poll endpoint.
//      Returns the signed document base64 when status === 'SIGNED'.
//
//   3. applyEStamp        → POST /estamp/apply
//      Applies a legal e-stamp to the signed document.
//      Must be called after status === 'SIGNED'.
//      Stamp duty is calculated by Signzy based on loan amount + state.
//
//   4. getSignedDocument  → GET /esign/document/:requestId
//      Fetches the final signed + stamped PDF as base64.
//      Caller uploads it to S3 and stores the key on the loan account.
//
// RBI compliance:
//   - Every loan disbursement is blocked until eSignStatus === 'SIGNED'
//     AND eStampStatus === 'APPLIED' (enforced in disbursement.service).
//   - Signed documents are retained for 5 years (S3 lifecycle policy).
//   - All Signzy raw responses are stored in kyc_documents.signzy_responses
//     for audit purposes — NEVER log them (may contain Aadhaar).

import type { AxiosInstance } from 'axios';
import { createHttpClient, vendorCall } from '../_base/provider.utils';
import { KYC_VENDOR_ERRORS } from '@/errors';
import { createModuleLogger } from '@/config/logger';
import type {
    IESignProvider,
    CreateSignRequestInput,
    CreateSignRequestResult,
    ESignStatusResult,
    ESignStatus,
    ApplyEStampInput,
    ApplyEStampResult,
    EStampStatus,
    GetSignedDocumentResult,
} from './interface';

const log = createModuleLogger('esign:signzy');

// ─── Signzy response shapes ───────────────────────────────────────────────────
// These mirror Signzy's actual API responses. Never export these — they are
// internal to this file. The provider converts them to our interface types.

interface SignzyCreateESignResponse {
    status: string;                  // 'SUCCESS' | 'FAILED'
    data?: {
        requestId: string;
        signingUrl: string;
        expiresAt: string;           // ISO date string
        documentId: string;
    };
    error?: {
        code: string;
        message: string;
    };
}

interface SignzyESignStatusResponse {
    status: string;                  // 'SUCCESS' | 'FAILED'
    data?: {
        requestId: string;
        signingStatus: string;       // 'PENDING' | 'SIGNED' | 'FAILED' | 'EXPIRED' | 'CANCELLED'
        signedAt: string | null;     // ISO date string
        signedDocument: string | null; // Base64 PDF — only when SIGNED
    };
    error?: {
        code: string;
        message: string;
    };
}

interface SignzyEStampResponse {
    status: string;                  // 'SUCCESS' | 'FAILED'
    data?: {
        stampId: string;
        stampStatus: string;         // 'APPLIED' | 'FAILED' | 'PENDING'
        stampDutyAmount: number;     // Rupees
        stampedDocument: string | null; // Base64 PDF
    };
    error?: {
        code: string;
        message: string;
    };
}

interface SignzyGetDocumentResponse {
    status: string;
    data?: {
        document: string;            // Base64 PDF
    };
    error?: {
        code: string;
        message: string;
    };
}

// ─── Status mapping ───────────────────────────────────────────────────────────

function mapSignzyStatus(raw: string): ESignStatus {
    const map: Record<string, ESignStatus> = {
        PENDING: 'PENDING',
        SIGNED: 'SIGNED',
        FAILED: 'FAILED',
        EXPIRED: 'EXPIRED',
        CANCELLED: 'CANCELLED',
    };
    return map[raw.toUpperCase()] ?? 'FAILED';
}

function mapEStampStatus(raw: string): EStampStatus {
    const map: Record<string, EStampStatus> = {
        PENDING: 'PENDING',
        APPLIED: 'APPLIED',
        FAILED: 'FAILED',
    };
    return map[raw.toUpperCase()] ?? 'FAILED';
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export class SignzyESignProvider implements IESignProvider {
    private readonly client: AxiosInstance;

    constructor(apiKey: string, baseUrl: string, timeoutMs: number) {
        this.client = createHttpClient({
            baseURL: baseUrl,
            timeoutMs,
            headers: { 'x-api-key': apiKey },
            vendor: 'signzy-esign',
        });

        log.info('SignzyESignProvider initialised', {
            baseUrl,
            timeoutMs,
        });
    }

    // ── 1. Create sign request ────────────────────────────────────────────────

    async createSignRequest(
        input: CreateSignRequestInput,
    ): Promise<CreateSignRequestResult> {
        return vendorCall({
            vendor: 'signzy-esign',
            fn: async () => {
                let res: { data: SignzyCreateESignResponse };

                try {
                    res = await this.client.post<SignzyCreateESignResponse>(
                        '/esign/create',
                        {
                            documentId: input.documentId,
                            document: input.documentBase64,
                            signerName: input.signerName,
                            signerPhone: input.signerPhone,
                            signerAadhaar: input.signerAadhaar,
                            purpose: input.purpose,
                            signatureType: 'AADHAAR_OTP',
                            // 24-hour expiry — RBI allows up to 30 days but
                            // shorter window reduces fraud exposure
                            expiryHours: 24,
                        },
                    );
                } catch (err: unknown) {
                    log.error('Signzy createSignRequest HTTP error', {
                        documentId: input.documentId,
                    });
                    throw KYC_VENDOR_ERRORS.eSignFailed(err);
                }

                const body = res.data;

                if (body.status !== 'SUCCESS' || !body.data) {
                    log.error('Signzy createSignRequest failed', {
                        documentId: input.documentId,
                        signzyCode: body.error?.code,
                        signzyMsg: body.error?.message,
                    });
                    throw KYC_VENDOR_ERRORS.eSignFailed(
                        new Error(body.error?.message ?? 'Signzy eSign creation failed'),
                    );
                }

                log.info('eSign request created', {
                    documentId: input.documentId,
                    requestId: body.data.requestId,
                });

                return {
                    requestId: body.data.requestId,
                    signingUrl: body.data.signingUrl,
                    status: 'PENDING',
                    expiresAt: new Date(body.data.expiresAt),
                };
            },
            retry: { maxAttempts: 2, delayMs: 1000 },
        });
    }

    // ── 2. Get sign status ────────────────────────────────────────────────────

    async getSignStatus(requestId: string): Promise<ESignStatusResult> {
        return vendorCall({
            vendor: 'signzy-esign',
            fn: async () => {
                let res: { data: SignzyESignStatusResponse };

                try {
                    res = await this.client.get<SignzyESignStatusResponse>(
                        `/esign/status/${encodeURIComponent(requestId)}`,
                    );
                } catch (err: unknown) {
                    log.error('Signzy getSignStatus HTTP error', { requestId });
                    throw KYC_VENDOR_ERRORS.eSignFailed(err);
                }

                const body = res.data;

                if (body.status !== 'SUCCESS' || !body.data) {
                    log.error('Signzy getSignStatus failed', {
                        requestId,
                        signzyCode: body.error?.code,
                    });
                    throw KYC_VENDOR_ERRORS.eSignFailed(
                        new Error(body.error?.message ?? 'Signzy eSign status check failed'),
                    );
                }

                const mappedStatus = mapSignzyStatus(body.data.signingStatus);

                log.info('eSign status fetched', {
                    requestId,
                    status: mappedStatus,
                });

                return {
                    requestId,
                    status: mappedStatus,
                    signedAt: body.data.signedAt
                        ? new Date(body.data.signedAt)
                        : null,
                    signedDocumentBase64: body.data.signedDocument ?? null,
                    rawResponse: body,
                };
            },
            retry: { maxAttempts: 3, delayMs: 500 },
        });
    }

    // ── 3. Apply eStamp ───────────────────────────────────────────────────────

    async applyEStamp(input: ApplyEStampInput): Promise<ApplyEStampResult> {
        return vendorCall({
            vendor: 'signzy-esign',
            fn: async () => {
                let res: { data: SignzyEStampResponse };

                try {
                    res = await this.client.post<SignzyEStampResponse>(
                        '/estamp/apply',
                        {
                            requestId: input.requestId,
                            loanAmount: input.loanAmountRupees,
                            stateCode: input.stateCode,
                            // Article 5 of Schedule I — loan agreement
                            articleType: 'LOAN_AGREEMENT',
                        },
                    );
                } catch (err: unknown) {
                    log.error('Signzy applyEStamp HTTP error', {
                        requestId: input.requestId,
                    });
                    throw KYC_VENDOR_ERRORS.eSignFailed(err);
                }

                const body = res.data;

                if (body.status !== 'SUCCESS' || !body.data) {
                    log.error('Signzy applyEStamp failed', {
                        requestId: input.requestId,
                        signzyCode: body.error?.code,
                        signzyMsg: body.error?.message,
                    });
                    throw KYC_VENDOR_ERRORS.eSignFailed(
                        new Error(body.error?.message ?? 'Signzy eStamp application failed'),
                    );
                }

                log.info('eStamp applied', {
                    requestId: input.requestId,
                    stampId: body.data.stampId,
                    stampDutyRupees: body.data.stampDutyAmount,
                });

                return {
                    stampId: body.data.stampId,
                    status: mapEStampStatus(body.data.stampStatus),
                    stampDutyRupees: body.data.stampDutyAmount,
                    stampedDocumentBase64: body.data.stampedDocument ?? null,
                    rawResponse: body,
                };
            },
            retry: { maxAttempts: 2, delayMs: 1000 },
        });
    }

    // ── 4. Get signed document ────────────────────────────────────────────────

    async getSignedDocument(requestId: string): Promise<GetSignedDocumentResult> {
        return vendorCall({
            vendor: 'signzy-esign',
            fn: async () => {
                let res: { data: SignzyGetDocumentResponse };

                try {
                    res = await this.client.get<SignzyGetDocumentResponse>(
                        `/esign/document/${encodeURIComponent(requestId)}`,
                    );
                } catch (err: unknown) {
                    log.error('Signzy getSignedDocument HTTP error', { requestId });
                    throw KYC_VENDOR_ERRORS.eSignFailed(err);
                }

                const body = res.data;

                if (body.status !== 'SUCCESS' || !body.data?.document) {
                    log.error('Signzy getSignedDocument failed', {
                        requestId,
                        signzyCode: body.error?.code,
                    });
                    throw KYC_VENDOR_ERRORS.eSignFailed(
                        new Error(
                            body.error?.message ?? 'Signzy signed document retrieval failed',
                        ),
                    );
                }

                log.info('Signed document retrieved', { requestId });

                return {
                    documentBase64: body.data.document,
                    s3Key: null, // Caller uploads to S3 and sets this
                };
            },
            retry: { maxAttempts: 3, delayMs: 500 },
        });
    }
}