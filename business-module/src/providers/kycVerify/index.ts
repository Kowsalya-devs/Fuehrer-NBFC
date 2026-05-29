// src/providers/kycVerify/index.ts
import { env } from '@/config/env';
import { getSecrets } from '@/config/secrets';
import { SignzyKycProvider } from './live';
import { StubKycVerifyProvider } from './stub';
import type { IKycVerifyProvider } from './interface';

export type { IKycVerifyProvider } from './interface';
export type {
    AadhaarVerifyResult,
    PanVerifyResult,
    FaceMatchResult,
    LivenessResult,
    OcrResult,
    BankAccountVerifyResult,
} from './interface';

let instance: IKycVerifyProvider | null = null;

export function getKycVerifyProvider(): IKycVerifyProvider {
    if (instance) return instance;

    if (env.kyc.provider === 'signzy') {
        const secrets = getSecrets();
        instance = new SignzyKycProvider(
            secrets.signzy.apiKey,
            secrets.signzy.baseUrl,
            env.kyc.timeoutMs,
        );
    } else {
        instance = new StubKycVerifyProvider();
    }

    return instance;
}

// For testing — reset singleton between tests
export function _resetKycVerifyProvider(): void {
    instance = null;
}
