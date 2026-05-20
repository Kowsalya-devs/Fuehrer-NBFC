// src/providers/amlCheck/interface.ts
//
// Contract for AML (Anti-Money Laundering) sanctions screening.
//
// This provider is called during KYC risk checks (kyc.service.runRiskChecks)
// and by the underwriting rules engine (underwriting.rules AML_CLEAR rule).
//
// A failed AML check is a HARD REJECTION — the loan application is
// immediately rejected with no retry allowed. This is mandated by:
//   - RBI Master Direction on KYC, 2016 (updated 2023)
//   - Prevention of Money Laundering Act (PMLA), 2002
//   - Financial Action Task Force (FATF) recommendations
//
// Production implementation uses Perfios AML Sanctions Screening API
// (placeholder — wire live.ts when Perfios credentials are available).
//
// Checks performed:
//   1. AML Sanctions Screening  — UN, OFAC, EU, domestic blacklists
//   2. PEP (Politically Exposed Person) check
//   3. Bank Defaulters list (RBI defaulters + CIBIL wilful defaulters)
//   4. Adverse media screening

export interface AmlCheckInput {
    /** Borrower's full name — must match Aadhaar/PAN */
    fullName: string;
    /** Date of birth in YYYY-MM-DD format */
    dob: string;
    /** PAN number — used as primary identifier */
    panNumber: string;
    /** Aadhaar last 4 digits — used for secondary matching */
    aadhaarLast4?: string;
}

export interface AmlHit {
    /** Which list the hit was found on */
    listName: string;
    /** Match confidence score 0–100 */
    matchScore: number;
    /** Category of the hit */
    category: 'SANCTIONS' | 'PEP' | 'DEFAULTER' | 'ADVERSE_MEDIA' | 'OTHER';
    /** Description of the hit */
    description: string;
}

export interface AmlCheckResult {
    /**
     * true = no hits found — application can proceed.
     * false = one or more hits — hard rejection, no retry.
     */
    clear: boolean;

    /** All hits found — empty array when clear === true */
    hits: AmlHit[];

    /** PEP flag — true if applicant is a politically exposed person */
    isPep: boolean;

    /** Bank defaulter flag — true if on RBI/CIBIL defaulter list */
    isDefaulter: boolean;

    /** Raw vendor response — stored in kyc_documents.signzy_responses */
    rawResponse: unknown;
}

export interface IAmlCheckProvider {
    /**
     * Runs AML sanctions screening, PEP check and defaulter check.
     * Returns clear: true if all checks pass.
     * A false result must immediately reject the KYC — no retry.
     */
    check(input: AmlCheckInput): Promise<AmlCheckResult>;
}