// src/providers/creditBureau/interface.ts

export interface CreditAccount {
    accountType: string;
    lender: string;
    currentBalance: number;
    emiAmount: number;
    status: string;
    openedDate: string;
    closedDate: string | null;
}

export interface CreditReport {
    score: number;           // 300–900
    scoreVersion: string;
    totalAccounts: number;
    activeAccounts: number;
    closedAccounts: number;
    overdueAccounts: number;
    totalOutstanding: number;
    totalEmiObligation: number;
    enquiriesLast90Days: number;
    accounts: CreditAccount[];
    rawResponse: unknown;
}

export interface ICreditBureauProvider {
    fetchCreditReport(
        panNumber: string,
        fullName: string,
        dob: string,
        mobilePhone: string,
    ): Promise<CreditReport>;
}
