// src/modules/reports/reports.service.ts
import { portfolioMISService } from './portfolioMIS.service';
import { collectionEfficiencyService } from './collectionEfficiency.service';
import { rbiReturnService } from './rbiReturn.service';
import { createModuleLogger } from '@/config/logger';
import { ForbiddenError } from '@/errors';
import type {
    PortfolioMISReport,
    CollectionEfficiencyReport,
    RbiReturnReport,
    PortfolioMISInput,
    CollectionEfficiencyInput,
    RbiReturnInput,
    ReportFormat,
} from './reports.types';

const log = createModuleLogger('reports.service');

// ─── Access control ───────────────────────────────────────────────────────────

function assertReportAccess(
    role: string,
    reportType: string,
): void {
    const PORTFOLIO_ROLES = new Set(['FINANCE', 'SUPER_ADMIN', 'CREDIT_MANAGER']);
    const COLLECTION_ROLES = new Set(['FINANCE', 'SUPER_ADMIN', 'OPS_EXECUTIVE']);
    const RBI_ROLES = new Set(['FINANCE', 'SUPER_ADMIN']);

    const allowed =
        reportType === 'portfolio' ? PORTFOLIO_ROLES :
            reportType === 'collection' ? COLLECTION_ROLES :
                RBI_ROLES;

    if (!allowed.has(role)) {
        throw new ForbiddenError(
            `Access to ${reportType} reports requires one of: ${[...allowed].join(', ')}`,
        );
    }
}

// ─── CSV serialisers ──────────────────────────────────────────────────────────

function portfolioToCsv(report: PortfolioMISReport): string {
    const s = report.snapshot;
    const lines = [
        'Feuhrer CDL Platform — Portfolio MIS Report',
        `Generated: ${report.generatedAt.toISOString()}`,
        `Period: ${report.reportPeriod.fromDate.toISOString().slice(0, 10)} to ${report.reportPeriod.toDate.toISOString().slice(0, 10)}`,
        '',
        '=== PORTFOLIO SNAPSHOT ===',
        'Metric,Value',
        `Total Loans,${s.totalLoans}`,
        `Active Loans,${s.activeLoans}`,
        `Total Disbursed,${s.totalDisbursed}`,
        `Total Outstanding,${s.totalOutstanding}`,
        `Total Overdue,${s.totalOverdue}`,
        `NPA Amount,${s.npaAmount}`,
        `NPA Rate (%),${s.npaRate}`,
        `Collection Efficiency (%),${s.collectionEfficiency}`,
        `On-Time Payment Rate (%),${s.onTimePaymentRate}`,
        '',
        '=== DPD DISTRIBUTION ===',
        'Bucket,Count,Amount',
        `CURRENT,${s.dpdBuckets.current.count},${s.dpdBuckets.current.amount}`,
        `1-30 DPD,${s.dpdBuckets.bucket1.count},${s.dpdBuckets.bucket1.amount}`,
        `31-60 DPD,${s.dpdBuckets.bucket2.count},${s.dpdBuckets.bucket2.amount}`,
        `61-90 DPD,${s.dpdBuckets.bucket3.count},${s.dpdBuckets.bucket3.amount}`,
        `NPA (90+ DPD),${s.dpdBuckets.npa.count},${s.dpdBuckets.npa.amount}`,
        `Written Off,${s.dpdBuckets.writtenOff.count},${s.dpdBuckets.writtenOff.amount}`,
        '',
        '=== MONTHLY TREND ===',
        'Month,Disbursements,Disbursed Amount,Collections,Collected Amount,New NPA,NPA Amount,Closures',
        ...report.monthlyTrend.map((m) =>
            `${m.month},${m.disbursements},${m.disbursedAmount},${m.collections},${m.collectedAmount},${m.newNpa},${m.npaAmount},${m.closures}`,
        ),
        '',
        '=== AGENT PERFORMANCE ===',
        'Agent Code,Agent Name,City,Loans Submitted,Loans Approved,Loans Disbursed,Total Disbursed,Approval Rate (%),NPA Count,Commission Earned',
        ...report.agentPerformance.map((a) =>
            `${a.agentCode},${a.agentName},${a.shopCity},${a.loansSubmitted},${a.loansApproved},${a.loansDisbursed},${a.totalDisbursed},${a.approvalRate},${a.npaCount},${a.commissionEarned}`,
        ),
    ];
    return lines.join('\n');
}

