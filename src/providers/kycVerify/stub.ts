// src/providers/kycVerify/stub.ts
import type {
    IKycVerifyProvider,
    AadhaarVerifyResult,
    PanVerifyResult,
    FaceMatchResult,
    LivenessResult,
    OcrResult,
    BankAccountVerifyResult,
} from './interface';
import { createModuleLogger } from '@/config/logger';

const log = createModuleLogger('kycVerify:stub');

// Stub always passes with realistic-looking data.
// Tests that need failures should inject a custom stub or mock specific methods.

export class StubKycVerifyProvider implements IKycVerifyProvider {

    async verifyAadhaar(aadhaarNumber: string): Promise<AadhaarVerifyResult> {
        log.debug('STUB: verifyAadhaar', { aadhaarNumber: '****' + aadhaarNumber.slice(-4) });
        await delay(50);
        return {
            verified: true,
            nameOnAadhaar: 'Rahul Sharma',
            dob: '1990-04-15',
            address: '123, MG Road, Bengaluru, Karnataka - 560001',
            shareCode: 'stub-share-code',
            rawResponse: { status: 'SUCCESS', stub: true },
        };
    }

    async verifyPAN(panNumber: string): Promise<PanVerifyResult> {
        log.debug('STUB: verifyPAN', { panNumber });
        await delay(30);
        return {
            verified: true,
            nameOnPan: 'RAHUL SHARMA',
            status: 'VALID',
            rawResponse: { status: 'SUCCESS', stub: true },
        };
    }

    async matchFace(): Promise<FaceMatchResult> {
        log.debug('STUB: matchFace');
        await delay(80);
        return { matched: true, confidence: 96.5, rawResponse: { stub: true } };
    }

    async checkLiveness(): Promise<LivenessResult> {
        log.debug('STUB: checkLiveness');
        await delay(60);
        return { passed: true, score: 98.2, rawResponse: { stub: true } };
    }

    async extractAadhaarOCR(): Promise<OcrResult> {
        log.debug('STUB: extractAadhaarOCR');
        await delay(40);
        return {
            extractedData: {
                name: 'Rahul Sharma',
                dob: '15/04/1990',
                gender: 'M',
                address: '123, MG Road, Bengaluru, Karnataka - 560001',
                uid: '1234',
            },
            rawResponse: { stub: true },
        };
    }

    async extractPanOCR(): Promise<OcrResult> {
        log.debug('STUB: extractPanOCR');
        await delay(40);
        return {
            extractedData: {
                name: 'RAHUL SHARMA',
                pan: 'ABCDE1234F',
                dob: '15/04/1990',
                father: 'SURESH SHARMA',
            },
            rawResponse: { stub: true },
        };
    }

    async verifyBankAccount(
        accountNumber: string,
        ifsc: string,
    ): Promise<BankAccountVerifyResult> {
        log.debug('STUB: verifyBankAccount', { ifsc });
        await delay(60);
        return {
            valid: true,
            nameAtBank: 'RAHUL SHARMA',
            rawResponse: { stub: true },
        };
    }
}

function delay(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
}
