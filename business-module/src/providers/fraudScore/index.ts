// src/providers/fraudScore/index.ts
//
// Singleton factory for the fraud score provider.
//
// Selection logic:
//   FRAUD_PROVIDER=perfios  →  PerfiosFraudScoreProvider  (production)
//   FRAUD_PROVIDER=stub     →  StubFraudScoreProvider     (development / test)
//   (default)               →  StubFraudScoreProvider     (until env key added)
//
// FRAUD_PROVIDER env key does not exist yet in config/env.ts.
// When adding Perfios credentials, follow the activation steps in live.ts
// and add FRAUD_PROVIDER to env.ts before switching to 'perfios'.
//
// Note: fraudScore is non-fatal in kyc.service — a provider failure is
// logged and the check is marked as passed to not block the KYC flow
// during pilot. Review this decision before scaling to production volume.

import { StubFraudScoreProvider } from './stub';
import type { IFraudScoreProvider } from './interface';

export type { IFraudScoreProvider } from './interface';
export type { FraudScoreInput, FraudScoreResult, FraudRiskLevel, FraudSignal } from './interface';

let instance: IFraudScoreProvider | null = null;

export function getFraudScoreProvider(): IFraudScoreProvider {
    if (instance) return instance;

    // FRAUD_PROVIDER not in env.ts yet — read process.env directly.
    // Once Perfios credentials are ready, add FRAUD_PROVIDER to env.ts
    // and replace this with: if (env.fraud.provider === 'perfios')
    const provider = process.env.FRAUD_PROVIDER ?? 'stub';

    if (provider === 'perfios') {
        const { PerfiosFraudScoreProvider } = require('./live') as {
            PerfiosFraudScoreProvider: new (
                apiKey: string,
                baseUrl: string,
                clientId: string,
            ) => IFraudScoreProvider;
        };

        const apiKey = process.env.PERFIOS_API_KEY;
        const baseUrl = process.env.PERFIOS_BASE_URL;
        const clientId = process.env.PERFIOS_CLIENT_ID;

        if (!apiKey || !baseUrl || !clientId) {
            throw new Error(
                'getFraudScoreProvider: FRAUD_PROVIDER=perfios requires ' +
                'PERFIOS_API_KEY, PERFIOS_BASE_URL and PERFIOS_CLIENT_ID ' +
                'to be set in environment or Secrets Manager.',
            );
        }

        instance = new PerfiosFraudScoreProvider(apiKey, baseUrl, clientId);
    } else {
        instance = new StubFraudScoreProvider();
    }

    return instance;
}

// For Jest test isolation — reset between tests
export function _resetFraudScoreProvider(): void {
    instance = null;
}
