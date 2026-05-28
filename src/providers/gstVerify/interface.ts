// src/providers/gstVerify/interface.ts
//
// Contract for GST (Goods and Services Tax) verification.
//
// Called during agent / dealer onboarding to verify the business is
// legitimately registered and GST-compliant. Two checks are performed:
//
//   1. authenticate  — verifies a GSTIN is valid and active with the
//                      GST portal. Returns business name, registration
//                      status, and filing compliance status.
//
//   2. parseGstCertificate — OCR-reads a GST registration certificate
//                            image and extracts structured data.
//                            Maps to Perfios GST Certificate Parsing API.
//
// RBI / NBFC requirement:
//   Agents must have a valid GST registration before being activated.
//   The GSTIN is stored on the agent profile and verified on onboarding.
//   Agents with cancelled or suspended GST registrations are rejected.
//
// Production implementation uses Perfios GST Authentication API
// (placeholder — wire live.ts when Perfios credentials are available).

// ─── GSTIN format ─────────────────────────────────────────────────────────────
// 15-character alphanumeric: 2-digit state code + 10-char PAN + 1 + Z + checksum
// e.g. 29ABCDE1234F1Z5

export type GstRegistrationStatus =
    | 'ACTIVE'      // Valid and actively filing returns
    | 'CANCELLED'   // Registration cancelled — reject agent
    | 'SUSPENDED'   // Temporarily suspended — reject agent
    | 'PENDING';    // New registration, not yet active

export interface GstVerifyInput {
    /** 15-character GSTIN */
    gstin: string;
    /** Legal name of the business — used for name match */
    businessName: string;
}

export interface GstVerifyResult {
    /** true = GSTIN is valid and status is ACTIVE */
    valid: boolean;
    /** Registration status from GST portal */
    registrationStatus: GstRegistrationStatus;
    /** Legal name of the business as registered on GST portal */
    legalName: string | null;
    /** Trade name (may differ from legal name) */
    tradeName: string | null;
    /** Business type e.g. "Private Limited", "Proprietorship" */
    businessType: string | null;
    /** State code extracted from GSTIN (first 2 digits) */
    stateCode: string;
    /** Date of GST registration */
    registrationDate: string | null;
    /** Name match score between provided name and GST portal name 0–100 */
    nameMatchScore: number | null;
    /** Raw vendor response — stored in agent profile */
    rawResponse: unknown;
}

export interface GstCertificateParseInput {
    /** Base64-encoded GST certificate image or PDF */
    documentBase64: string;
    /** MIME type of the document */
    contentType: 'image/jpeg' | 'image/png' | 'application/pdf';
}

export interface GstCertificateParseResult {
    /** Extracted GSTIN */
    gstin: string | null;
    /** Legal business name from certificate */
    legalName: string | null;
    /** Trade name from certificate */
    tradeName: string | null;
    /** Date of registration */
    registrationDate: string | null;
    /** Address of principal place of business */
    address: string | null;
    /** Raw vendor response */
    rawResponse: unknown;
}

export interface IGstVerifyProvider {
    /**
     * Verifies a GSTIN against the GST portal.
     * Returns valid: false for CANCELLED or SUSPENDED registrations.
     * Called during agent onboarding before account activation.
     */
    authenticate(input: GstVerifyInput): Promise<GstVerifyResult>;

    /**
     * OCR-reads a GST registration certificate and extracts data.
     * Used to pre-fill agent onboarding form from uploaded certificate.
     * Maps to Perfios GST Certificate Parsing API.
     */
    parseGstCertificate(
        input: GstCertificateParseInput,
    ): Promise<GstCertificateParseResult>;
}
