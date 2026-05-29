// src/providers/bankStatement/stub.ts
import type {
    IBankStatementProvider,
    BankStatementAnalysis,
} from './interface';
import { createModuleLogger } from '@/config/logger';

const log = createModuleLogger('bankStatement:stub');

export class StubBankStatementProvider implements IBankStatementProvider {
    async analyseStatement(): Promise<BankStatementAnalysis> {
        log.debug('STUB: analyseStatement');
        await new Promise((r) => setTimeout(r, 100));
        return {
            averageMonthlyBalance: 45_000,
            averageMonthlyCredit: 52_000,
            averageMonthlyDebit: 38_000,
            monthsAnalysed: 6,
            salaryCredits: [48000, 48000, 50000, 48000, 50000, 50000],
            bounces: 0,
            emiObligations: 5_500,
            transactions: [],
            rawResponse: { stub: true },
        };
    }
}
