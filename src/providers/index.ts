// src/providers/index.ts
//
// Central barrel — every service and module imports all provider getter
// functions from here, never from individual provider sub-directories.
//
// Why a barrel?
//   - One import path to mock in tests: jest.mock('@/providers')
//   - Alphabetical order makes it easy to verify nothing is missing
//   - TypeScript path alias @/providers resolves here
//
// ADDING A NEW PROVIDER:
//   1. Create src/providers/<name>/ with interface.ts, live.ts, stub.ts, index.ts
//   2. Add the getter and reset function exports below
//   3. Add the type export if consumers need the interface type
//
// NOTE: Encryption and eSign providers are intentionally first — they are
// the only two hard blockers for application startup (KYC service calls them
// before any other provider).

// ─── Encryption (AWS KMS + AES-256-GCM) ──────────────────────────────────────
export { getEncryptionProvider, _resetEncryptionProvider } from './encryption';
export type { IEncryptionProvider } from './encryption';

// ─── eSign + eStamp (Signzy) ─────────────────────────────────────────────────
export { getESignProvider, _resetESignProvider } from './esign';
export type { IESignProvider } from './esign';
export type {
    CreateSignRequestInput,
    CreateSignRequestResult,
    ESignStatus,
} from './esign';

// ─── AML / Sanctions check ───────────────────────────────────────────────────
export { getAmlCheckProvider, _resetAmlCheckProvider } from './amlCheck';
export type { IAmlCheckProvider } from './amlCheck';
export type { AmlCheckInput, AmlCheckResult } from './amlCheck';

// ─── Bank statement analysis ─────────────────────────────────────────────────
export {
    getBankStatementProvider,
    _resetBankStatementProvider,
} from './bankStatement';
export type { IBankStatementProvider } from './bankStatement';
export type {
    BankStatementAnalysis,
    BankStatementTransaction,
} from './bankStatement';

// ─── Bank account verification ───────────────────────────────────────────────
export { getBankVerifyProvider, _resetBankVerifyProvider } from './bankVerify';
export type { IBankVerifyProvider } from './bankVerify';
export type {
    BankVerifyInput,
    BankVerifyResult,
} from './bankVerify';

// ─── Background check (agent onboarding) ─────────────────────────────────────
export { getBgCheckProvider, _resetBgCheckProvider } from './bgCheck';
export type { IBgCheckProvider } from './bgCheck';
export type { BgCheckInput, BgCheckResult } from './bgCheck';

// ─── Credit bureau (CIBIL / Experian / Equifax / CRIF) ───────────────────────
export {
    getCreditBureauProvider,
    _resetCreditBureauProvider,
} from './creditBureau';
export type { ICreditBureauProvider } from './creditBureau';
export type { CreditReport, CreditAccount } from './creditBureau';

// ─── Document / file storage (AWS S3) ────────────────────────────────────────
export {
    getDocStorageProvider,
    _resetDocStorageProvider,
} from './docStorage';
export type { IDocStorageProvider } from './docStorage';
export type {
    UploadDocInput,
    UploadDocResult,
    SignedUrlResult,
} from './docStorage';

// ─── Email (Resend) ───────────────────────────────────────────────────────────
export { getEmailProvider, _resetEmailProvider } from './email';
export type { IEmailProvider } from './email';
export type { SendEmailInput, SendEmailResult } from './email';

// ─── Fraud / risk score ───────────────────────────────────────────────────────
export {
    getFraudScoreProvider,
    _resetFraudScoreProvider,
} from './fraudScore';
export type { IFraudScoreProvider } from './fraudScore';
export type { FraudScoreInput, FraudScoreResult } from './fraudScore';

// ─── GST verification ─────────────────────────────────────────────────────────
export { getGstVerifyProvider, _resetGstVerifyProvider } from './gstVerify';
export type { IGstVerifyProvider } from './gstVerify';
export type { GstVerifyInput, GstVerifyResult } from './gstVerify';

// ─── KYC identity verification (Signzy — Aadhaar / PAN / Face / Liveness) ────
export {
    getKycVerifyProvider,
    _resetKycVerifyProvider,
} from './kycVerify';
export type { IKycVerifyProvider } from './kycVerify';
export type {
    AadhaarVerifyResult,
    PanVerifyResult,
    FaceMatchResult,
    LivenessResult,
    OcrResult,
    BankAccountVerifyResult,
} from './kycVerify';

// ─── Payment gateway (Razorpay) ───────────────────────────────────────────────
export { getPaymentProvider, _resetPaymentProvider } from './payment';
export type { IPaymentProvider } from './payment';
export type {
    CreateMandateInput,
    CreateMandateResult,
    DebitInput,
    DebitResult,
    PayoutInput,
    PayoutResult,
    PaymentLinkInput,
    PaymentLinkResult,
} from './payment';

// ─── SMS (MSG91 / Twilio) ─────────────────────────────────────────────────────
export { getSmsProvider, _resetSmsProvider } from './sms';
export type { ISmsProvider } from './sms';
export type { SendSmsInput, SendSmsResult } from './sms';