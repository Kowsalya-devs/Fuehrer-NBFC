// src/providers/bankVerify/live.ts
//
// Perfios Bank Account Verification — production implementation (PLACEHOLDER).
//
// ─── HOW TO ACTIVATE ──────────────────────────────────────────────────────────
// 1. Obtain Perfios API credentials (same account as AML + fraudScore)
// 2. Confirm endpoint paths from Perfios API documentation
// 3. Add BANK_VERIFY_PROVIDER=perfios to config/env.ts
// 4. Update bankVerify/index.ts to read env.bankVerify.provider
// 5. Replace PLACEHOLDER endpoint paths below with confirmed paths
//
// ─── PERFIOS APIS USED ────────────────────────────────────────────────────────
// - Bank AC Verification          → basic penny drop
// - Bank AC Verification Advanced → penny drop + reverse penny drop
// - Silent Bank AC Verification   → UPI VPA lookup, no money transfer
// ─────────────────────────────────────────────────────────────────────────────

import type { AxiosInstance } from 'axios';
import { createHttpClient, vendorCall } from '../_base/provider.utils';
import { createModuleLogger } from '@/config/logger';
import type {
    IBankVerifyProvider,
    PennyDropInput,
    PennyDropResult,
    SilentVerifyInput,
    BankVerifyResult,
} from './interface';

const log = createModuleLogger('bankVerify:perfios');

// ─── Perfios response shapes (PLACEHOLDER — verify against actual API docs) ───

interface PerfiosBankVerifyResponse {
    status: string;
    data?: {
        valid: boolean;
        nameAtBank: string | null;
        nameMatchScore: number | null;
        ifscConfirmed: string | null;
        bankName: string | null;
        branchName: string | null;
        transactionId?: string | null;
    };
    error?: { code: string; message: string };
}

// ─── Shared result mapper ─────────────────────────────────────────────────────

function mapResult(
    body: PerfiosBankVerifyResponse,
    rawResponse: unknown,
): BankVerifyResult {
    const d = body.data!;
    return {
        valid: d.valid,
        nameAtBank: d.nameAtBank ?? null,
        nameMatchScore: d.nameMatchScore ?? null,
        ifscConfirmed: d.ifscConfirmed ?? null,
        bankName: d.bankName ?? null,
        branchName: d.branchName ?? null,
        rawResponse,
    };
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export class PerfiosBankVerifyProvider implements IBankVerifyProvider {
    private readonly client: AxiosInstance;

    constructor(apiKey: string, baseUrl: string, clientId: string) {
        this.client = createHttpClient({
            baseURL: baseUrl,
            timeoutMs: 15_000,
            headers: {
                'x-api-key': apiKey,
                'x-client-id': clientId,
            },
            vendor: 'perfios-bank-verify',
        });

        log.info('PerfiosBankVerifyProvider initialised', { baseUrl });
    }

    // ── 1. Penny drop verification ────────────────────────────────────────────

    async verifyWithPennyDrop(input: PennyDropInput): Promise<PennyDropResult> {
        return vendorCall({
            vendor: 'perfios-bank-verify',
            fn: async () => {
                // PLACEHOLDER: replace '/bank/verify/penny-drop' with
                // confirmed Perfios Bank AC Verification endpoint
                let res: { data: PerfiosBankVerifyResponse };

                try {
                    res = await this.client.post<PerfiosBankVerifyResponse>(
                        '/bank/verify/penny-drop', // PLACEHOLDER
                        {
                            accountNumber: input.accountNumber,
                            ifsc: input.ifsc,
                            accountHolder: input.accountHolder,
                            referenceId: input.referenceId,
                        },
                    );
                } catch (err: unknown) {
                    log.error('Perfios penny drop HTTP error', {
                        account: input.accountNumber.slice(-4),
                    });
                    throw err;
                }

                const body = res.data;

                if (body.status !== 'SUCCESS' || !body.data) {
                    throw new Error(
                        `Perfios penny drop failed: ${body.error?.message ?? 'unknown error'}`,
                    );
                }

                const base = mapResult(body, body);

                log.info('Perfios penny drop complete', {
                    account: input.accountNumber.slice(-4),
                    valid: base.valid,
                });

                return {
                    ...base,
                    transactionId: body.data.transactionId ?? null,
                    amountPaise: 100,
                };
            },
            retry: { maxAttempts: 2, delayMs: 1000 },
        });
    }

    // ── 2. Advanced verification ──────────────────────────────────────────────

    async verifyAdvanced(input: PennyDropInput): Promise<PennyDropResult> {
        return vendorCall({
            vendor: 'perfios-bank-verify',
            fn: async () => {
                // PLACEHOLDER: replace '/bank/verify/advanced' with
                // confirmed Perfios Bank AC Verification Advanced endpoint
                let res: { data: PerfiosBankVerifyResponse };

                try {
                    res = await this.client.post<PerfiosBankVerifyResponse>(
                        '/bank/verify/advanced', // PLACEHOLDER
                        {
                            accountNumber: input.accountNumber,
                            ifsc: input.ifsc,
                            accountHolder: input.accountHolder,
                            referenceId: input.referenceId,
                        },
                    );
                } catch (err: unknown) {
                    log.error('Perfios advanced verify HTTP error', {
                        account: input.accountNumber.slice(-4),
                    });
                    throw err;
                }

                const body = res.data;

                if (body.status !== 'SUCCESS' || !body.data) {
                    throw new Error(
                        `Perfios advanced verify failed: ${body.error?.message ?? 'unknown error'}`,
                    );
                }

                const base = mapResult(body, body);

                log.info('Perfios advanced verify complete', {
                    account: input.accountNumber.slice(-4),
                    valid: base.valid,
                });

                return {
                    ...base,
                    transactionId: body.data.transactionId ?? null,
                    amountPaise: 100,
                };
            },
            retry: { maxAttempts: 2, delayMs: 1000 },
        });
    }

    // ── 3. Silent verification ────────────────────────────────────────────────

    async verifySilent(input: SilentVerifyInput): Promise<BankVerifyResult> {
        return vendorCall({
            vendor: 'perfios-bank-verify',
            fn: async () => {
                // PLACEHOLDER: replace '/bank/verify/silent' with
                // confirmed Perfios Silent Bank AC Verification endpoint
                let res: { data: PerfiosBankVerifyResponse };

                try {
                    res = await this.client.post<PerfiosBankVerifyResponse>(
                        '/bank/verify/silent', // PLACEHOLDER
                        {
                            accountNumber: input.accountNumber,
                            ifsc: input.ifsc,
                            accountHolder: input.accountHolder,
                        },
                    );
                } catch (err: unknown) {
                    log.error('Perfios silent verify HTTP error', {
                        account: input.accountNumber.slice(-4),
                    });
                    throw err;
                }

                const body = res.data;

                if (body.status !== 'SUCCESS' || !body.data) {
                    throw new Error(
                        `Perfios silent verify failed: ${body.error?.message ?? 'unknown error'}`,
                    );
                }

                const result = mapResult(body, body);

                log.info('Perfios silent verify complete', {
                    account: input.accountNumber.slice(-4),
                    valid: result.valid,
                });

                return result;
            },
            retry: { maxAttempts: 3, delayMs: 500 },
        });
    }
}