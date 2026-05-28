// src/providers/docStorage/live.ts
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
    private readonly client:           S3Client;
    private readonly bucket:           string;
    private readonly signedUrlExpiryS: number;

    constructor(region: string, bucket: string, signedUrlExpiryS: number) {
        this.client           = new S3Client({ region });
        this.bucket           = bucket;
        this.signedUrlExpiryS = signedUrlExpiryS;

        log.info('S3DocStorageProvider initialised', { bucket, region, signedUrlExpiryS });
    }

    async upload(input: UploadDocInput): Promise<UploadDocResult> {
        const params: PutObjectCommandInput = {
            Bucket:               this.bucket,
            Key:                  input.key,
            Body:                 input.fileBuffer,
            ContentType:          input.contentType,
            ServerSideEncryption: 'AES256',
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
            log.error('S3 upload failed', { key: input.key, bucket: this.bucket, error: (err as Error).message });
            throw new Error(`S3 upload failed for key ${input.key}: ${(err as Error).message}`);
        }

        log.info('S3 upload complete', { key: input.key, sizeBytes: input.fileBuffer.length, eTag });
        return { key: input.key, eTag };
    }

    async getSignedUrl(key: string): Promise<SignedUrlResult> {
        const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });

        let url: string;

        try {
            // Cast to any to avoid AWS SDK version type mismatch between client-s3 and s3-request-presigner
            url = await getSignedUrl(this.client as any, command as any, {
                expiresIn: this.signedUrlExpiryS,
            });
        } catch (err: unknown) {
            log.error('S3 getSignedUrl failed', { key, bucket: this.bucket, error: (err as Error).message });
            throw new Error(`S3 signed URL generation failed for key ${key}: ${(err as Error).message}`);
        }

        const expiresAt = new Date(Date.now() + this.signedUrlExpiryS * 1000);
        log.info('S3 signed URL generated', { key, expiresAt });
        return { url, expiresAt };
    }

    async delete(key: string): Promise<void> {
        try {
            await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
        } catch (err: unknown) {
            log.error('S3 delete failed', { key, error: (err as Error).message });
            throw new Error(`S3 delete failed for key ${key}: ${(err as Error).message}`);
        }
        log.info('S3 object deleted', { key });
    }

    async exists(key: string): Promise<boolean> {
        try {
            await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
            return true;
        } catch (err: unknown) {
            const code = (err as { name?: string }).name;
            if (code === 'NotFound' || code === 'NoSuchKey') return false;
            log.error('S3 exists check failed', { key, error: (err as Error).message });
            throw new Error(`S3 exists check failed for key ${key}: ${(err as Error).message}`);
        }
    }
}
