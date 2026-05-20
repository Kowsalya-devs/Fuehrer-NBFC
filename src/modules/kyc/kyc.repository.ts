// src/modules/kyc/kyc.repository.ts
import { prisma } from '@/config/database';
import { createModuleLogger } from '@/config/logger';
import {
    KYC_STATUS,
    KYC_CHECK,
} from '@/config/constants';
import type {
    KycDocument,
    KycCheckResponses,
    KycUnderwritingData,
} from './kyc.types';
import type { KycStatus, KycCheck } from '@/config/constants';
import { NotFoundError } from '@/errors';

const log = createModuleLogger('kyc.repository');

// ─── Type mapper ──────────────────────────────────────────────────────────────
// Converts raw Prisma row → typed KycDocument
// Keeps Prisma schema details inside the repository layer

function mapToKycDocument(row: Record<string, unknown>): KycDocument {
    return {
        id: row.id as string,
        userId: row.user_id as string,
        aadhaarEncrypted: row.aadhaar_encrypted as string | null,
        panEncrypted: row.pan_encrypted as string | null,
        aadhaarLast4: row.aadhaar_last4 as string | null,
        panMasked: row.pan_masked as string | null,
        selfieS3Key: row.selfie_s3_key as string | null,
        aadhaarFrontS3Key: row.aadhaar_front_s3_key as string | null,
        aadhaarBackS3Key: row.aadhaar_back_s3_key as string | null,
        panS3Key: row.pan_s3_key as string | null,
        bankStatementS3Key: row.bank_statement_s3_key as string | null,
        signedAgreementS3Key: row.signed_agreement_s3_key as string | null,
        livenessScore: row.liveness_score as number | null,
        faceMatchScore: row.face_match_score as number | null,
        fraudScore: row.fraud_score as number | null,
        creditScore: row.credit_score as number | null,
        eSignRequestId: row.esign_request_id as string | null,
        eSignStatus: row.esign_status as string | null,
        signzyResponses: row.signzy_responses
            ? (typeof row.signzy_responses === 'string'
                ? JSON.parse(row.signzy_responses)
                : row.signzy_responses) as KycCheckResponses
            : null,
        overallStatus: row.overall_status as KycStatus,
        completedChecks: (row.completed_checks as string[] | null) ?? [],
        failedChecks: (row.failed_checks as string[] | null) ?? [],
        rejectionReason: row.rejection_reason as string | null,
        verifiedAt: row.verified_at as Date | null,
        createdAt: row.created_at as Date,
        updatedAt: row.updated_at as Date,
    };
}

// ─── Repository methods ────────────────────────────────────────────────────────

