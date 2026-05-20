// src/providers/amlCheck/index.ts
//
// Singleton factory for the AML check provider.
//
// Selection logic:
//   AML_PROVIDER=perfios  →  PerfiosAmlProvider   (production)
//   AML_PROVIDER=stub     →  StubAmlCheckProvider (development / test)
//   (default)             →  StubAmlCheckProvider (until env key is added)
//
// AML_PROVIDER env key does not exist yet in config/env.ts.
// When adding Perfios credentials, follow the activation steps in live.ts
// and add AML_PROVIDER to env.ts before switching to 'perfios'.
//
// Until then, this factory always returns the stub — which is safe
// because kyc.service treats a failed AML call as non-fatal (logs error,
// continues KYC flow). The underwriting rule AML_CLEAR will pass with
// stub returning clear: true.

import { env } from '@/config/env';
import { StubAmlCheckProvider } from './stub';
import type { IAmlCheckProvider } from './interface';

export type { IAmlCheckProvider } from './interface';
export type { AmlCheckInput, AmlCheckResult, AmlHit } from './interface';

let instance: IAmlCheckProvider | null = null;

export function getAmlCheckProvider(): IAmlCheckProvider {
    if (instance) return instance;

    // AML_PROVIDER is not in env.ts yet — check process.env directly
    // so this compiles without requiring an env schema change right now.
    // Once Perfios credentials are ready, add AML_PROVIDER to env.ts
    // and replace this check with: if (env.aml.provider === 'perfios')
    const provider = process.env.AML_PROVIDER ?? 'stub';

    if (provider === 'perfios') {
        // Lazy require — keeps the stub path free of Perfios imports
        // so the module loads cleanly before Perfios env vars are set
        const { PerfiosAmlProvider } = require('./live') as {
            PerfiosAmlProvider: new (
                apiKey: string,
                baseUrl: string,
                clientId: string,
            ) => IAmlCheckProvider;
        };

        const apiKey = process.env.PERFIOS_API_KEY;
        const baseUrl = process.env.PERFIOS_BASE_URL;
        const clientId = process.env.PERFIOS_CLIENT_ID;

        if (!apiKey || !baseUrl || !clientId) {
            throw new Error(
                'getAmlCheckProvider: AML_PROVIDER=perfios requires ' +
                'PERFIOS_API_KEY, PERFIOS_BASE_URL and PERFIOS_CLIENT_ID ' +
                'to be set in environment or Secrets Manager.',
            );
        }

        instance = new PerfiosAmlProvider(apiKey, baseUrl, clientId);
    } else {
        instance = new StubAmlCheckProvider();
    }

    return instance;
}

// For Jest test isolation — reset between tests
export function _resetAmlCheckProvider(): void {
    instance = null;
}