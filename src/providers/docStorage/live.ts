// src/providers/docStorage/live.ts
//
// AWS S3 document storage — production implementation.
//
// All KYC documents (Aadhaar scans, PAN scans, selfies, bank statements,
// signed loan agreements) are stored in S3. Plaintext files are never
// stored locally — they go directly to S3 from the multer memory buffer.
//
// Key naming convention (enforced by kyc.service):
//   kyc/{userId}/{documentType}_{timestamp}.{ext}
//   e.g. kyc/uuid-123/aadhaar_front_1714000000000.jpg
//
// Security:
//   - Bucket is PRIVATE — no public access
//   - Files are accessed via pre-signed URLs with 15-minute expiry
//   - Server-side encryption: SSE-S3 (AES-256) on all objects
//   - Access logging enabled for RBI audit trail
//
// RBI compliance:
//   - Documents retained for minimum 5 years (S3 lifecycle policy)
//   - Set S3 lifecycle rule: transition to S3-IA after 90 days,
//     Glacier after 1 year, expire after 5 years + 1 day
//   - Enable S3 versioning to prevent accidental deletion

import {
    S3Client,
    PutObjectCommand,
    GetObjectCommand,
    DeleteObjectCommand,
    HeadObjectCommand,
    type PutObjectCommandInput,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createModuleLogger } from '@/config/logger';
import type {
    IDocStorageProvider,
    UploadDocInput,
    UploadDocResult,
    SignedUrlResult,
} from './interface';

const log = createModuleLogger('docStorage:s3');

export class S3DocStorageProvider implements IDocStorageProvider {
    private readonly client: S3Client;
    private readonly bucket: string;
    private readonly signedUrlExpiryS: number;

    constructor(region: string, bucket: string, signedUrlExpiryS: number) {
        this.client = new S3Client({ region });
        this.bucket = bucket;
        this.signedUrlExpiryS = signedUrlExpiryS;

        log.info('S3DocStorageProvider initialised', {
            bucket,
            region,
            signedUrlExpiryS,
        });
    }

    // ── Upload ─────────────────────────────────────────────────────────────────

    async upload(input: UploadDocInput): Promise<UploadDocResult> {
        const params: PutObjectCommandInput = {
            Bucket: this.bucket,
            Key: input.key,
            Body: input.fileBuffer,
            ContentType: input.contentType,
            // Server-side encryption — mandatory for PII documents
            ServerSideEncryption: 'AES256',
            // Metadata stored alongside the object for audit / debugging
            Metadata: {
                uploadedAt: new Date().toISOString(),
                ...input.metadata,
            },
        };

        let eTag: string;

        try {
            const result = await this.client.send(new PutObjectCommand(params));
            eTag = result.ETag ?? `s3-etag-${Date.now()}`;
        } catch (err: unknown) {
            log.error('S3 upload failed', {
                key: input.key,
                bucket: this.bucket,
                error: (err as Error).message,
            });
            throw new Error(
                `S3 upload failed for key ${input.key}: ${(err as Error).message}`,
            );
        }

        log.info('S3 upload complete', {
            key: input.key,
            sizeBytes: input.fileBuffer.length,
            eTag,
        });

        return { key: input.key, eTag };
    }

    // ── Get pre-signed URL ─────────────────────────────────────────────────────

    async getSignedUrl(key: string): Promise<SignedUrlResult> {
        const command = new GetObjectCommand({
            Bucket: this.bucket,
            Key: key,
        });

        let url: string;

        try {
            url = await getSignedUrl(this.client, command, {
                expiresIn: this.signedUrlExpiryS,
            });
        } catch (err: unknown) {
            log.error('S3 getSignedUrl failed', {
                key,
                bucket: this.bucket,
                error: (err as Error).message,
            });
            throw new Error(
                `S3 signed URL generation failed for key ${key}: ${(err as Error).message}`,
            );
        }

        const expiresAt = new Date(Date.now() + this.signedUrlExpiryS * 1000);

        log.info('S3 signed URL generated', {
            key,
            expiresAt,
        });

        return { url, expiresAt };
    }

    // ── Delete ─────────────────────────────────────────────────────────────────
    // Used only by admin cleanup operations — never called in the normal flow.
    // RBI requires 5-year retention — ensure S3 lifecycle policy is set
    // before this is called in production.

    async delete(key: string): Promise<void> {
        try {
            await this.client.send(
                new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
            );
        } catch (err: unknown) {
            log.error('S3 delete failed', {
                key,
                error: (err as Error).message,
            });
            throw new Error(
                `S3 delete failed for key ${key}: ${(err as Error).message}`,
            );
        }

        log.info('S3 object deleted', { key });
    }

    // ── Exists ─────────────────────────────────────────────────────────────────
    // Used to verify a document was uploaded before running OCR on it.
    // HeadObject is cheaper than GetObject — no data transfer cost.

    async exists(key: string): Promise<boolean> {
        try {
            await this.client.send(
                new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
            );
            return true;
        } catch (err: unknown) {
            const code = (err as { name?: string }).name;
            // NotFound and NoSuchKey both mean the object doesn't exist
            if (code === 'NotFound' || code === 'NoSuchKey') {
                return false;
            }
            // Any other error (permissions, network) — rethrow
            log.error('S3 exists check failed', {
                key,
                error: (err as Error).message,
            });
            throw new Error(
                `S3 exists check failed for key ${key}: ${(err as Error).message}`,
            );
        }
    }
}