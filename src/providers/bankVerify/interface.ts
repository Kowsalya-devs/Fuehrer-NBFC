// src/providers/bankVerify/interface.ts
//
// Contract for advanced bank account verification.
//
// The basic bank account check (account number + IFSC validity) is handled
// by kycVerify/interface.ts → verifyBankAccount(). This provider handles
// the three advanced Perfios verification methods needed for eNACH setup
// and high-value loan disbursements:
//
//   1. verifyWithPennyDrop   — sends ₹1 to the account, confirms receipt
//                              Most reliable. Used for eNACH mandate setup.
//
//   2. verifyAdvanced        — penny drop + reverse penny drop combined
//                              Guaranteed confirmation. Used for loans > ₹1L.
//
//   3. verifySilent          — UPI VPA lookup, no money transfer needed
//                              Instant. Used as pre-check before penny drop.
//                              Maps to Perfios Silent Bank Account Verification.
//
// Production implementation uses Perfios Bank AC Verification APIs
// (placeholder — wire live.ts when Perfios credentials are available).

// ─── Shared result ─────────────────────────────────────────────────────────────

export interface BankVerifyResult {
    /** true = account is valid and active */
    valid: boolean;
    /** Account holder name returned by the bank */
    nameAtBank: string | null;
    /** Name match score against provided name — 0–100 */
    nameMatchScore: number | null;
    /** IFSC code confirmed by bank */
    ifscConfirmed: string | null;
    /** Bank name */
    bankName: string | null;
    /** Branch name */
    branchName: string | null;
    /** Raw vendor response — stored in kyc_documents */
    rawResponse: unknown;
}

// ─── Penny drop specific ───────────────────────────────────────────────────────

export interface PennyDropInput {
    accountNumber: string;
    ifsc: string;
    /** Account holder name — used for name match */
    accountHolder: string;
    /** Reference ID for the penny drop transaction */
    referenceId: string;
}

export interface PennyDropResult extends BankVerifyResult {
    /** Transaction reference ID from NPCI */
    transactionId: string | null;
    /** Amount transferred — always 1 rupee */
    amountPaise: number;
}

// ─── Silent verification specific ─────────────────────────────────────────────

export interface SilentVerifyInput {
    accountNumber: string;
    ifsc: string;
    accountHolder: string;
}

// ─── Provider interface ────────────────────────────────────────────────────────

export interface IBankVerifyProvider {
    /**
     * Penny drop verification — sends ₹1 to confirm account is active.
     * Most reliable method. Used for eNACH mandate setup.
     * Costs one penny drop API call + ₹1 transaction.
     */
    verifyWithPennyDrop(input: PennyDropInput): Promise<PennyDropResult>;

    /**
     * Advanced verification — penny drop + reverse penny drop combined.
     * Guaranteed account confirmation. Used for loans above ₹1 lakh.
     */
    verifyAdvanced(input: PennyDropInput): Promise<PennyDropResult>;

    /**
     * Silent verification — UPI VPA lookup, no money transfer.
     * Instant and free. Used as a pre-check before penny drop.
     * Maps to Perfios Silent Bank Account Verification API.
     */
    verifySilent(input: SilentVerifyInput): Promise<BankVerifyResult>;
}
