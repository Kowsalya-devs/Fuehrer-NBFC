// src/providers/gstVerify/live.ts
//
// Perfios GST Authentication + GST Certificate Parsing — production (PLACEHOLDER).
//
// ─── HOW TO ACTIVATE ──────────────────────────────────────────────────────────
// 1. Obtain Perfios API credentials (same account as other Perfios providers)
// 2. Confirm endpoint paths from Perfios API documentation
// 3. Add GST_VERIFY_PROVIDER=perfios to config/env.ts
// 4. Update gstVerify/index.ts to read env.gstVerify.provider
// 5. Replace PLACEHOLDER endpoint paths below with confirmed paths
// 6. Add gstin + gst_verified columns to agents table (Prisma migration)
//
// ─── PERFIOS APIS USED ────────────────────────────────────────────────────────
// - GST Authentication           → validates GSTIN against GST portal
// - GST Certificate Parsing (OCR) → extracts data from GST certificate image
// ─────────────────────────────────────────────────────────────────────────────

import type { AxiosInstance } from 'axios';
import { createHttpClient, vendorCall } from '../_base/provider.utils';
import { createModuleLogger } from '@/config/logger';
import type {
    IGstVerifyProvider,
    GstVerifyInput,
    GstVerifyResult,
    GstRegistrationStatus,
    GstCertificateParseInput,
    GstCertificateParseResult,
} from './interface';

const log = createModuleLogger('gstVerify:perfios');

// ─── Perfios response shapes (PLACEHOLDER — verify against actual API docs) ───

interface PerfiosGstAuthResponse {
    status: string;
    data?: {
        valid: boolean;
        registrationStatus: string;
        legalName: string | null;
        tradeName: string | null;
        businessType: string | null;
        stateCode: string;
        registrationDate: string | null;
        nameMatchScore: number | null;
    };
    error?: { code: string; message: string };
}

interface PerfiosGstOcrResponse {
    status: string;
    data?: {
        gstin: string | null;
        legalName: string | null;
        tradeName: string | null;
        registrationDate: string | null;
        address: string | null;
    };
    error?: { code: string; message: string };
}

// ─── Status mapping ───────────────────────────────────────────────────────────

function mapStatus(raw: string): GstRegistrationStatus {
    const map: Record<string, GstRegistrationStatus> = {
        ACTIVE: 'ACTIVE',
        CANCELLED: 'CANCELLED',
        SUSPENDED: 'SUSPENDED',
        PENDING: 'PENDING',
    };
    return map[raw?.toUpperCase()] ?? 'CANCELLED';
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export class PerfiosGstVerifyProvider implements IGstVerifyProvider {
    private readonly client: AxiosInstance;

    constructor(apiKey: string, baseUrl: string, clientId: string) {
        this.client = createHttpClient({
            baseURL: baseUrl,
            timeoutMs: 15_000,
            headers: {
                'x-api-key': apiKey,
                'x-client-id': clientId,
            },
            vendor: 'perfios-gst',
        });

        log.info('PerfiosGstVerifyProvider initialised', { baseUrl });
    }

    // ── 1. GST Authentication ─────────────────────────────────────────────────

    async authenticate(input: GstVerifyInput): Promise<GstVerifyResult> {
        return vendorCall({
            vendor: 'perfios-gst',
            fn: async () => {
                // PLACEHOLDER: replace '/gst/authenticate' with confirmed
                // Perfios GST Authentication endpoint
                let res: { data: PerfiosGstAuthResponse };

                try {
                    res = await this.client.post<PerfiosGstAuthResponse>(
                        '/gst/authenticate', // PLACEHOLDER
                        {
                            gstin: input.gstin,
                            businessName: input.businessName,
                        },
                    );
                } catch (err: unknown) {
                    log.error('Perfios GST authenticate HTTP error', {
                        gstin: input.gstin,
                    });
                    throw err;
                }

                const body = res.data;

                if (body.status !== 'SUCCESS' || !body.data) {
                    log.error('Perfios GST authenticate failed', {
                        code: body.error?.code,
                        message: body.error?.message,
                    });
                    throw new Error(
                        `Perfios GST authenticate failed: ${body.error?.message ?? 'unknown error'}`,
                    );
                }

                const d = body.data;
                const status = mapStatus(d.registrationStatus);
                const valid = d.valid && status === 'ACTIVE';

                log.info('Perfios GST authenticate complete', {
                    gstin: input.gstin,
                    valid,
                    status,
                });

                return {
                    valid,
                    registrationStatus: status,
                    legalName: d.legalName ?? null,
                    tradeName: d.tradeName ?? null,
                    businessType: d.businessType ?? null,
                    stateCode: d.stateCode,
                    registrationDate: d.registrationDate ?? null,
                    nameMatchScore: d.nameMatchScore ?? null,
                    rawResponse: body,
                };
            },
            retry: { maxAttempts: 2, delayMs: 1000 },
        });
    }

    // ── 2. GST Certificate Parsing (OCR) ──────────────────────────────────────

    async parseGstCertificate(
        input: GstCertificateParseInput,
    ): Promise<GstCertificateParseResult> {
        return vendorCall({
            vendor: 'perfios-gst',
            fn: async () => {
                // PLACEHOLDER: replace '/gst/ocr' with confirmed
                // Perfios GST Certificate Parsing endpoint
                let res: { data: PerfiosGstOcrResponse };

                try {
                    res = await this.client.post<PerfiosGstOcrResponse>(
                        '/gst/ocr', // PLACEHOLDER
                        {
                            document: input.documentBase64,
                            contentType: input.contentType,
                        },
                    );
                } catch (err: unknown) {
                    log.error('Perfios GST OCR HTTP error');
                    throw err;
                }

                const body = res.data;

                if (body.status !== 'SUCCESS' || !body.data) {
                    log.error('Perfios GST OCR failed', {
                        code: body.error?.code,
                        message: body.error?.message,
                    });
                    throw new Error(
                        `Perfios GST OCR failed: ${body.error?.message ?? 'unknown error'}`,
                    );
                }

                const d = body.data;

                log.info('Perfios GST certificate parsed', {
                    gstin: d.gstin,
                });

                return {
                    gstin: d.gstin ?? null,
                    legalName: d.legalName ?? null,
                    tradeName: d.tradeName ?? null,
                    registrationDate: d.registrationDate ?? null,
                    address: d.address ?? null,
                    rawResponse: body,
                };
            },
            retry: { maxAttempts: 2, delayMs: 1000 },
        });
    }
}
