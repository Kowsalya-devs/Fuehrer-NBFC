// src/providers/encryption/index.ts
//
// Singleton factory for the encryption provider.
//
// Selection logic:
//   production / staging  → KmsEncryptionProvider  (AWS KMS envelope encryption)
//   development / test    → StubEncryptionProvider  (local AES-256-GCM, no AWS needed)
//
// The instance is created once at first call and reused for the lifetime of
// the process. This avoids repeated KMS client initialisations and keeps
// the pattern consistent with every other provider in this directory.
//
// _resetEncryptionProvider() is exported for Jest — call it in afterEach()
// when you need to swap providers between tests.

import { env } from '@/config/env';
import { KmsEncryptionProvider } from './live';
import { StubEncryptionProvider } from './stub';
import type { IEncryptionProvider } from './interface';

export type { IEncryptionProvider } from './interface';

let instance: IEncryptionProvider | null = null;

export function getEncryptionProvider(): IEncryptionProvider {
    if (instance) return instance;

    const isLive = env.isProd || env.nodeEnv === 'staging';

    if (isLive) {
        const kmsKeyId = env.aws.kmsKeyId;
        const region = env.aws.region;

        // env.ts already validates that AWS_KMS_KEY_ID is required in
        // production and staging, so this check is a safety net only.
        if (!kmsKeyId) {
            throw new Error(
                'getEncryptionProvider: AWS_KMS_KEY_ID is required in production/staging. ' +
                'Set it in your environment or AWS Secrets Manager.',
            );
        }

        instance = new KmsEncryptionProvider(kmsKeyId, region);
    } else {
        // Development / test — local AES-256-GCM, reads LOCAL_ENCRYPTION_KEY from env
        instance = new StubEncryptionProvider();
    }

    return instance;
}

// For Jest test isolation — reset between tests when swapping provider impl
export function _resetEncryptionProvider(): void {
    instance = null;
}
