// src/providers/kycVerify/live.ts
import type { AxiosInstance } from 'axios';
import { createHttpClient, vendorCall } from '../_base/provider.utils';
import { KYC_VENDOR_ERRORS } from '@/errors';
import { AxiosError } from 'axios';
import type {
    IKycVerifyProvider,
    AadhaarVerifyResult,
    PanVerifyResult,
    FaceMatchResult,
    LivenessResult,
    OcrResult,
    BankAccountVerifyResult,
} from './interface';

export class SignzyKycProvider implements IKycVerifyProvider {
    private readonly client: AxiosInstance;

    constructor(apiKey: string, baseUrl: string, timeoutMs: number) {
        this.client = createHttpClient({
            baseURL: baseUrl,
            timeoutMs,
            headers: { 'x-api-key': apiKey },
            vendor: 'signzy',
        });
    }

    async verifyAadhaar(
        aadhaarNumber: string,
        otp: string,
        shareCode: string,
    ): Promise<AadhaarVerifyResult> {
        return vendorCall({
            vendor: 'signzy',
            fn: async () => {
                try {
                    const res = await this.client.post('/aadhaar/verify', {
                        aadhaarNumber,
                        otp,
                        shareCode,
                    });
                    return {
                        verified: res.data.status === 'SUCCESS',
                        nameOnAadhaar: res.data.data?.name ?? null,
                        dob: res.data.data?.dob ?? null,
                        address: res.data.data?.address ?? null,
                        shareCode: res.data.data?.shareCode ?? null,
                        rawResponse: res.data,
                    };
                } catch (err) {
                    throw KYC_VENDOR_ERRORS.aadhaarVerifyFailed(err);
                }
            },
            retry: { maxAttempts: 3, delayMs: 1000 },
        });
    }

    async verifyPAN(
        panNumber: string,
        fullName: string,
        dob: string,
    ): Promise<PanVerifyResult> {
        return vendorCall({
            vendor: 'signzy',
            fn: async () => {
                try {
                    const res = await this.client.post('/pan/verify', {
                        panNumber,
                        name: fullName,
                        dob,
                    });
                    return {
                        verified: res.data.status === 'SUCCESS',
                        nameOnPan: res.data.data?.name ?? null,
                        status: res.data.data?.status ?? 'UNKNOWN',
                        rawResponse: res.data,
                    };
                } catch (err) {
                    throw KYC_VENDOR_ERRORS.panVerifyFailed(err);
                }
            },
            retry: { maxAttempts: 3 },
        });
    }

    async matchFace(
        selfieBase64: string,
        idPhotoBase64: string,
    ): Promise<FaceMatchResult> {
        return vendorCall({
            vendor: 'signzy',
            fn: async () => {
                try {
                    const res = await this.client.post('/face/match', {
                        image1: selfieBase64,
                        image2: idPhotoBase64,
                    });
                    return {
                        matched: res.data.matched === true,
                        confidence: res.data.score ?? 0,
                        rawResponse: res.data,
                    };
                } catch (err) {
                    throw KYC_VENDOR_ERRORS.faceMatchFailed(err);
                }
            },
            retry: { maxAttempts: 2 },
        });
    }

    async checkLiveness(videoFrameBase64: string): Promise<LivenessResult> {
        return vendorCall({
            vendor: 'signzy',
            fn: async () => {
                try {
                    const res = await this.client.post('/liveness/check', {
                        frame: videoFrameBase64,
                    });
                    return {
                        passed: res.data.status === 'LIVE',
                        score: res.data.score ?? 0,
                        rawResponse: res.data,
                    };
                } catch (err) {
                    throw KYC_VENDOR_ERRORS.livenessFailed(err);
                }
            },
            retry: { maxAttempts: 2 },
        });
    }

    async extractAadhaarOCR(imageBase64: string): Promise<OcrResult> {
        return vendorCall({
            vendor: 'signzy',
            fn: async () => {
                try {
                    const res = await this.client.post('/ocr/aadhaar', {
                        image: imageBase64,
                    });
                    return {
                        extractedData: res.data.data ?? {},
                        rawResponse: res.data,
                    };
                } catch (err) {
                    if (err instanceof AxiosError) {
                        throw KYC_VENDOR_ERRORS.timeout('AADHAAR_OCR');
                    }
                    throw err;
                }
            },
            retry: { maxAttempts: 3 },
        });
    }

    async extractPanOCR(imageBase64: string): Promise<OcrResult> {
        return vendorCall({
            vendor: 'signzy',
            fn: async () => {
                try {
                    const res = await this.client.post('/ocr/pan', {
                        image: imageBase64,
                    });
                    return {
                        extractedData: res.data.data ?? {},
                        rawResponse: res.data,
                    };
                } catch (err) {
                    throw KYC_VENDOR_ERRORS.timeout('PAN_OCR');
                }
            },
            retry: { maxAttempts: 3 },
        });
    }

    async verifyBankAccount(
        accountNumber: string,
        ifsc: string,
        accountHolder: string,
    ): Promise<BankAccountVerifyResult> {
        return vendorCall({
            vendor: 'signzy',
            fn: async () => {
                try {
                    const res = await this.client.post('/bank/verify', {
                        accountNumber,
                        ifsc,
                        name: accountHolder,
                    });
                    return {
                        valid: res.data.status === 'SUCCESS',
                        nameAtBank: res.data.data?.nameAtBank ?? null,
                        rawResponse: res.data,
                    };
                } catch (err) {
                    throw KYC_VENDOR_ERRORS.timeout('BANK_VERIFY');
                }
            },
            retry: { maxAttempts: 3 },
        });
    }
}
