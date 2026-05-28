// src/modules/kyc/kyc.events.ts
// KYC modules emits these events — eventBus handlers react to them.
// This file is the single place where KYC event emission is defined.

import { eventBus } from '@/events';
import type { KycStatus, KycCheck } from '@/config/constants';
import type { Request } from 'express';

export const kycEvents = {

    initiated(userId: string, req: Request): void {
        eventBus.emit('kyc.initiated', {
            userId,
            requestId: req.requestId,
        });
    },

    checkCompleted(
        userId: string,
        checkType: KycCheck,
        passed: boolean,
        score?: number,
        req?: Request,
    ): void {
        eventBus.emit('kyc.check.completed', {
            userId,
            checkType,
            passed,
            score,
            requestId: req?.requestId ?? `job:${checkType}`,
        });
    },

    statusChanged(
        userId: string,
        previousStatus: KycStatus,
        currentStatus: KycStatus,
        req?: Request,
    ): void {
        eventBus.emit('kyc.status.changed', {
            userId,
            previousStatus,
            currentStatus,
            requestId: req?.requestId ?? `system:status-change`,
        });
    },

    completed(
        userId: string,
        creditScore: number | null,
        req: Request,
    ): void {
        eventBus.emit('kyc.completed', {
            userId,
            creditScore,
            requestId: req.requestId,
        });
    },

    rejected(
        userId: string,
        reason: string,
        failedChecks: KycCheck[],
        req: Request,
    ): void {
        eventBus.emit('kyc.rejected', {
            userId,
            reason,
            failedChecks,
            requestId: req.requestId,
        });
    },
};
