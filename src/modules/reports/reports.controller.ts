// src/modules/reports/reports.controller.ts
import type { Response, NextFunction } from 'express';
import { reportsService } from './reports.service';
import { reportsRepository } from './reports.repository';
import { HTTP } from '@/config/constants';
import { successResponse } from '@/types/common.types';
import { getValidatedQuery, getAuthUser } from '@/types/express.d';
import type { AuthRequest } from '@/types/express.d';
import type {
    PortfolioMISInput,
    CollectionEfficiencyInput,
    RbiReturnInput,
    RbiReportType,
    ReportFormat,
} from './reports.types';

// ─── Query parser helpers ─────────────────────────────────────────────────────

function parseDateRange(query: {
    fromDate?: string;
    toDate?: string;
}): { fromDate: Date; toDate: Date } {
    const toDate = query.toDate
        ? new Date(query.toDate)
        : new Date();
    const fromDate = query.fromDate
        ? new Date(query.fromDate)
        : new Date(toDate.getFullYear(), toDate.getMonth(), 1);

    return { fromDate, toDate };
}

// ─── Controller ───────────────────────────────────────────────────────────────

export const reportsController = {

    // GET /reports/portfolio
    async portfolioMIS(req: AuthRequest, res: Response, next: NextFunction) {
        try {
            const user = getAuthUser(req);
            const query = getValidatedQuery<{
                fromDate?: string;
                toDate?: string;
                format?: string;
                refresh?: string;
            }>(req);

            const { fromDate, toDate } = parseDateRange(query);
            const format = (query.format ?? 'json') as ReportFormat;

            const input: PortfolioMISInput = {
                fromDate,
                toDate,
                format,
                refresh: query.refresh === 'true',
            };

            const { data, contentType } = await reportsService.getPortfolioMIS(
                input, user.role,
            );

            // Log the generation
            reportsRepository.logReportGeneration({
                reportType: 'portfolio_mis',
                format,
                generatedBy: user.id,
                fromDate,
                toDate,
            });

            if (format === 'csv') {
                res.setHeader('Content-Type', 'text/csv');
                res.setHeader(
                    'Content-Disposition',
                    `attachment; filename="portfolio-mis-${toDate.toISOString().slice(0, 10)}.csv"`,
                );
                return res.status(HTTP.OK).send(data);
            }

            res.status(HTTP.OK).json(successResponse(data));
        } catch (err) { next(err); }
    },

    // GET /reports/collection-efficiency
    async collectionEfficiency(req: AuthRequest, res: Response, next: NextFunction) {
        try {
            const user = getAuthUser(req);
            const query = getValidatedQuery<{
                fromDate?: string;
                toDate?: string;
                agentId?: string;
                format?: string;
                refresh?: string;
            }>(req);

            const { fromDate, toDate } = parseDateRange(query);
            const format = (query.format ?? 'json') as ReportFormat;

            const input: CollectionEfficiencyInput = {
                fromDate,
                toDate,
                agentId: query.agentId,
                format,
                refresh: query.refresh === 'true',
            };

            const { data, contentType } = await reportsService.getCollectionEfficiency(
                input, user.role,
            );

            reportsRepository.logReportGeneration({
                reportType: 'collection_efficiency',
                format,
                generatedBy: user.id,
                fromDate,
                toDate,
            });

            if (format === 'csv') {
                res.setHeader('Content-Type', 'text/csv');
                res.setHeader(
                    'Content-Disposition',
                    `attachment; filename="collection-efficiency-${toDate.toISOString().slice(0, 10)}.csv"`,
                );
                return res.status(HTTP.OK).send(data);
            }

            res.status(HTTP.OK).json(successResponse(data));
        } catch (err) { next(err); }
    },

    // GET /reports/rbi-return
    async rbiReturn(req: AuthRequest, res: Response, next: NextFunction) {
        try {
            const user = getAuthUser(req);
            const query = getValidatedQuery<{
                reportType?: string;
                periodEnd?: string;
                format?: string;
                refresh?: string;
            }>(req);

            // Default to end of last month
            const now = new Date();
            const lastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
            const periodEnd = query.periodEnd
                ? new Date(query.periodEnd)
                : lastMonth;

            const format = (query.format ?? 'json') as ReportFormat;

            const input: RbiReturnInput = {
                reportType: (query.reportType ?? 'NPA_CLASSIFICATION') as RbiReportType,
                periodEnd,
                format,
                refresh: query.refresh === 'true',
            };

            const { data } = await reportsService.getRbiReturn(input, user.role);

            reportsRepository.logReportGeneration({
                reportType: `rbi_${input.reportType.toLowerCase()}`,
                format,
                generatedBy: user.id,
                fromDate: new Date(periodEnd.getFullYear(), periodEnd.getMonth(), 1),
                toDate: periodEnd,
            });

            if (format === 'csv') {
                res.setHeader('Content-Type', 'text/csv');
                res.setHeader(
                    'Content-Disposition',
                    `attachment; filename="rbi-return-${input.reportType.toLowerCase()}-${periodEnd.toISOString().slice(0, 10)}.csv"`,
                );
                return res.status(HTTP.OK).send(data);
            }

            res.status(HTTP.OK).json(successResponse(data));
        } catch (err) { next(err); }
    },
};