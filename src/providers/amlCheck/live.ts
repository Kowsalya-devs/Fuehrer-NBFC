// src/providers/amlCheck/live.ts
//
// Perfios AML Sanctions Screening — production implementation (PLACEHOLDER).
//
// ─── HOW TO ACTIVATE ──────────────────────────────────────────────────────────
// 1. Obtain Perfios API credentials from your Perfios account manager
// 2. Add to AWS Secrets Manager: feuhrer/perfios
//    { "apiKey": "...", "baseUrl": "https://api.perfios.com", "clientId": "..." }
// 3. Add to config/env.ts:
//    AML_PROVIDER: Joi.string().valid('perfios', 'stub').default('stub')
//    PERFIOS_BASE_URL, PERFIOS_API_KEY, PERFIOS_CLIENT_ID
// 4. Add to config/secrets.ts: perfios: { apiKey, baseUrl, clientId }
// 5. Update amlCheck/index.ts to read env.aml.provider
// 6. Replace the PLACEHOLDER comment below with real endpoint paths
//    confirmed from Perfios API documentation
//
// ─── PERFIOS APIS USED ────────────────────────────────────────────────────────
// - AML Sanctions Screening  → checks UN/OFAC/EU/domestic blacklists
// - PEP Details API          → politically exposed person check
// - Bank Defaulters          → RBI + CIBIL wilful defaulters list
// - Alerts API               → adverse media and court records
//
// All four are called in parallel and results are merged into AmlCheckResult.
// ─────────────────────────────────────────────────────────────────────────────

import type { AxiosInstance } from 'axios';
import { createHttpClient, vendorCall } from '../_base/provider.utils';
import { createModuleLogger } from '@/config/logger';
import type {
    IAmlCheckProvider,
    AmlCheckInput,
    AmlCheckResult,
    AmlHit,
} from './interface';

const log = createModuleLogger('amlCheck:perfios');

// ─── Perfios response shapes (PLACEHOLDER — verify against actual API docs) ───

interface PerfiosAmlResponse {
    status: string;           // 'SUCCESS' | 'FAILED'
    data?: {
        sanctionsHit: boolean;
        pepHit: boolean;
        defaulterHit: boolean;
        alertsHit: boolean;
        matches: Array<{
            listName: string;
            matchScore: number;
            category: string;
            description: string;
        }>;
    };
    error?: { code: string; message: string };
}

export class PerfiosAmlProvider implements IAmlCheckProvider {
    private readonly client: AxiosInstance;

    constructor(apiKey: string, baseUrl: string, clientId: string) {
        this.client = createHttpClient({
            baseURL: baseUrl,
            timeoutMs: 15_000,
            headers: {
                'x-api-key': apiKey,
                'x-client-id': clientId,
            },
            vendor: 'perfios-aml',
        });

        log.info('PerfiosAmlProvider initialised', { baseUrl });
    }

    async check(input: AmlCheckInput): Promise<AmlCheckResult> {
        return vendorCall({
            vendor: 'perfios-aml',
            fn: async () => {
                // PLACEHOLDER: replace '/aml/screen' with the actual
                // Perfios AML Sanctions Screening endpoint path once
                // API documentation is confirmed
                let res: { data: PerfiosAmlResponse };

                try {
                    res = await this.client.post<PerfiosAmlResponse>(
                        '/aml/screen', // PLACEHOLDER — confirm endpoint
                        {
                            fullName: input.fullName,
                            dob: input.dob,
                            pan: input.panNumber,
                            aadhaarLast4: input.aadhaarLast4 ?? '',
                            checks: [
                                'SANCTIONS',
                                'PEP',
                                'DEFAULTER',
                                'ALERTS',
                            ],
                        },
                    );
                } catch (err: unknown) {
                    log.error('Perfios AML check HTTP error', {
                        pan: input.panNumber.slice(-4),
                    });
                    throw err;
                }

                const body = res.data;

                if (body.status !== 'SUCCESS' || !body.data) {
                    log.error('Perfios AML check failed', {
                        code: body.error?.code,
                        message: body.error?.message,
                    });
                    throw new Error(
                        `Perfios AML check failed: ${body.error?.message ?? 'unknown error'}`,
                    );
                }

                const d = body.data;

                const hits: AmlHit[] = (d.matches ?? []).map((m) => ({
                    listName: m.listName,
                    matchScore: m.matchScore,
                    category: m.category as AmlHit['category'],
                    description: m.description,
                }));

                const clear = !d.sanctionsHit &&
                    !d.pepHit &&
                    !d.defaulterHit &&
                    !d.alertsHit;

                log.info('Perfios AML check complete', {
                    pan: input.panNumber.slice(-4),
                    clear,
                    hitCount: hits.length,
                    isPep: d.pepHit,
                    isDefaulter: d.defaulterHit,
                });

                return {
                    clear,
                    hits,
                    isPep: d.pepHit,
                    isDefaulter: d.defaulterHit,
                    rawResponse: body,
                };
            },
            retry: { maxAttempts: 2, delayMs: 1000 },
        });
    }
}
