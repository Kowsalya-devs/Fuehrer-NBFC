// src/providers/kycVerify/interface.ts

export interface AadhaarVerifyResult {
    verified: boolean;
    nameOnAadhaar: string | null;
    dob: string | null;
    address: string | null;
    shareCode: string | null;
    rawResponse: unknown;
}

export interface PanVerifyResult {
    verified: boolean;
    nameOnPan: string | null;
    status: string;
    rawResponse: unknown;
}

export interface FaceMatchResult {
    matched: boolean;
    confidence: number;       // 0–100
    rawResponse: unknown;
}

export interface LivenessResult {
    passed: boolean;
    score: number;       // 0–100
    rawResponse: unknown;
}

export interface OcrResult {
    extractedData: Record<string, string | null>;
    rawResponse: unknown;
}

export interface BankAccountVerifyResult {
    valid: boolean;
    nameAtBank: string | null;
    rawResponse: unknown;
}

export interface IKycVerifyProvider {
    verifyAadhaar(
        aadhaarNumber: string,
        otp: string,
        shareCode: string,
    ): Promise<AadhaarVerifyResult>;

    verifyPAN(
        panNumber: string,
        fullName: string,
        dob: string,
    ): Promise<PanVerifyResult>;

    matchFace(
        selfieBase64: string,
        idPhotoBase64: string,
    ): Promise<FaceMatchResult>;

    checkLiveness(
        videoFrameBase64: string,
    ): Promise<LivenessResult>;

    extractAadhaarOCR(
        imageBase64: string,
    ): Promise<OcrResult>;

    extractPanOCR(
        imageBase64: string,
    ): Promise<OcrResult>;

    verifyBankAccount(
        accountNumber: string,
        ifsc: string,
        accountHolder: string,
    ): Promise<BankAccountVerifyResult>;
}
