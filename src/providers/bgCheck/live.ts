// src/providers/bgCheck/live.ts
//
// Background Check — production implementation (PLACEHOLDER).
//
// ─── HOW TO ACTIVATE ──────────────────────────────────────────────────────────
// 1. Obtain credentials from AuthBridge or Perfios
// 2. Confirm endpoint paths from vendor API documentation
// 3. Add BG_CHECK_PROVIDER=authbridge (or perfios) to config/env.ts
// 4. Update bgCheck/index.ts to read env.bgCheck.provider
// 5. Replace PLACEHOLDER endpoint paths below with confirmed paths
//
// ─── VENDOR OPTIONS ───────────────────────────────────────────────────────────
// Option A: AuthBridge (original plan per app workflow doc)
//   - Criminal & legal background check
//   - Court records, police records, legal notices
//
// Option B: Perfios (if consolidating all checks under one vendor)
//   - Same checks available under Perfios risk suite
//
// NOTE: Background checks are often ASYNC (10–30 min processing).
// The check() method initiates and returns PENDING if async.
// A webhook or polling via getStatus() completes the flow.
// Wire the webhook handler in agents.service when activating.
// ─────────────────────────────────────────────────────────────────────────────

import type { AxiosInstance } from 'axios';
import { createHttpClient, vendorCall } from '../_base/provider.utils';
import { createModuleLogger } from '@/config/logger';
import type {
    IBgCheckProvider,
    BgCheckInput,
    BgCheckResult,
    BgCheckStatus,
    BgCheckRecord,
} from './interface';

const log = createModuleLogger('bgCheck:live');

// ─── Vendor response shapes (PLACEHOLDER — verify against actual API docs) ────

interface VendorBgCheckResponse {
    status: string;
    data?: {
        checkStatus: string;         // 'CLEAR' | 'FLAGGED' | 'PENDING'
        referenceId: string;
        records: Array<{
            recordType: string;
            description: string;
            year: number | null;
            authority: string | null;
            caseStatus: string | null;
        }>;
    };
    error?: { code: string; message: string };
}

// ─── Shared mapper ─────────────────────────────────────────────────────────────

function mapResult(body: VendorBgCheckResponse): BgCheckResult {
    const d = body.data!;

    const records: BgCheckRecord[] = (d.records ?? []).map((r) => ({
        recordType: r.recordType as BgCheckRecord['recordType'],
        description: r.description,
        year: r.year ?? null,
        authority: r.authority ?? null,
        caseStatus: r.caseStatus ?? null,
    }));

    return {
        status: d.checkStatus as BgCheckStatus,
        records,
        referenceId: d.referenceId ?? null,
        rawResponse: body,
    };
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export class LiveBgCheckProvider implements IBgCheckProvider {
    private readonly client: AxiosInstance;

    constructor(apiKey: string, baseUrl: string) {
        this.client = createHttpClient({
            baseURL: baseUrl,
            timeoutMs: 30_000,   // Background checks can be slow
            headers: { 'x-api-key': apiKey },
            vendor: 'bgcheck',
        });

        log.info('LiveBgCheckProvider initialised', { baseUrl });
    }

    // ── Initiate check ────────────────────────────────────────────────────────

    async check(input: BgCheckInput): Promise<BgCheckResult> {
        return vendorCall({
            vendor: 'bgcheck',
            fn: async () => {
                // PLACEHOLDER: replace '/background/check' with confirmed endpoint
                let res: { data: VendorBgCheckResponse };

                try {
                    res = await this.client.post<VendorBgCheckResponse>(
                        '/background/check', // PLACEHOLDER
                        {
                            fullName: input.fullName,
                            dob: input.dob,
                            pan: input.panNumber,
                            aadhaarLast4: input.aadhaarLast4,
                            address: input.address,
                        },
                    );
                } catch (err: unknown) {
                    log.error('Background check HTTP error', {
                        pan: input.panNumber.slice(-4),
                    });
                    throw err;
                }

                const body = res.data;

                if (body.status !== 'SUCCESS' || !body.data) {
                    throw new Error(
                        `Background check failed: ${body.error?.message ?? 'unknown error'}`,
                    );
                }

                const result = mapResult(body);

                log.info('Background check initiated', {
                    pan: input.panNumber.slice(-4),
                    status: result.status,
                    referenceId: result.referenceId,
                });

                return result;
            },
            retry: { maxAttempts: 2, delayMs: 1000 },
        });
    }

    // ── Poll status ───────────────────────────────────────────────────────────

    async getStatus(referenceId: string): Promise<BgCheckResult> {
        return vendorCall({
            vendor: 'bgcheck',
            fn: async () => {
                // PLACEHOLDER: replace '/background/status/:id' with confirmed endpoint
                let res: { data: VendorBgCheckResponse };

                try {
                    res = await this.client.get<VendorBgCheckResponse>(
                        `/background/status/${encodeURIComponent(referenceId)}`, // PLACEHOLDER
                    );
                } catch (err: unknown) {
                    log.error('Background check getStatus HTTP error', {
                        referenceId,
                    });
                    throw err;
                }

                const body = res.data;

                if (body.status !== 'SUCCESS' || !body.data) {
                    throw new Error(
                        `Background check status failed: ${body.error?.message ?? 'unknown error'}`,
                    );
                }

                const result = mapResult(body);

                log.info('Background check status fetched', {
                    referenceId,
                    status: result.status,
                });

                return result;
            },
            retry: { maxAttempts: 3, delayMs: 500 },
        });
    }
}