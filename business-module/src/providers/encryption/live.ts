// src/providers/encryption/live.ts
//
// Production encryption provider using AWS KMS envelope encryption.
//
// How it works:
//   1. GenerateDataKey — ask KMS for a fresh AES-256 data key.
//      KMS returns the plaintext key AND the same key encrypted under your CMK.
//   2. Encrypt the PII locally with the plaintext key (AES-256-GCM).
//   3. Store: base64(encryptedDataKey) + "." + base64(iv) + "." + base64(tag) + "." + base64(ciphertext)
//   4. Discard the plaintext key — never persisted.
//
// To decrypt:
//   1. Split the stored string to get the encrypted data key.
//   2. Decrypt the data key with KMS (requires KMS:Decrypt IAM permission).
//   3. Decrypt the ciphertext locally with the recovered plaintext key.
//
// Benefits:
//   - Only one KMS call per encrypt and per decrypt (not per field).
//   - PII never leaves the application server in plaintext.
//   - Key rotation: re-encrypt the stored encrypted data keys via KMS re-encryption,
//     no need to touch the actual ciphertext columns.
//
// Required IAM permissions on the Lambda/ECS task role:
//   kms:GenerateDataKey
//   kms:Decrypt

import crypto from 'crypto';
import {
    KMSClient,
    GenerateDataKeyCommand,
    DecryptCommand,
} from '@aws-sdk/client-kms';
import { createModuleLogger } from '@/config/logger';
import type { IEncryptionProvider } from './interface';

const log = createModuleLogger('encryption:kms');

const ALGORITHM = 'aes-256-gcm' as const;
const VERSION = 'kms:v1' as const;
const SEP = '.';
const GCM_AUTH_TAG_LENGTH = 16;

export class KmsEncryptionProvider implements IEncryptionProvider {
    private readonly client: KMSClient;
    private readonly keyId: string;

    constructor(keyId: string, region: string) {
        if (!keyId) {
            throw new Error('KmsEncryptionProvider: keyId is required');
        }
        this.keyId = keyId;
        this.client = new KMSClient({ region });
        log.info('KmsEncryptionProvider initialised', { keyId, region });
    }

    async encrypt(plaintext: string): Promise<string> {
        if (!plaintext || plaintext.trim() === '') {
            throw new Error('KmsEncryptionProvider.encrypt: plaintext must be non-empty');
        }

        // Step 1 — generate a data key from KMS
        const generateCmd = new GenerateDataKeyCommand({
            KeyId: this.keyId,
            KeySpec: 'AES_256',
        });

        const { Plaintext, CiphertextBlob } = await this.client.send(generateCmd);

        if (!Plaintext || !CiphertextBlob) {
            throw new Error('KmsEncryptionProvider.encrypt: KMS returned empty key material');
        }

        // Step 2 — encrypt locally with the plaintext data key
        const dataKey = Buffer.from(Plaintext);
        const iv = crypto.randomBytes(12); // 96-bit IV for GCM

        const cipher = crypto.createCipheriv(
            ALGORITHM,
            dataKey,
            iv,
            { authTagLength: GCM_AUTH_TAG_LENGTH },
        );

        const encrypted = Buffer.concat([
            cipher.update(plaintext, 'utf8'),
            cipher.final(),
        ]);
        const authTag = cipher.getAuthTag();

        // Zero out the plaintext key — don't leave it in memory
        dataKey.fill(0);

        // Step 3 — serialise: version.encryptedKey.iv.tag.ciphertext
        const parts = [
            VERSION,
            Buffer.from(CiphertextBlob).toString('base64'),
            iv.toString('base64'),
            authTag.toString('base64'),
            encrypted.toString('base64'),
        ];

        return parts.join(SEP);
    }

    async decrypt(ciphertext: string): Promise<string> {
        if (!ciphertext) {
            throw new Error('KmsEncryptionProvider.decrypt: ciphertext must be non-empty');
        }

        const parts = ciphertext.split(SEP);

        if (parts.length !== 5) {
            throw new Error(
                `KmsEncryptionProvider.decrypt: malformed ciphertext — ` +
                `expected 5 parts, got ${parts.length}`,
            );
        }

        const [version, encKeyB64, ivB64, tagB64, dataB64] =
            parts as [string, string, string, string, string];

        if (version !== VERSION) {
            throw new Error(
                `KmsEncryptionProvider.decrypt: unsupported version "${version}" — ` +
                `expected "${VERSION}". Did you accidentally use a local-encrypted value in production?`,
            );
        }

        // Step 1 — decrypt the data key with KMS
        const encryptedKey = Buffer.from(encKeyB64, 'base64');

        const decryptCmd = new DecryptCommand({
            KeyId: this.keyId,
            CiphertextBlob: encryptedKey,
        });

        const { Plaintext } = await this.client.send(decryptCmd);

        if (!Plaintext) {
            throw new Error('KmsEncryptionProvider.decrypt: KMS returned empty plaintext key');
        }

        // Step 2 — decrypt locally
        const dataKey = Buffer.from(Plaintext);
        const iv = Buffer.from(ivB64, 'base64');
        const authTag = Buffer.from(tagB64, 'base64');
        const encryptedData = Buffer.from(dataB64, 'base64');

        try {
            const decipher = crypto.createDecipheriv(
                ALGORITHM,
                dataKey,
                iv,
                { authTagLength: GCM_AUTH_TAG_LENGTH },
            );
            decipher.setAuthTag(authTag);

            const decrypted = Buffer.concat([
                decipher.update(encryptedData),
                decipher.final(),
            ]);

            // Zero out the plaintext key
            dataKey.fill(0);

            return decrypted.toString('utf8');
        } catch (err: unknown) {
            dataKey.fill(0);
            throw new Error(
                `KmsEncryptionProvider.decrypt: authentication failed — ` +
                `ciphertext may be tampered or wrong KMS key. ${(err as Error).message}`,
            );
        }
    }

    async reEncrypt(oldCiphertext: string): Promise<string> {
        // Decrypt with the current key then re-encrypt — produces a new
        // data key from KMS, giving forward secrecy on the stored value.
        const plaintext = await this.decrypt(oldCiphertext);
        return this.encrypt(plaintext);
    }
}
