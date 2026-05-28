// src/providers/esign/interface.ts
//
// Contract for Aadhaar-based digital signature (eSign) and legal stamping
// (eStamp) of loan agreements.
//
// Production implementation uses Signzy's eSign API:
//   1. createSignRequest  — generates a signing session, returns a URL the
//                           customer visits to sign via Aadhaar OTP.
//   2. getSignStatus      — poll or webhook handler to check signing progress.
//   3. applyEStamp        — applies a legal e-stamp to the signed document.
//   4. getDocument        — retrieves the final signed + stamped PDF.
//
// RBI Digital Lending Guidelines 2022 mandate:
//   - Every loan agreement MUST be digitally signed by the borrower before
//     disbursement. No disbursement without a SIGNED + STAMPED agreement.
//   - The signed PDF must be stored and retrievable for 5 years.
//
// NEVER call disbursement without verifying eSignStatus === 'SIGNED' and
// eStampStatus === 'APPLIED' on the loan account record.

// ─── Status enums ─────────────────────────────────────────────────────────────

export type ESignStatus =
    | 'PENDING'     // Request created, customer has not signed yet
    | 'SIGNED'      // Customer completed Aadhaar OTP signing
    | 'FAILED'      // Signing failed (OTP expired, Aadhaar mismatch, etc.)
    | 'EXPIRED'     // Signing URL expired (24hr window)
    | 'CANCELLED';  // Manually cancelled by admin

export type EStampStatus =
    | 'PENDING'     // eSign complete, eStamp not yet applied
    | 'APPLIED'     // Legal stamp applied — document is legally valid
    | 'FAILED';     // eStamp application failed — retry required

// ─── Input / result shapes ────────────────────────────────────────────────────

export interface CreateSignRequestInput {
    /** Unique document ID — used for idempotency. e.g. "loan-agreement-{loanId}" */
    documentId: string;

    /** Base64-encoded PDF of the loan agreement to be signed */
    documentBase64: string;

    /** Full name of the signer (borrower) as on their Aadhaar */
    signerName: string;

    /** Signer's mobile number — for OTP delivery fallback */
    signerPhone: string;

    /** Signer's Aadhaar number — used to bind the digital signature */
    signerAadhaar: string;

    /** Human-readable purpose shown to the signer on the signing page */
    purpose: string;
}

export interface CreateSignRequestResult {
    /** Vendor-assigned request ID — store in kyc_documents.esign_request_id */
    requestId: string;

    /** URL to send the customer for signing (redirect or in-app WebView) */
    signingUrl: string;

    /** Current status — always 'PENDING' on creation */
    status: ESignStatus;

    /** When the signing URL expires — typically 24 hours from creation */
    expiresAt: Date;
}

export interface ESignStatusResult {
    requestId: string;
    status: ESignStatus;
    signedAt: Date | null;
    /** Base64-encoded signed document — only populated when status === 'SIGNED' */
    signedDocumentBase64: string | null;
    rawResponse: unknown;
}

export interface ApplyEStampInput {
    /** The requestId returned by createSignRequest */
    requestId: string;

    /** Loan amount in rupees — determines stamp duty value */
    loanAmountRupees: number;

    /** State code for stamp duty calculation e.g. "MH", "KA", "TN" */
    stateCode: string;
}

export interface ApplyEStampResult {
    stampId: string;
    status: EStampStatus;
    stampDutyRupees: number;
    /** Base64-encoded stamped document */
    stampedDocumentBase64: string | null;
    rawResponse: unknown;
}

export interface GetSignedDocumentResult {
    /** Base64-encoded final signed + stamped PDF */
    documentBase64: string;
    /** S3 key where the document is stored after upload */
    s3Key: string | null;
}

// ─── Provider interface ───────────────────────────────────────────────────────

export interface IESignProvider {
    /**
     * Creates an eSign request and returns a signing URL for the customer.
     * The customer must visit the URL and authenticate via Aadhaar OTP to sign.
     */
    createSignRequest(
        input: CreateSignRequestInput,
    ): Promise<CreateSignRequestResult>;

    /**
     * Returns the current status of a signing request.
     * Called by the webhook handler and by admin poll endpoints.
     */
    getSignStatus(requestId: string): Promise<ESignStatusResult>;

    /**
     * Applies an e-stamp to a signed document.
     * Must be called AFTER status === 'SIGNED'.
     * eStamp is mandatory for loan agreements above ₹500 in most Indian states.
     */
    applyEStamp(input: ApplyEStampInput): Promise<ApplyEStampResult>;

    /**
     * Retrieves the final signed and stamped document.
     * Returns base64 PDF — caller is responsible for uploading to S3.
     */
    getSignedDocument(requestId: string): Promise<GetSignedDocumentResult>;
}
