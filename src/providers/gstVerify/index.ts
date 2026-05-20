// src/providers/gstVerify/index.ts
//
// Singleton factory for the GST verification provider.
//
// Selection logic:
//   GST_VERIFY_PROVIDER=perfios  →  PerfiosGstVerifyProvider  (production)
//   GST_VERIFY_PROVIDER=stub     →  StubGstVerifyProvider     (development / test)
//   (default)                    →  StubGstVerifyProvider     (until env key added)
//
// GST_VERIFY_PROVIDER env key does not exist yet in config/env.ts.
// When adding Perfios credentials, follow the activation steps in live.ts
// and add GST_VERIFY_PROVIDER to env.ts before switching to 'perfios'.
//
// Also remember to add gstin + gst_verified columns to the agents
// Prisma schema before activating the live provider.

import { StubGstVerifyProvider } from './stub';
import type { IGstVerifyProvider } from './interface';

export type { IGstVerifyProvider } from './interface';
export type {
    GstVerifyInput,
    GstVerifyResult,
    GstRegistrationStatus,
    GstCertificateParseInput,
    GstCertificateParseResult,
} from './interface';

let instance: IGstVerifyProvider | null = null;

export function getGstVerifyProvider(): IGstVerifyProvider {
    if (instance) return instance;

    // GST_VERIFY_PROVIDER not in env.ts yet — read process.env directly.
    // Once Perfios credentials are ready, add GST_VERIFY_PROVIDER to env.ts
    // and replace this with: if (env.gstVerify.provider === 'perfios')
    const provider = process.env.GST_VERIFY_PROVIDER ?? 'stub';

    if (provider === 'perfios') {
        const { PerfiosGstVerifyProvider } = require('./live') as {
            PerfiosGstVerifyProvider: new (
                apiKey: string,
                baseUrl: string,
                clientId: string,
            ) => IGstVerifyProvider;
        };

        const apiKey = process.env.PERFIOS_API_KEY;
        const baseUrl = process.env.PERFIOS_BASE_URL;
        const clientId = process.env.PERFIOS_CLIENT_ID;

        if (!apiKey || !baseUrl || !clientId) {
            throw new Error(
                'getGstVerifyProvider: GST_VERIFY_PROVIDER=perfios requires ' +
                'PERFIOS_API_KEY, PERFIOS_BASE_URL and PERFIOS_CLIENT_ID ' +
                'to be set in environment or Secrets Manager.',
            );
        }

        instance = new PerfiosGstVerifyProvider(apiKey, baseUrl, clientId);
    } else {
        instance = new StubGstVerifyProvider();
    }

    return instance;
}

// For Jest test isolation — reset between tests
export function _resetGstVerifyProvider(): void {
    instance = null;
}