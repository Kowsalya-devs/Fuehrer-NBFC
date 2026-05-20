// src/providers/fraudScore/interface.ts
//
// Contract for fraud and behavioural risk scoring.
//
// Called during KYC risk checks (kyc.service.runRiskChecks) in parallel
// with the AML check. The fraud score is:
//   1. Saved to kyc_documents.fraud_score for display in admin dashboard
//   2. Used by the underwriting rules engine (FRAUD_SCORE rule):
//      maxFraudScore = 60 — scores above 60 auto-reject the loan
//
// Scale: 0–100 where 0 = no fraud signals, 100 = very high risk
//
// Production implementation uses Perfios Alerts + Bank Defaulters APIs
// (placeholder — wire live.ts when Perfios credentials are available).
//
// Checks performed:
//   - Behavioural risk scoring (device, location, velocity)
//   - Identity fraud signals (name mismatch across documents)
//   - Bank defaulter history
//   - Credit enquiry velocity (too many recent bureau pulls = fraud signal)

export interface FraudScoreInput {
    /** PAN number — primary identity anchor */
    panNumber: string;
    /** Aadhaar last 4 digits — secondary identity signal */
    aadhaarLast4: string;
    /** Phone number in E.164 format — velocity and identity check */
    phone: string;
}

export type FraudRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export interface FraudScoreResult {
    /**
     * Fraud risk score 0–100.
     * 0–40  = LOW    — proceed automatically
     * 41–60 = MEDIUM — proceed, flag for manual review
     * 61+   = HIGH   — hard reject (maxFraudScore = 60 in underwriting rules)
     */
    score: number;

    /** Derived risk level from the score */
    riskLevel: FraudRiskLevel;

    /** Individual fraud signals detected — empty array when score is low */
    signals: FraudSignal[];

    /** Raw vendor response — stored in kyc_documents.signzy_responses */
    rawResponse: unknown;
}

export interface FraudSignal {
    /** Signal type identifier */
    type: string;
    /** Human-readable description of the signal */
    description: string;
    /** Severity contribution to the overall score */
    severity: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface IFraudScoreProvider {
    /**
     * Calculates a fraud risk score for the applicant.
     * Score above maxFraudScore (60) triggers auto-rejection in underwriting.
     * Non-fatal — a provider failure is logged but does not block KYC.
     */
    getFraudScore(input: FraudScoreInput): Promise<FraudScoreResult>;
}