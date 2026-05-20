// src/providers/encryption/stub.ts
//
// Local AES-256-GCM encryption — development and test only.
//
// Uses a fixed 32-byte key derived from the LOCAL_ENCRYPTION_KEY env var
// (or a hardcoded fallback for unit tests). Never used in production or
// staging — env.ts enforces KYC_PROVIDER !== 'stub' in those environments.
//
// The ciphertext format is intentionally identical to the KMS live provider
// ("local:v1.<iv>.<tag>.<ciphertext>") so that integration tests exercise
// the same parse/serialise path as production.
//
// NEVER commit a real key in this file. The fallback key below is a
// well-known test value — it has zero security value and is only used
// when NODE_ENV=test and no LOCAL_ENCRYPTION_KEY is set.

import crypto from 'crypto';
import type { IEncryptionProvider } from './interface';

const ALGORITHM = 'aes-256-gcm' as const;
const VERSION = 'local:v1' as const;
const SEP = '.';
const GCM_AUTH_TAG_LENGTH = 16;
const KEY_LENGTH_BYTES = 32;

// ─── Derive key ───────────────────────────────────────────────────────────────
// Accepts a 64-char hex string (32 bytes) or any string which is then
// SHA-256 hashed to produce a 32-byte key.

function deriveKey(raw: string): Buffer {
    if (/^[0-9a-fA-F]{64}$/.test(raw)) {
        return Buffer.from(raw, 'hex');
    }
    // Fallback: hash the string to get exactly 32 bytes
    return crypto.createHash('sha256').update(raw).digest();
}

// ─── Fallback test key (NOT secret — dev/test only) ───────────────────────────
// In CI and local dev without LOCAL_ENCRYPTION_KEY set, this value is used.
// Any attempt to use this key in production is blocked by env.ts validation.
const TEST_KEY_HEX = 'a'.repeat(64); // 32-byte key of 0xaa — test sentinel

function getKey(): Buffer {
    const raw = process.env.LOCAL_ENCRYPTION_KEY ?? TEST_KEY_HEX;
    const key = deriveKey(raw);
    if (key.length !== KEY_LENGTH_BYTES) {
        throw new Error(
            `StubEncryptionProvider: key must be ${KEY_LENGTH_BYTES} bytes, got ${key.length}`,
        );
    }
    return key;
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export class StubEncryptionProvider implements IEncryptionProvider {

    async encrypt(plaintext: string): Promise<string> {
        if (!plaintext || plaintext.trim() === '') {
            throw new Error('StubEncryptionProvider.encrypt: plaintext must be non-empty');
        }

        const key = getKey();
        const iv = crypto.randomBytes(12); // 96-bit IV for GCM
        const cipher = crypto.createCipheriv(
            ALGORITHM, key, iv,
            { authTagLength: GCM_AUTH_TAG_LENGTH },
        );

        const encrypted = Buffer.concat([
            cipher.update(plaintext, 'utf8'),
            cipher.final(),
        ]);
        const authTag = cipher.getAuthTag();

        const parts = [
            VERSION,
            iv.toString('base64'),
            authTag.toString('base64'),
            encrypted.toString('base64'),
        ];

        return parts.join(SEP);
    }

    async decrypt(ciphertext: string): Promise<string> {
        if (!ciphertext) {
            throw new Error('StubEncryptionProvider.decrypt: ciphertext must be non-empty');
        }

        const parts = ciphertext.split(SEP);

        if (parts.length !== 4) {
            throw new Error(
                `StubEncryptionProvider.decrypt: malformed ciphertext — ` +
                `expected 4 parts, got ${parts.length}`,
            );
        }

        const [version, ivB64, tagB64, dataB64] = parts as [string, string, string, string];

        if (version !== VERSION) {
            throw new Error(
                `StubEncryptionProvider.decrypt: unsupported version "${version}" — ` +
                `expected "${VERSION}". Did you accidentally use a KMS-encrypted value in dev?`,
            );
        }

        const key = getKey();
        const iv = Buffer.from(ivB64, 'base64');
        const authTag = Buffer.from(tagB64, 'base64');
        const encrypted = Buffer.from(dataB64, 'base64');

        try {
            const decipher = crypto.createDecipheriv(
                ALGORITHM, key, iv,
                { authTagLength: GCM_AUTH_TAG_LENGTH },
            );
            decipher.setAuthTag(authTag);

            const decrypted = Buffer.concat([
                decipher.update(encrypted),
                decipher.final(),
            ]);

            return decrypted.toString('utf8');
        } catch (err: unknown) {
            throw new Error(
                `StubEncryptionProvider.decrypt: authentication failed — ` +
                `ciphertext may be tampered or key mismatch. ${(err as Error).message}`,
            );
        }
    }

    async reEncrypt(oldCiphertext: string): Promise<string> {
        const plaintext = await this.decrypt(oldCiphertext);
        return this.encrypt(plaintext);
    }
}