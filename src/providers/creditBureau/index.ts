// src/providers/creditBureau/index.ts
import { env } from '@/config/env';
import { getSecrets } from '@/config/secrets';
import { LiveCreditBureauProvider } from './live';
import { StubCreditBureauProvider } from './stub';
import type { ICreditBureauProvider } from './interface';

export type { ICreditBureauProvider } from './interface';
export type { CreditReport, CreditAccount } from './interface';

let instance: ICreditBureauProvider | null = null;

export function getCreditBureauProvider(): ICreditBureauProvider {
    if (instance) return instance;
    if (env.bureau.provider !== 'stub') {
        const s = getSecrets();
        instance = new LiveCreditBureauProvider(
            s.creditBureau.apiKey,
            s.creditBureau.apiUrl,
            s.creditBureau.provider,
            env.bureau.timeoutMs,
        );
    } else {
        instance = new StubCreditBureauProvider();
    }
    return instance;
}

export function _resetCreditBureauProvider(): void { instance = null; }