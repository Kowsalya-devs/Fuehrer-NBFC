// src/modules/kyc/kyc.types.ts
import type {
    KycStatus,
    KycCheck,
} from '@/config/constants';
import type {
    AadhaarVerifyResult,
    PanVerifyResult,
    FaceMatchResult,
    LivenessResult,
    OcrResult,
    BankAccountVerifyResult,
} from '@/providers/kycVerify';
import type { BankStatementAnalysis } from '@/providers/bankStatement';
import type { CreditReport } from '@/providers/creditBureau';
import type { FraudScoreResult } from '@/providers/fraudScore';
import type { AmlCheckResult } from '@/providers/amlCheck';
import type { ESignStatusResult } from '@/providers/esign';

// ─── Core KYC document model ───────────────────────────────────────────────────
// Maps 1:1 to the kyc_documents table row

export interface KycDocument {
    id: string;
    userId: string;

    // Encrypted values — never expose raw Aadhaar/PAN outside this module
    aadhaarEncrypted: string | null;
    panEncrypted: string | null;

    // Masked display values — safe to send to frontend
    aadhaarLast4: string | null;
    panMasked: string | null;       // ABCDE****F

    // S3 keys — signed URLs generated on demand
    selfieS3Key: string | null;
    aadhaarFrontS3Key: string | null;
    aadhaarBackS3Key: string | null;
    panS3Key: string | null;
    bankStatementS3Key: string | null;
    signedAgreementS3Key: string | null;

    // Scores
    livenessScore: number | null;
    faceMatchScore: number | null;
    fraudScore: number | null;
    creditScore: number | null;

    // eSign
    eSignRequestId: string | null;
    eSignStatus: string | null;

    // Raw vendor responses stored as JSON — for audit and debugging
    // Never log these — they may contain PII
    signzyResponses: KycCheckResponses | null;

    // Status tracking
    overallStatus: KycStatus;
    completedChecks: KycCheck[];
    failedChecks: KycCheck[];
    rejectionReason: string | null;

    verifiedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

// ─── Per-check response storage ───────────────────────────────────────────────
// Stored in kyc_documents.signzy_responses jsonb column

export interface KycCheckResponses {
    aadhaarVerify?: AadhaarVerifyResult;
    panVerify?: PanVerifyResult;
    faceMatch?: FaceMatchResult;
    liveness?: LivenessResult;
    aadhaarOcr?: OcrResult;
    panOcr?: OcrResult;
    bankAccount?: BankAccountVerifyResult;
    bankStatement?: BankStatementAnalysis;
    creditReport?: CreditReport;
    fraudScore?: FraudScoreResult;
    amlCheck?: AmlCheckResult;
}

// ─── Check result — returned by each individual check method ──────────────────

export interface KycCheckResult<T = unknown> {
    checkType: KycCheck;
    passed: boolean;
    score?: number;
    data: T;
    failReason?: string;
}

// ─── KYC initiation ───────────────────────────────────────────────────────────

export interface InitiateKycInput {
    userId: string;
    fullName: string;
    dob: string;        // YYYY-MM-DD
    phone: string;
    pan: string;
    aadhaarLast4: string;        // We never collect full Aadhaar at initiation
}

// ─── Aadhaar OTP flow ─────────────────────────────────────────────────────────
// Aadhaar e-KYC requires a 2-step OTP flow

export interface AadhaarOtpRequestInput {
    userId: string;
    aadhaarNumber: string;        // Full 12 digits — encrypted immediately on receipt
}

export interface AadhaarOtpVerifyInput {
    userId: string;
    otp: string;
    shareCode: string;
}

// ─── Document upload ──────────────────────────────────────────────────────────

export type KycDocumentType =
    | 'selfie'
    | 'aadhaar_front'
    | 'aadhaar_back'
    | 'pan'
    | 'bank_statement';

export interface UploadKycDocumentInput {
    userId: string;
    documentType: KycDocumentType;
    fileBuffer: Buffer;
    mimeType: string;
    fileName: string;
}

export interface UploadKycDocumentResult {
    s3Key: string;
    documentType: KycDocumentType;
    uploadedAt: Date;
}

// ─── KYC status response ──────────────────────────────────────────────────────
// Safe public shape — no encrypted fields, no raw vendor responses

export interface KycStatusResponse {
    userId: string;
    overallStatus: KycStatus;
    completedChecks: KycCheck[];
    failedChecks: KycCheck[];
    pendingChecks: KycCheck[];
    creditScore: number | null;
    faceMatchScore: number | null;
    livenessScore: number | null;
    fraudScore: number | null;
    aadhaarLast4: string | null;
    panMasked: string | null;
    eSignStatus: string | null;
    rejectionReason: string | null;
    verifiedAt: Date | null;
    updatedAt: Date;
}

// ─── eSign types ──────────────────────────────────────────────────────────────

export interface RequestESignInput {
    userId: string;
    loanId: string;
    loanAmount: number;
    tenureMonths: number;
    interestRate: number;
    monthlyEmi: number;
}

export interface ESignInitiatedResult {
    requestId: string;
    signingUrl: string;
    expiresAt: Date;
}

// ─── Internal admin types ─────────────────────────────────────────────────────

export interface ManualKycOverrideInput {
    userId: string;
    overriddenBy: string;
    reason: string;
    newStatus: KycStatus;
}

// ─── Underwriting input — what kyc.service exposes to underwriting.service ────

export interface KycUnderwritingData {
    creditScore: number | null;
    averageMonthlyIncome: number | null;
    existingEmiPerMonth: number | null;
    bankBounces: number;
    fraudScore: number | null;
    amlClear: boolean;
    monthsAnalysed: number;
}
