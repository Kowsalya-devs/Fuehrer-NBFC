// src/providers/bgCheck/interface.ts
//
// Contract for criminal and legal background checks.
//
// Called during agent / dealer onboarding to screen for criminal records,
// court cases, and legal notices before activating an agent account.
//
// Per the app workflow document:
//   "AuthBridge Background Check — Criminal & legal background check
//    → Agent Onboarding"
//
// A failed background check prevents agent account activation.
// Results are stored on the agent profile for audit purposes.
//
// Production implementation uses Perfios (placeholder) or AuthBridge.
// Wire live.ts when vendor credentials are available.

export type BgCheckStatus = 'CLEAR' | 'FLAGGED' | 'PENDING';

export interface BgCheckInput {
    /** Full name as on Aadhaar/PAN */
    fullName: string;
    /** Date of birth in YYYY-MM-DD format */
    dob: string;
    /** PAN number — primary identity anchor */
    panNumber: string;
    /** Aadhaar last 4 digits */
    aadhaarLast4: string;
    /** Address of the agent's principal place of business */
    address: string;
}

export interface BgCheckRecord {
    /** Type of record found */
    recordType: 'CRIMINAL' | 'COURT_CASE' | 'LEGAL_NOTICE' | 'POLICE_RECORD' | 'OTHER';
    /** Description of the record */
    description: string;
    /** Year of the record */
    year: number | null;
    /** Court or authority name */
    authority: string | null;
    /** Current status of the case */
    caseStatus: string | null;
}

export interface BgCheckResult {
    /**
     * CLEAR    = no records found — agent can be activated
     * FLAGGED  = one or more records found — admin review required
     * PENDING  = check in progress — poll again after a few minutes
     */
    status: BgCheckStatus;

    /** All records found — empty array when status is CLEAR */
    records: BgCheckRecord[];

    /** Vendor-assigned check reference ID for follow-up */
    referenceId: string | null;

    /** Raw vendor response — stored on agent profile for audit */
    rawResponse: unknown;
}

export interface IBgCheckProvider {
    /**
     * Runs criminal and legal background check for an agent.
     * FLAGGED result requires admin review before agent activation.
     * PENDING result means the check is async — poll getStatus().
     */
    check(input: BgCheckInput): Promise<BgCheckResult>;

    /**
     * Polls the status of an async background check.
     * Some vendors process checks asynchronously (10–30 minutes).
     * Call this with the referenceId from check() if status is PENDING.
     */
    getStatus(referenceId: string): Promise<BgCheckResult>;
}