function collectionToCsv(report: CollectionEfficiencyReport): string {
    const lines = [
        'Feuhrer CDL Platform — Collection Efficiency Report',
        `Generated: ${report.generatedAt.toISOString()}`,
        `Period: ${report.reportPeriod.fromDate.toISOString().slice(0, 10)} to ${report.reportPeriod.toDate.toISOString().slice(0, 10)}`,
        '',
        '=== OVERALL METRICS ===',
        'Metric,Value',
        `Overall Collection Rate (%),${report.overallRate}`,
        `PTP Kept Rate (%),${report.ptpKeptRate}`,
        `Field Contact Rate (%),${report.fieldContactRate}`,
        `Resolution Rate (%),${report.resolutionRate}`,
        '',
        '=== BUCKET EFFICIENCY ===',
        'Bucket,Total Cases,Resolved,Collected Amount,Outstanding Amount,Efficiency Rate (%)',
        ...report.bucketEfficiency.map((b) =>
            `${b.bucket},${b.totalCases},${b.resolvedCases},${b.collectedAmount},${b.outstandingAmount},${b.efficiencyRate}`,
        ),
        '',
        '=== AGENT EFFICIENCY ===',
        'Agent Name,Cases Assigned,Cases Resolved,Contact Attempts,PTP Count,PTP Kept,Amount Collected,Efficiency Rate (%)',
        ...report.agentEfficiency.map((a) =>
            `${a.agentName},${a.casesAssigned},${a.casesResolved},${a.contactAttempts},${a.ptpCount},${a.ptpKept},${a.amountCollected},${a.efficiencyRate}`,
        ),
        '',
        '=== DAILY TREND ===',
        'Date,Cases Contacted,Amount Collected,Resolutions',
        ...report.dailyTrend.map((d) =>
            `${d.date},${d.casesContacted},${d.amountCollected},${d.resolutions}`,
        ),
    ];
    return lines.join('\n');
}

function rbiReturnToCsv(report: RbiReturnReport): string {
    const d = report.data;
    const lines = [
        `RBI NBFC Return — ${report.reportType}`,
        `NBFC: ${d.nbfcName}`,
        `Registration: ${d.registrationNo}`,
        `Period End: ${d.periodEndDate}`,
        `Generated: ${report.generatedAt.toISOString()}`,
        '',
        '=== PORTFOLIO CLASSIFICATION ===',
        'Category,Amount (INR)',
        `Total Loan Portfolio,${d.totalLoanPortfolio}`,
        `Standard Assets,${d.standardAssets}`,
        `Sub-Standard Assets,${d.subStandardAssets}`,
        `Doubtful Assets,${d.doubtfulAssets}`,
        `Loss Assets,${d.lossAssets}`,
        `Gross NPA,${d.grossNpa}`,
        `Net NPA,${d.netNpa}`,
        `Provisioning Required,${d.provisioningRequired}`,
        '',
        '=== PERIOD ACTIVITY ===',
        'Metric,Count,Amount (INR)',
        `Loans Approved,${d.loansApprovedInPeriod},${d.amountApprovedInPeriod}`,
        `Loans Disbursed,${d.loansDisbursedInPeriod},${d.amountDisbursedInPeriod}`,
        `EMIs Due,${d.emisDueInPeriod},${d.amountDueInPeriod}`,
        `EMIs Collected,${d.emisCollectedInPeriod},${d.amountCollectedInPeriod}`,
        '',
        '=== INDIVIDUAL LOAN RECORDS ===',
        'Account Number,Borrower,Sanction Date,Disbursement Date,Principal,Outstanding,Rate (%),Tenure,DPD,Classification,Provision Rate,Provision Amount',
        ...d.loanRecords.map((r) =>
            `${r.accountNumber},${r.borrowerName},${r.sanctionDate},${r.disbursementDate},${r.principalAmount},${r.outstandingAmount},${r.interestRate},${r.tenureMonths},${r.overdueDays},${r.assetClassification},${r.provisioningRate},${r.provisioningAmount}`,
        ),
    ];
    return lines.join('\n');
}

// ─── Service ───────────────────────────────────────────────────────────────────

export const reportsService = {

    async getPortfolioMIS(
        input: PortfolioMISInput,
        role: string,
    ): Promise<{ data: PortfolioMISReport | string; contentType: string }> {
        assertReportAccess(role, 'portfolio');
        const report = await portfolioMISService.generate(input);

        if (input.format === 'csv') {
            return {
                data: portfolioToCsv(report),
                contentType: 'text/csv',
            };
        }

        return { data: report, contentType: 'application/json' };
    },

    async getCollectionEfficiency(
        input: CollectionEfficiencyInput,
        role: string,
    ): Promise<{ data: CollectionEfficiencyReport | string; contentType: string }> {
        assertReportAccess(role, 'collection');
        const report = await collectionEfficiencyService.generate(input);

        if (input.format === 'csv') {
            return {
                data: collectionToCsv(report),
                contentType: 'text/csv',
            };
        }

        return { data: report, contentType: 'application/json' };
    },

    async getRbiReturn(
        input: RbiReturnInput,
        role: string,
    ): Promise<{ data: RbiReturnReport | string; contentType: string }> {
        assertReportAccess(role, 'rbi');
        const report = await rbiReturnService.generate(input);

        if (input.format === 'csv') {
            return {
                data: rbiReturnToCsv(report),
                contentType: 'text/csv',
            };
        }

        return { data: report, contentType: 'application/json' };
    },
};
