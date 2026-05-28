// src/providers/bankVerify/index.ts
//
// Singleton factory for the bank account verification provider.
//
// Selection logic:
//   BANK_VERIFY_PROVIDER=perfios  →  PerfiosBankVerifyProvider  (production)
//   BANK_VERIFY_PROVIDER=stub     →  StubBankVerifyProvider     (development / test)
//   (default)                     →  StubBankVerifyProvider     (until env key added)
//
// BANK_VERIFY_PROVIDER env key does not exist yet in config/env.ts.
// When adding Perfios credentials, follow the activation steps in live.ts
// and add BANK_VERIFY_PROVIDER to env.ts before switching to 'perfios'.
//
// Note: basic bank account verification (account number + IFSC validity)
// is handled by kycVerify provider → verifyBankAccount(). This provider
// is for the three advanced Perfios methods used during eNACH setup
// and high-value loan disbursements.

import { StubBankVerifyProvider } from './stub';
import type { IBankVerifyProvider } from './interface';

export type { IBankVerifyProvider } from './interface';
export type {
    BankVerifyResult,
    PennyDropInput,
    PennyDropResult,
    SilentVerifyInput,
} from './interface';

let instance: IBankVerifyProvider | null = null;

export function getBankVerifyProvider(): IBankVerifyProvider {
    if (instance) return instance;

    // BANK_VERIFY_PROVIDER not in env.ts yet — read process.env directly.
    // Once Perfios credentials are ready, add BANK_VERIFY_PROVIDER to env.ts
    // and replace this with: if (env.bankVerify.provider === 'perfios')
    const provider = process.env.BANK_VERIFY_PROVIDER ?? 'stub';

    if (provider === 'perfios') {
        const { PerfiosBankVerifyProvider } = require('./live') as {
            PerfiosBankVerifyProvider: new (
                apiKey: string,
                baseUrl: string,
                clientId: string,
            ) => IBankVerifyProvider;
        };

        const apiKey = process.env.PERFIOS_API_KEY;
        const baseUrl = process.env.PERFIOS_BASE_URL;
        const clientId = process.env.PERFIOS_CLIENT_ID;

        if (!apiKey || !baseUrl || !clientId) {
            throw new Error(
                'getBankVerifyProvider: BANK_VERIFY_PROVIDER=perfios requires ' +
                'PERFIOS_API_KEY, PERFIOS_BASE_URL and PERFIOS_CLIENT_ID ' +
                'to be set in environment or Secrets Manager.',
            );
        }

        instance = new PerfiosBankVerifyProvider(apiKey, baseUrl, clientId);
    } else {
        instance = new StubBankVerifyProvider();
    }

    return instance;
}

// For Jest test isolation — reset between tests
export function _resetBankVerifyProvider(): void {
    instance = null;
}
