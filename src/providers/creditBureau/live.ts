// src/providers/creditBureau/live.ts
import { createHttpClient, vendorCall } from '../_base/provider.utils';
import { BUREAU_ERRORS } from '@/errors';
import type {
    ICreditBureauProvider,
    CreditReport,
} from './interface';
import type { AxiosInstance } from 'axios';

export class LiveCreditBureauProvider implements ICreditBureauProvider {
    private readonly client: AxiosInstance;
    private readonly provider: string;

    constructor(
        apiKey: string,
        apiUrl: string,
        provider: string,
        timeoutMs: number,
    ) {
        this.provider = provider;
        this.client = createHttpClient({
            baseURL: apiUrl,
            timeoutMs,
            headers: { 'x-api-key': apiKey },
            vendor: `bureau:${provider}`,
        });
    }

    async fetchCreditReport(
        panNumber: string,
        fullName: string,
        dob: string,
        mobilePhone: string,
    ): Promise<CreditReport> {
        return vendorCall({
            vendor: this.provider,
            fn: async () => {
                try {
                    const res = await this.client.post('/credit-report', {
                        pan: panNumber,
                        name: fullName,
                        dob,
                        mobile: mobilePhone,
                    });

                    const d = res.data;

                    if (d.noHit || d.score === null) {
                        throw BUREAU_ERRORS.noHit(this.provider);
                    }

                    return {
                        score: d.score,
                        scoreVersion: d.scoreVersion ?? 'V2',
                        totalAccounts: d.totalAccounts ?? 0,
                        activeAccounts: d.activeAccounts ?? 0,
                        closedAccounts: d.closedAccounts ?? 0,
                        overdueAccounts: d.overdueAccounts ?? 0,
                        totalOutstanding: d.totalOutstanding ?? 0,
                        totalEmiObligation: d.totalEmiObligation ?? 0,
                        enquiriesLast90Days: d.enquiriesLast90Days ?? 0,
                        accounts: d.accounts ?? [],
                        rawResponse: res.data,
                    };
                } catch (err: unknown) {
                    const message = (err as Error)?.message ?? '';
                    if (message.includes('NO_HIT')) throw BUREAU_ERRORS.noHit(this.provider);
                    if (message.includes('timeout')) throw BUREAU_ERRORS.timeout(this.provider);
                    throw BUREAU_ERRORS.fetchFailed(this.provider, err);
                }
            },
            retry: { maxAttempts: 3, delayMs: 2000, backoffFactor: 2 },
        });
    }
}