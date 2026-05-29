// src/providers/bankStatement/live.ts
//
// Signzy Bank Statement Analysis — production implementation.
//
// Called by kyc.service.analyseBankStatement() after the customer uploads
// their bank statement PDF to S3. The flow is:
//   1. kyc.service gets a signed S3 URL for the uploaded statement
//   2. Passes the URL to analyseStatement() — Signzy fetches it directly
//   3. Signzy returns income analysis, balance history, EMI obligations
//   4. Results stored in kyc_documents and used by underwriting engine
//
// Key fields used by underwriting.rules.ts:
//   - averageMonthlyBalance  → minimum balance check
//   - salaryCredits          → income consistency check
//   - bounces                → NACH bounce history (risk signal)
//   - emiObligations         → existing EMI load (FOIR calculation)
//   - monthsAnalysed         → minimum 3 months required

import type { AxiosInstance } from 'axios';
import { createHttpClient, vendorCall } from '../_base/provider.utils';
import { KYC_VENDOR_ERRORS } from '@/errors';
import { createModuleLogger } from '@/config/logger';
import type {
    IBankStatementProvider,
    BankStatementAnalysis,
    BankStatementTransaction,
} from './interface';

const log = createModuleLogger('bankStatement:signzy');

// ─── Signzy response shapes ───────────────────────────────────────────────────

interface SignzyTransaction {
    date: string;
    description: string;
    debit: number | null;
    credit: number | null;
    balance: number;
}

interface SignzyBankStatementResponse {
    status: string;              // 'SUCCESS' | 'FAILED'
    data?: {
        avgMonthlyBalance: number;
        avgMonthlyCredit: number;
        avgMonthlyDebit: number;
        monthsAnalysed: number;
        salaryCredits: number[];
        bounceCount: number;
        existingEmiPerMonth: number;
        transactions: SignzyTransaction[];
    };
    error?: {
        code: string;
        message: string;
    };
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export class SignzyBankStatementProvider implements IBankStatementProvider {
    private readonly client: AxiosInstance;

    constructor(apiKey: string, baseUrl: string, timeoutMs: number) {
        this.client = createHttpClient({
            baseURL: baseUrl,
            timeoutMs,
            headers: { 'x-api-key': apiKey },
            vendor: 'signzy-bank-statement',
        });

        log.info('SignzyBankStatementProvider initialised', {
            baseUrl,
            timeoutMs,
        });
    }

    async analyseStatement(
        fileBase64: string,
        fileType: 'pdf' | 'json',
        bankName?: string,
    ): Promise<BankStatementAnalysis> {
        return vendorCall({
            vendor: 'signzy-bank-statement',
            fn: async () => {
                let res: { data: SignzyBankStatementResponse };

                try {
                    res = await this.client.post<SignzyBankStatementResponse>(
                        '/bank-statement/analyse',
                        {
                            file: fileBase64,
                            fileType,
                            bankName: bankName ?? null,
                        },
                    );
                } catch (err: unknown) {
                    log.error('Signzy bank statement HTTP error');
                    throw KYC_VENDOR_ERRORS.bankStatementFailed(err);
                }

                const body = res.data;

                if (body.status !== 'SUCCESS' || !body.data) {
                    log.error('Signzy bank statement analysis failed', {
                        signzyCode: body.error?.code,
                        signzyMsg: body.error?.message,
                    });
                    throw KYC_VENDOR_ERRORS.bankStatementFailed(
                        new Error(
                            body.error?.message ?? 'Signzy bank statement analysis failed',
                        ),
                    );
                }

                const d = body.data;

                // Map transactions to our internal shape
                const transactions: BankStatementTransaction[] = (
                    d.transactions ?? []
                ).map((t) => ({
                    date: t.date,
                    description: t.description,
                    debit: t.debit ?? null,
                    credit: t.credit ?? null,
                    balance: t.balance ?? 0,
                }));

                log.info('Signzy bank statement analysis complete', {
                    monthsAnalysed: d.monthsAnalysed,
                    avgMonthlyBalance: d.avgMonthlyBalance,
                    bounces: d.bounceCount,
                    emiObligations: d.existingEmiPerMonth,
                    transactionCount: transactions.length,
                });

                return {
                    averageMonthlyBalance: d.avgMonthlyBalance ?? 0,
                    averageMonthlyCredit: d.avgMonthlyCredit ?? 0,
                    averageMonthlyDebit: d.avgMonthlyDebit ?? 0,
                    monthsAnalysed: d.monthsAnalysed ?? 0,
                    salaryCredits: d.salaryCredits ?? [],
                    bounces: d.bounceCount ?? 0,
                    emiObligations: d.existingEmiPerMonth ?? 0,
                    transactions,
                    rawResponse: body,
                };
            },
            retry: { maxAttempts: 2, delayMs: 2000 },
        });
    }
}
