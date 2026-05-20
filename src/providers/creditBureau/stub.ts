// src/providers/creditBureau/stub.ts
import type {
    ICreditBureauProvider,
    CreditReport,
} from './interface';
import { createModuleLogger } from '@/config/logger';

const log = createModuleLogger('creditBureau:stub');

export class StubCreditBureauProvider implements ICreditBureauProvider {
    async fetchCreditReport(panNumber: string): Promise<CreditReport> {
        log.debug('STUB: fetchCreditReport', { pan: panNumber.slice(0, 5) + '****' });
        await new Promise((r) => setTimeout(r, 120));
        return {
            score: 740,
            scoreVersion: 'V2',
            totalAccounts: 4,
            activeAccounts: 2,
            closedAccounts: 2,
            overdueAccounts: 0,
            totalOutstanding: 180_000,
            totalEmiObligation: 7_200,
            enquiriesLast90Days: 1,
            accounts: [
                {
                    accountType: 'PersonalLoan',
                    lender: 'HDFC Bank',
                    currentBalance: 180_000,
                    emiAmount: 7_200,
                    status: 'Active',
                    openedDate: '2022-06-01',
                    closedDate: null,
                },
            ],
            rawResponse: { stub: true },
        };
    }
}