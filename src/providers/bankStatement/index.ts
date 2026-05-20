// src/providers/bankStatement/index.ts
import { env } from '@/config/env';
import { getSecrets } from '@/config/secrets';
import { SignzyBankStatementProvider } from './live';
import { StubBankStatementProvider } from './stub';
import type { IBankStatementProvider } from './interface';

export type { IBankStatementProvider } from './interface';
export type { BankStatementAnalysis, BankStatementTransaction } from './interface';

let instance: IBankStatementProvider | null = null;

export function getBankStatementProvider(): IBankStatementProvider {
    if (instance) return instance;
    if (env.kyc.provider === 'signzy') {
        const s = getSecrets();
        instance = new SignzyBankStatementProvider(
            s.signzy.apiKey, s.signzy.baseUrl, env.kyc.timeoutMs,
        );
    } else {
        instance = new StubBankStatementProvider();
    }
    return instance;
}

export function _resetBankStatementProvider(): void { instance = null; }