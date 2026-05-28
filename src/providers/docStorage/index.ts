import { env } from '@/config/env';
import type { IDocStorageProvider } from './interface';

export type { IDocStorageProvider } from './interface';
export type {
    UploadDocInput, UploadDocResult, SignedUrlResult,
} from './interface';

let instance: IDocStorageProvider | null = null;

export function getDocStorageProvider(): IDocStorageProvider {
    if (instance !== null) return instance;

    let created: IDocStorageProvider;

    if (env.isProd || env.nodeEnv === 'staging') {
        const { S3DocStorageProvider } = require('./live');
        created = new S3DocStorageProvider(
            env.aws.region,
            env.aws.s3Bucket,
            env.aws.s3SignedUrlExpiry,
        );
    } else {
        const { StubDocStorageProvider } = require('./stub');
        created = new StubDocStorageProvider();
    }

    instance = created;
    return created;
}

export function _resetDocStorageProvider(): void { instance = null; }
