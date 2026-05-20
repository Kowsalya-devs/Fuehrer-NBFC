// src/modules/reports/reports.types.ts
import type { Rupees } from '@/types/common.types';

// ─── Report format ────────────────────────────────────────────────────────────

export type ReportFormat = 'json' | 'csv' | 'xlsx';

// ─── Date range ───────────────────────────────────────────────────────────────

export interface DateRange {
    fromDate: Date;
    toDate: Date;
}

// ─── Portfolio MIS types ──────────────────────────────────────────────────────

export interface PortfolioSnapshot {
    asOfDate: Date;

    // Loan book summary
    totalLoans: number;
    activeLoans: number;
    disbursedThisMonth: number;
    closedThisMonth: number;
    npaLoans: number;
    writtenOffLoans: number;

    // Amount summary
    totalDisbursed: Rupees;
    totalOutstanding: Rupees;
    totalOverdue: Rupees;
    disbursedThisMonthAmount: Rupees;

    // NPA metrics
    npaAmount: Rupees;
    npaRate: number;    // % of outstanding portfolio
    grossNpaRate: number;

    // Collection metrics
    collectionEfficiency: number; // % of EMIs due that were collected
    onTimePaymentRate: number;

    // DPD distribution
    dpdBuckets: {
        current: { count: number; amount: Rupees };
        bucket1: { count: number; amount: Rupees };
        bucket2: { count: number; amount: Rupees };
        bucket3: { count: number; amount: Rupees };
        npa: { count: number; amount: Rupees };
        writtenOff: { count: number; amount: Rupees };
    };

    // Product mix
    productBreakdown: Array<{
        productType: string;
        count: number;
        amount: Rupees;
        percentage: number;
    }>;

    // Geographic distribution
    cityBreakdown: Array<{
        city: string;
        count: number;
        amount: Rupees;
    }>;
}

// ─── Monthly trend ────────────────────────────────────────────────────────────

export interface MonthlyTrend {
    month: string;    // 'YYYY-MM'
    disbursements: number;
    disbursedAmount: Rupees;
    collections: number;
    collectedAmount: Rupees;
    newNpa: number;
    npaAmount: Rupees;
    closures: number;
}

// ─── Agent performance ────────────────────────────────────────────────────────

export interface AgentPerformanceRow {
    agentId: string;
    agentCode: string;
    agentName: string;
    shopCity: string;
    loansSubmitted: number;
    loansApproved: number;
    loansDisbursed: number;
    totalDisbursed: Rupees;
    approvalRate: number;
    npaCount: number;
    npaAmount: Rupees;
    commissionEarned: Rupees;
    commissionPaid: Rupees;
}

// ─── Portfolio MIS report ─────────────────────────────────────────────────────

export interface PortfolioMISReport {
    generatedAt: Date;
    reportPeriod: DateRange;
    snapshot: PortfolioSnapshot;
    monthlyTrend: MonthlyTrend[];
    agentPerformance: AgentPerformanceRow[];
}

// ─── Collection efficiency types ─────────────────────────────────────────────

export interface CollectionEfficiencyReport {
    generatedAt: Date;
    reportPeriod: DateRange;

    // Overall efficiency
    overallRate: number;    // %
    ptpKeptRate: number;    // % of PTPs that were honoured
    fieldContactRate: number;    // % of cases with at least one field visit
    resolutionRate: number;    // % of open cases resolved this period

    // By DPD bucket
    bucketEfficiency: Array<{
        bucket: string;
        totalCases: number;
        resolvedCases: number;
        collectedAmount: Rupees;
        outstandingAmount: Rupees;
        efficiencyRate: number;
    }>;

    // Agent efficiency
    agentEfficiency: Array<{
        agentId: string;
        agentName: string;
        casesAssigned: number;
        casesResolved: number;
        contactAttempts: number;
        ptpCount: number;
        ptpKept: number;
        amountCollected: Rupees;
        efficiencyRate: number;
    }>;

    // Daily collection trend
    dailyTrend: Array<{
        date: string;
        casesContacted: number;
        amountCollected: Rupees;
        resolutions: number;
    }>;
}

// ─── RBI return types ─────────────────────────────────────────────────────────

export interface RbiReturnReport {
    generatedAt: Date;
    reportingPeriod: DateRange;
    reportType: RbiReportType;
    data: RbiNbfcReturn;
}

export type RbiReportType =
    | 'NPA_CLASSIFICATION'
    | 'LOAN_DISBURSEMENT'
    | 'REPAYMENT_SCHEDULE'
    | 'CREDIT_INFORMATION';

export interface RbiNbfcReturn {
    // NBFC identification
    nbfcName: string;
    registrationNo: string;
    periodEndDate: string;

    // Loan portfolio
    totalLoanPortfolio: Rupees;
    standardAssets: Rupees;
    subStandardAssets: Rupees;  // 90–12 months DPD
    doubtfulAssets: Rupees;  // 12–36 months DPD
    lossAssets: Rupees;  // 36+ months DPD
    grossNpa: Rupees;
    netNpa: Rupees;
    provisioningRequired: Rupees;

    // Disbursement data
    loansApprovedInPeriod: number;
    amountApprovedInPeriod: Rupees;
    loansDisbursedInPeriod: number;
    amountDisbursedInPeriod: Rupees;

    // Collection data
    emisDueInPeriod: number;
    emisCollectedInPeriod: number;
    amountDueInPeriod: Rupees;
    amountCollectedInPeriod: Rupees;

    // Individual loan records (for detailed returns)
    loanRecords: RbiLoanRecord[];
}

export interface RbiLoanRecord {
    accountNumber: string;
    borrowerName: string;   // Partial — XXXX + last4 of name
    sanctionDate: string;
    disbursementDate: string;
    principalAmount: Rupees;
    outstandingAmount: Rupees;
    interestRate: number;
    tenureMonths: number;
    overdueDays: number;
    assetClassification: string;  // 'STANDARD' | 'SUB_STANDARD' | 'DOUBTFUL' | 'LOSS'
    provisioningRate: number;
    provisioningAmount: Rupees;
}

// ─── Report query inputs ──────────────────────────────────────────────────────

export interface PortfolioMISInput {
    fromDate: Date;
    toDate: Date;
    format: ReportFormat;
    refresh?: boolean;   // Force cache bypass
}

export interface CollectionEfficiencyInput {
    fromDate: Date;
    toDate: Date;
    agentId?: string;
    format: ReportFormat;
    refresh?: boolean;
}

export interface RbiReturnInput {
    reportType: RbiReportType;
    periodEnd: Date;         // Last day of the reporting period
    format: ReportFormat;
    refresh?: boolean;
}