export const kycRepository = {

    // ── Find ──────────────────────────────────────────────────────────────────

    async findByUserId(userId: string): Promise<KycDocument | null> {
        const row = await prisma.kyc_documents.findUnique({
            where: { user_id: userId },
        });
        return row ? mapToKycDocument(row as unknown as Record<string, unknown>) : null;
    },

    async findByUserIdOrThrow(userId: string): Promise<KycDocument> {
        const doc = await this.findByUserId(userId);
        if (!doc) throw new NotFoundError('KYC document', userId);
        return doc;
    },

    // ── Create ─────────────────────────────────────────────────────────────────

    async create(userId: string): Promise<KycDocument> {
        const row = await prisma.kyc_documents.create({
            data: {
                user_id: userId,
                overall_status: KYC_STATUS.NOT_STARTED,
                completed_checks: [],
                failed_checks: [],
                created_at: new Date(),
                updated_at: new Date(),
            },
        });
        log.info('KYC document created', { userId });
        return mapToKycDocument(row as unknown as Record<string, unknown>);
    },

    // ── Upsert — creates if not exists, returns existing if already there ───────

    async upsert(userId: string): Promise<KycDocument> {
        const existing = await this.findByUserId(userId);
        if (existing) return existing;
        return this.create(userId);
    },

    // ── Status update ──────────────────────────────────────────────────────────

    async updateStatus(
        userId: string,
        status: KycStatus,
        rejectionReason?: string,
    ): Promise<KycDocument> {
        const data: Record<string, unknown> = {
            overall_status: status,
            updated_at: new Date(),
        };

        if (status === KYC_STATUS.COMPLETE) {
            data.verified_at = new Date();
        }
        if (rejectionReason) {
            data.rejection_reason = rejectionReason;
        }

        const row = await prisma.kyc_documents.update({
            where: { user_id: userId },
            data,
        });
        return mapToKycDocument(row as unknown as Record<string, unknown>);
    },

    // ── Mark a check as completed or failed ────────────────────────────────────

    async recordCheckResult(
        userId: string,
        checkType: KycCheck,
        passed: boolean,
    ): Promise<void> {
        const current = await this.findByUserIdOrThrow(userId);

        if (passed) {
            const completed = Array.from(
                new Set([...current.completedChecks, checkType]),
            );
            await prisma.kyc_documents.update({
                where: { user_id: userId },
                data: {
                    completed_checks: completed,
                    // Remove from failed if it was previously failed and now retried
                    failed_checks: current.failedChecks.filter((c) => c !== checkType),
                    updated_at: new Date(),
                },
            });
        } else {
            const failed = Array.from(
                new Set([...current.failedChecks, checkType]),
            );
            await prisma.kyc_documents.update({
                where: { user_id: userId },
                data: {
                    failed_checks: failed,
                    updated_at: new Date(),
                },
            });
        }
    },

    // ── Save encrypted identity fields ─────────────────────────────────────────

    async saveEncryptedAadhaar(
        userId: string,
        aadhaarEncrypted: string,
        aadhaarLast4: string,
    ): Promise<void> {
        await prisma.kyc_documents.update({
            where: { user_id: userId },
            data: {
                aadhaar_encrypted: aadhaarEncrypted,
                aadhaar_last4: aadhaarLast4,
                updated_at: new Date(),
            },
        });
    },

    async saveEncryptedPan(
        userId: string,
        panEncrypted: string,
        panMasked: string,
    ): Promise<void> {
        await prisma.kyc_documents.update({
            where: { user_id: userId },
            data: {
                pan_encrypted: panEncrypted,
                pan_masked: panMasked,
                updated_at: new Date(),
            },
        });
    },

    // ── Save S3 document key ────────────────────────────────────────────────────

    async saveDocumentKey(
        userId: string,
        documentType: string,
        s3Key: string,
    ): Promise<void> {
        const columnMap: Record<string, string> = {
            selfie: 'selfie_s3_key',
            aadhaar_front: 'aadhaar_front_s3_key',
            aadhaar_back: 'aadhaar_back_s3_key',
            pan: 'pan_s3_key',
            bank_statement: 'bank_statement_s3_key',
        };

        const column = columnMap[documentType];
        if (!column) throw new Error(`Unknown document type: ${documentType}`);

        await prisma.kyc_documents.update({
            where: { user_id: userId },
            data: { [column]: s3Key, updated_at: new Date() },
        });
    },

    // ── Save scores ────────────────────────────────────────────────────────────

    async saveScores(
        userId: string,
        scores: {
            livenessScore?: number;
            faceMatchScore?: number;
            fraudScore?: number;
            creditScore?: number;
        },
    ): Promise<void> {
        const data: Record<string, unknown> = { updated_at: new Date() };
        if (scores.livenessScore !== undefined) data.liveness_score = scores.livenessScore;
        if (scores.faceMatchScore !== undefined) data.face_match_score = scores.faceMatchScore;
        if (scores.fraudScore !== undefined) data.fraud_score = scores.fraudScore;
        if (scores.creditScore !== undefined) data.credit_score = scores.creditScore;

        await prisma.kyc_documents.update({
            where: { user_id: userId },
            data,
        });
    },

    // ── Save raw vendor response (append to JSONB) ─────────────────────────────

    async appendSignzyResponse(
        userId: string,
        checkKey: keyof KycCheckResponses,
        response: unknown,
    ): Promise<void> {
        // PostgreSQL JSONB merge — atomic and avoids read-modify-write race
        await prisma.$executeRaw`
      UPDATE kyc_documents
      SET
        signzy_responses = COALESCE(signzy_responses, '{}'::jsonb)
          || jsonb_build_object(${checkKey}::text, ${JSON.stringify(response)}::jsonb),
        updated_at = NOW()
      WHERE user_id = ${userId}::uuid
    `;
    },

    // ── eSign fields ───────────────────────────────────────────────────────────

    async saveESignRequest(
        userId: string,
        requestId: string,
        status: string,
    ): Promise<void> {
        await prisma.kyc_documents.update({
            where: { user_id: userId },
            data: {
                esign_request_id: requestId,
                esign_status: status,
                updated_at: new Date(),
            },
        });
    },

    async updateESignStatus(
        userId: string,
        status: string,
        signedAgreementS3Key?: string,
    ): Promise<void> {
        await prisma.kyc_documents.update({
            where: { user_id: userId },
            data: {
                esign_status: status,
                signed_agreement_s3_key: signedAgreementS3Key ?? undefined,
                updated_at: new Date(),
            },
        });
    },

    // ── Underwriting data projection ───────────────────────────────────────────
    // Called by underwriting.service — returns only what underwriting needs

    async getUnderwritingData(userId: string): Promise<KycUnderwritingData> {
        const doc = await this.findByUserIdOrThrow(userId);

        const bankStatement = doc.signzyResponses?.bankStatement;
        const fraudResult = doc.signzyResponses?.fraudScore;

        return {
            creditScore: doc.creditScore,
            averageMonthlyIncome: bankStatement?.averageMonthlyCredit ?? null,
            existingEmiPerMonth: bankStatement?.emiObligations ?? null,
            bankBounces: bankStatement?.bounces ?? 0,
            fraudScore: doc.fraudScore,
            amlClear: doc.signzyResponses?.amlCheck?.clear ?? true,
            monthsAnalysed: bankStatement?.monthsAnalysed ?? 0,
        };
    },

    // ── Check KYC is complete — used as a gate in loans.service ───────────────

    async isComplete(userId: string): Promise<boolean> {
        const row = await prisma.kyc_documents.findUnique({
            where: { user_id: userId },
            select: { overall_status: true },
        });
        return row?.overall_status === KYC_STATUS.COMPLETE;
    },
};