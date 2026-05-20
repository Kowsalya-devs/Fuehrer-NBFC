// src/providers/esign/index.ts
//
// Singleton factory for the eSign + eStamp provider.
//
// Selection logic:
//   KYC_PROVIDER=signzy  →  SignzyESignProvider  (production / staging)
//   KYC_PROVIDER=stub    →  StubESignProvider    (development / test)
//
// eSign uses the same Signzy credentials as kycVerify — both share
// env.kyc.apiKey and env.kyc.baseUrl. No separate env vars needed.
//
// _resetESignProvider() is exported for Jest — call it in afterEach()
// alongside _resetStubESignState() when testing the KYC flow end-to-end.

import { env } from '@/config/env';
import { getSecrets } from '@/config/secrets';
import { SignzyESignProvider } from './live';
import { StubESignProvider } from './stub';
import type { IESignProvider } from './interface';

export type { IESignProvider } from './interface';
export type { ESignStatus, EStampStatus } from './interface';
export type {
    CreateSignRequestInput,
    CreateSignRequestResult,
    ESignStatusResult,
    ApplyEStampInput,
    ApplyEStampResult,
    GetSignedDocumentResult,
} from './interface';

let instance: IESignProvider | null = null;

export function getESignProvider(): IESignProvider {
    if (instance) return instance;

    if (env.kyc.provider === 'signzy') {
        const secrets = getSecrets();

        // Signzy base URL and API key are shared with kycVerify —
        // both are part of the same Signzy subscription.
        if (!secrets.signzy.apiKey || !secrets.signzy.baseUrl) {
            throw new Error(
                'getESignProvider: SIGNZY_API_KEY and SIGNZY_BASE_URL are required ' +
                'when KYC_PROVIDER=signzy. Check your environment or Secrets Manager.',
            );
        }

        instance = new SignzyESignProvider(
            secrets.signzy.apiKey,
            secrets.signzy.baseUrl,
            env.kyc.timeoutMs,
        );
    } else {
        instance = new StubESignProvider();
    }

    return instance;
}

// For Jest test isolation — reset between tests
export function _resetESignProvider(): void {
    instance = null;
}