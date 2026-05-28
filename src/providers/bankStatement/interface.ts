// src/providers/bankStatement/interface.ts

export interface BankStatementTransaction {
    date: string;
    description: string;
    debit: number | null;
    credit: number | null;
    balance: number;
}

export interface BankStatementAnalysis {
    averageMonthlyBalance: number;
    averageMonthlyCredit: number;
    averageMonthlyDebit: number;
    monthsAnalysed: number;
    salaryCredits: number[];    // Monthly salary credits detected
    bounces: number;      // Cheque / NACH bounces
    emiObligations: number;      // Existing EMI debits detected per month
    transactions: BankStatementTransaction[];
    rawResponse: unknown;
}

export interface IBankStatementProvider {
    analyseStatement(
        fileBase64: string,
        fileType: 'pdf' | 'json',
        bankName?: string,
    ): Promise<BankStatementAnalysis>;
}
