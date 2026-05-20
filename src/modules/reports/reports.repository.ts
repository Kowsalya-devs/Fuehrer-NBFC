// src/modules/reports/reports.repository.ts
// Thin helper for report metadata — tracks what was generated and when.
// Not used for the report data itself (that lives in Redis or is streamed).

import { prisma } from '@/config/database';
import { createModuleLogger } from '@/config/logger';

const log = createModuleLogger('reports.repository');

export const reportsRepository = {

    async logReportGeneration(params: {
        reportType: string;
        format: string;
        generatedBy: string;
        fromDate: Date;
        toDate: Date;
        rowCount?: number;
    }): Promise<void> {
        await prisma.report_audit_log.create({
            data: {
                report_type: params.reportType,
                format: params.format,
                generated_by: params.generatedBy,
                from_date: params.fromDate,
                to_date: params.toDate,
                row_count: params.rowCount ?? null,
                generated_at: new Date(),
            },
        }).catch((err) => {
            log.error('Failed to log report generation', {
                error: (err as Error).message,
            });
        });
    },
};