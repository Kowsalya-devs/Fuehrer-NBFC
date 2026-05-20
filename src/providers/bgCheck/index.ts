// src/providers/bgCheck/index.ts
//
// Singleton factory for the background check provider.
//
// Selection logic:
//   BG_CHECK_PROVIDER=live  →  LiveBgCheckProvider   (production)
//   BG_CHECK_PROVIDER=stub  →  StubBgCheckProvider   (development / test)
//   (default)               →  StubBgCheckProvider   (until env key added)
//
// BG_CHECK_PROVIDER env key does not exist yet in config/env.ts.
// When adding vendor credentials, follow the activation steps in live.ts
// and add BG_CHECK_PROVIDER to env.ts before switching to 'live'.

import { StubBgCheckProvider } from './stub';
import type { IBgCheckProvider } from './interface';

export type { IBgCheckProvider } from './interface';
export type {
    BgCheckInput,
    BgCheckResult,
    BgCheckStatus,
    BgCheckRecord,
} from './interface';

let instance: IBgCheckProvider | null = null;

export function getBgCheckProvider(): IBgCheckProvider {
    if (instance) return instance;

    // BG_CHECK_PROVIDER not in env.ts yet — read process.env directly.
    // Once vendor credentials are ready, add BG_CHECK_PROVIDER to env.ts
    // and replace this with: if (env.bgCheck.provider === 'live')
    const provider = process.env.BG_CHECK_PROVIDER ?? 'stub';

    if (provider === 'live') {
        const { LiveBgCheckProvider } = require('./live') as {
            LiveBgCheckProvider: new (
                apiKey: string,
                baseUrl: string,
            ) => IBgCheckProvider;
        };

        const apiKey = process.env.BG_CHECK_API_KEY;
        const baseUrl = process.env.BG_CHECK_BASE_URL;

        if (!apiKey || !baseUrl) {
            throw new Error(
                'getBgCheckProvider: BG_CHECK_PROVIDER=live requires ' +
                'BG_CHECK_API_KEY and BG_CHECK_BASE_URL ' +
                'to be set in environment or Secrets Manager.',
            );
        }

        instance = new LiveBgCheckProvider(apiKey, baseUrl);
    } else {
        instance = new StubBgCheckProvider();
    }

    return instance;
}

// For Jest test isolation — reset between tests
export function _resetBgCheckProvider(): void {
    instance = null;
}