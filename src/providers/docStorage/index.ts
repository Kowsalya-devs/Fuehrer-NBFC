import { env } from '@/config/env';
import type { IDocStorageProvider } from './interface';

export type { IDocStorageProvider } from './interface';
export type {
    UploadDocInput, UploadDocResult, SignedUrlResult,
} from './interface';

let instance: IDocStorageProvider | null = null;

export function getDocStorageProvider(): IDocStorageProvider {
    if (instance) return instance;
    if (env.isProd || env.nodeEnv === 'staging') {
        const { S3DocStorageProvider } = require('./live');
        instance = new S3DocStorageProvider(
            env.aws.region,
            env.aws.s3Bucket,
            env.aws.s3SignedUrlExpiry,
        );
    } else {
        const { StubDocStorageProvider } = require('./stub');
        instance = new StubDocStorageProvider();
    }
    return instance;
}

export function _resetDocStorageProvider(): void { instance = null; }