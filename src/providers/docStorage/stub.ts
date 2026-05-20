// src/providers/docStorage/stub.ts
//
// Stub document storage provider — development and test only.
//
// Behaviour:
//   - Stores uploaded files in a Map<key, Buffer> in memory.
//   - getSignedUrl() returns a localhost URL — never a real S3 URL.
//   - delete() and exists() operate against the in-memory store.
//   - No files are written to disk — process restart clears all uploads.
//
// This means the full KYC upload → OCR → face match flow can be tested
// in dev without any AWS credentials or S3 bucket.
//
// To simulate an upload failure in tests, prefix the key with 'fail/':
//   e.g. key: 'fail/kyc/user123/aadhaar.jpg' → upload throws

import { randomUUID } from 'crypto';
import { createModuleLogger } from '@/config/logger';
import type {
    IDocStorageProvider,
    UploadDocInput,
    UploadDocResult,
    SignedUrlResult,
} from './interface';

const log = createModuleLogger('docStorage:stub');

// In-memory store — key → Buffer
const store = new Map<string, Buffer>();

export class StubDocStorageProvider implements IDocStorageProvider {

    async upload(input: UploadDocInput): Promise<UploadDocResult> {
        // Failure simulation — prefix key with 'fail/'
        if (input.key.startsWith('fail/')) {
            log.warn('StubDocStorageProvider: simulating upload failure', {
                key: input.key,
            });
            throw new Error(
                `StubDocStorageProvider: forced upload failure for key ${input.key}`,
            );
        }

        store.set(input.key, input.fileBuffer);

        const eTag = `stub-etag-${randomUUID()}`;

        log.info('📁 [STUB S3 UPLOAD]', {
            key: input.key,
            contentType: input.contentType,
            sizeBytes: input.fileBuffer.length,
            eTag,
        });

        return { key: input.key, eTag };
    }

    async getSignedUrl(key: string): Promise<SignedUrlResult> {
        if (!store.has(key)) {
            log.warn('StubDocStorageProvider: getSignedUrl for unknown key', { key });
            // Return a URL anyway — OCR and face match stubs don't need
            // the file to actually exist at the URL
        }

        const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 min

        const url = `http://localhost:3000/stub/s3/${encodeURIComponent(key)}`;

        log.info('📁 [STUB S3 SIGNED URL]', { key, url, expiresAt });

        return { url, expiresAt };
    }

    async delete(key: string): Promise<void> {
        const existed = store.delete(key);
        log.info('📁 [STUB S3 DELETE]', { key, existed });
    }

    async exists(key: string): Promise<boolean> {
        return store.has(key);
    }
}

// ─── Test helper — reset in-memory store between tests ───────────────────────
export function _resetStubDocStore(): void {
    store.clear();
}

// ─── Test helper — read back an uploaded file ─────────────────────────────────
// Useful in tests to assert file content after upload
export function _getStubDoc(key: string): Buffer | undefined {
    return store.get(key);
}