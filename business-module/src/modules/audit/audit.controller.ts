// src/modules/audit/audit.controller.ts
import type { Response, NextFunction } from 'express';
import { auditService } from './audit.service';
import { HTTP } from '@/config/constants';
import { successResponse } from '@/types/common.types';
import {
    getValidatedParams,
    getValidatedQuery,
    getAuthUser,
} from '@/types/express';
import type { AuthRequest } from '@/types/express';
import type { AuditTrailInput, ListAuditLogsInput } from './audit.types';

export const auditController = {

    async stats(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
        try {
            const user = getAuthUser(req);
            const stats = await auditService.getStats(user.role);
            res.status(HTTP.OK).json(successResponse(stats));
        } catch (err) { next(err); }
    },

    async export(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
        try {
            const user = getAuthUser(req);
            const query = getValidatedQuery<{
                fromDate: Date;
                toDate: Date;
                entityType?: string;
                action?: string;
                format: 'json' | 'csv';
            }>(req);

            const chunks: string[] = [];
            await auditService.streamExport(
                {
                    fromDate: query.fromDate,
                    toDate: query.toDate,
                    entityType: query.entityType,
                    action: query.action,
                    format: query.format ?? 'json',
                },
                user.role,
                (chunk) => { chunks.push(chunk); },
            );

            if (query.format === 'csv') {
                res.setHeader('Content-Type', 'text/csv');
                res.setHeader('Content-Disposition', 'attachment; filename="audit-export.csv"');
                res.status(HTTP.OK).send(chunks.join(''));
            } else {
                res.status(HTTP.OK).json(successResponse(JSON.parse(chunks.join(''))));
            }
        } catch (err) { next(err); }
    },

    async entityTrail(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
        try {
            const user = getAuthUser(req);
            const { entityType, entityId } = getValidatedParams<{
                entityType: string;
                entityId: string;
            }>(req);
            const query = getValidatedQuery<{ page: number; limit: number }>(req);

            const result = await auditService.getEntityTrail(
                {
                    entityType,
                    entityId,
                    page: query.page,
                    limit: query.limit,
                } as AuditTrailInput,
                user.role,
            );
            res.status(HTTP.OK).json(successResponse(result));
        } catch (err) { next(err); }
    },

    async userActivity(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
        try {
            const user = getAuthUser(req);
            const { userId } = getValidatedParams<{ userId: string }>(req);
            const query = getValidatedQuery<{
                page: number;
                limit: number;
                fromDate?: Date;
                toDate?: Date;
            }>(req);

            const result = await auditService.getUserActivity(
                {
                    userId,
                    page: query.page,
                    limit: query.limit,
                    fromDate: query.fromDate,
                    toDate: query.toDate,
                },
                user.role,
            );
            res.status(HTTP.OK).json(successResponse(result));
        } catch (err) { next(err); }
    },

    async requestTrace(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
        try {
            const user = getAuthUser(req);
            const { requestId } = getValidatedParams<{ requestId: string }>(req);
            const entries = await auditService.getRequestTrace(requestId, user.role);
            res.status(HTTP.OK).json(successResponse(entries));
        } catch (err) { next(err); }
    },

    async list(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
        try {
            const user = getAuthUser(req);
            const query = getValidatedQuery<ListAuditLogsInput>(req);
            const result = await auditService.list(query, user.role);
            res.status(HTTP.OK).json(successResponse(result));
        } catch (err) { next(err); }
    },

    async getOne(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
        try {
            const user = getAuthUser(req);
            const { id } = getValidatedParams<{ id: string }>(req);
            const entry = await auditService.getEntry(id, user.role);
            res.status(HTTP.OK).json(successResponse(entry));
        } catch (err) { next(err); }
    },
};
