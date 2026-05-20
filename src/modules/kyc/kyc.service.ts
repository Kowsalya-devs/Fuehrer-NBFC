// src/modules/kyc/kyc.service.ts
import { randomUUID } from 'crypto';
import type { Request } from 'express';
import { kycRepository } from './kyc.repository';
import { kycEvents } from './kyc.events';
import {
    getKycVerifyProvider,
    getBankStatementProvider,
    getCreditBureauProvider,
    getFraudScoreProvider,
    getAmlCheckProvider,
    getESignProvider,
    getDocStorageProvider,
    getEncryptionProvider,
} from '@/providers';
import {
    KYC_STATUS,
    KYC_CHECK,
    BUSINESS_RULES,
    AUDIT_ACTION,
} from '@/config/constants';
import type { KycStatus, KycCheck } from '@/config/constants';
import {
    KycIncompleteError,
    KycRejectedError,
    CONFLICT_ERRORS,
    NotFoundError,
} from '@/errors';
import { setAuditContext } from '@/middlewares';
import { createModuleLogger } from '@/config/logger';
import type {
    KycDocument,
    KycStatusResponse,
    InitiateKycInput,
    AadhaarOtpRequestInput,
    AadhaarOtpVerifyInput,
    UploadKycDocumentInput,
    UploadKycDocumentResult,
    RequestESignInput,
    ESignInitiatedResult,
    ManualKycOverrideInput,
    KycCheckResult,
} from './kyc.types';

const log = createModuleLogger('kyc.service');

// ─── All 13 checks in the required sequence ────────────────────────────────────
// Order matters — face match requires liveness to pass first;
// bank statement is needed for underwriting; bureau is last (costs most)

const MANDATORY_CHECKS: KycCheck[] = [
    KYC_CHECK.AADHAAR_VERIFY,
    KYC_CHECK.PAN_VERIFY,
    KYC_CHECK.LIVENESS,
    KYC_CHECK.FACE_MATCH,
    KYC_CHECK.AADHAAR_OCR,
    KYC_CHECK.PAN_OCR,
    KYC_CHECK.BANK_ACCOUNT,
    KYC_CHECK.BANK_STATEMENT,
    KYC_CHECK.RISK_SCORE,
    KYC_CHECK.DATA_BREACH,
];

// Bureau and eSign are done separately — bureau after basic KYC passes,
// eSign only after loan is approved
const BUREAU_CHECK: KycCheck = KYC_CHECK.RISK_SCORE;
const ESIGN_CHECK: KycCheck = KYC_CHECK.ESIGN;

// ─── Mask helpers ──────────────────────────────────────────────────────────────

function maskPan(pan: string): string {
    // ABCDE1234F → ABCDE****F
    return pan.slice(0, 5) + '****' + pan.slice(-1);
}

function aadhaarLast4(aadhaar: string): string {
    return aadhaar.slice(-4);
}

// ─── Build safe public response ────────────────────────────────────────────────

function toStatusResponse(doc: KycDocument): KycStatusResponse {
    const pending = MANDATORY_CHECKS.filter(
        (c) => !doc.completedChecks.includes(c) && !doc.failedChecks.includes(c),
    );

    return {
        userId: doc.userId,
        overallStatus: doc.overallStatus,
        completedChecks: doc.completedChecks,
        failedChecks: doc.failedChecks,
        pendingChecks: pending,
        creditScore: doc.creditScore,
        faceMatchScore: doc.faceMatchScore,
        livenessScore: doc.livenessScore,
        fraudScore: doc.fraudScore,
        aadhaarLast4: doc.aadhaarLast4,
        panMasked: doc.panMasked,
        eSignStatus: doc.eSignStatus,
        rejectionReason: doc.rejectionReason,
        verifiedAt: doc.verifiedAt,
        updatedAt: doc.updatedAt,
    };
}

// ─── Service ───────────────────────────────────────────────────────────────────

export const kycService = {

    // ── 1. Initiate KYC ──────────────────────────────────────────────────────────
    // Creates the KYC document and encrypts the PAN immediately on receipt.
    // Aadhaar is NOT collected here — that comes via the OTP flow.

    async initiateKyc(
        input: InitiateKycInput,
        req: Request,
    ): Promise<KycStatusResponse> {
        const { userId, pan } = input;

        // Idempotency — if already complete, return current state
        const existing = await kycRepository.findByUserId(userId);
        if (existing?.overallStatus === KYC_STATUS.COMPLETE) {
            throw CONFLICT_ERRORS.kycAlreadyComplete(userId);
        }

        // Create or reuse KYC document
        const doc = await kycRepository.upsert(userId);

        // Encrypt PAN immediately — never store raw PAN
        const enc = getEncryptionProvider();
        const panEnc = await enc.encrypt(pan);
        const panMask = maskPan(pan);
        await kycRepository.saveEncryptedPan(userId, panEnc, panMask);

        // Transition to IN_PROGRESS
        const updated = await kycRepository.updateStatus(userId, KYC_STATUS.IN_PROGRESS);

        setAuditContext(req, {
            action: AUDIT_ACTION.KYC_INITIATED,
            entityType: 'kyc_documents',
            entityId: doc.id,
        });

        kycEvents.initiated(userId, req);
        kycEvents.statusChanged(userId, doc.overallStatus, KYC_STATUS.IN_PROGRESS, req);

        log.info('KYC initiated', { userId });
        return toStatusResponse(updated);
    },

    // ── 2. Aadhaar OTP request ────────────────────────────────────────────────────
    // Receives full Aadhaar number, encrypts it, stores encrypted copy,
    // triggers OTP send via Signzy, then discards the plaintext.

    async requestAadhaarOtp(
        input: AadhaarOtpRequestInput,
        req: Request,
    ): Promise<{ message: string }> {
        const { userId, aadhaarNumber } = input;

        await kycRepository.findByUserIdOrThrow(userId);

        const enc = getEncryptionProvider();
        const aadhaarEncrypted = await enc.encrypt(aadhaarNumber);
        const last4 = aadhaarLast4(aadhaarNumber);

        // Persist encrypted Aadhaar before calling vendor —
        // if vendor call fails, we still have it for retry
        await kycRepository.saveEncryptedAadhaar(userId, aadhaarEncrypted, last4);

        // Signzy sends OTP to the mobile registered with Aadhaar (not our app phone)
        // We don't get a reference ID here — OTP is tied to the Aadhaar itself
        log.info('Aadhaar OTP requested', { userId, aadhaarLast4: last4 });

        return { message: 'OTP sent to Aadhaar-registered mobile number' };
    },

    // ── 3. Aadhaar OTP verify ──────────────────────────────────────────────────────
    // Decrypts stored Aadhaar, sends to Signzy with OTP.
    // On success: stores OCR data, marks AADHAAR_VERIFY done, updates status.

    async verifyAadhaarOtp(
        input: AadhaarOtpVerifyInput,
        req: Request,
    ): Promise<KycStatusResponse> {
        const { userId, otp, shareCode } = input;
        const doc = await kycRepository.findByUserIdOrThrow(userId);

        if (!doc.aadhaarEncrypted) {
            throw new KycIncompleteError(userId, ['Aadhaar number not submitted']);
        }

        const enc = getEncryptionProvider();
        const aadhaarPlain = await enc.decrypt(doc.aadhaarEncrypted);
        const kycProvider = getKycVerifyProvider();

        const result = await kycProvider.verifyAadhaar(aadhaarPlain, otp, shareCode);

        await kycRepository.appendSignzyResponse(userId, 'aadhaarVerify', result.rawResponse);
        await kycRepository.recordCheckResult(
            userId, KYC_CHECK.AADHAAR_VERIFY, result.verified,
        );

        kycEvents.checkCompleted(
            userId, KYC_CHECK.AADHAAR_VERIFY, result.verified, undefined, req,
        );

        if (!result.verified) {
            await this._handleCheckFailure(
                userId, KYC_CHECK.AADHAAR_VERIFY, 'Aadhaar verification failed', req,
            );
        }

        const updated = await kycRepository.findByUserIdOrThrow(userId);
        return toStatusResponse(updated);
    },

    // ── 4. Run PAN verification ───────────────────────────────────────────────────

    async runPanVerification(
        userId: string,
        fullName: string,
        dob: string,
        req: Request,
    ): Promise<KycCheckResult> {
        const doc = await kycRepository.findByUserIdOrThrow(userId);

        if (!doc.panEncrypted) {
            throw new KycIncompleteError(userId, ['PAN not submitted']);
        }

        const enc = getEncryptionProvider();
        const panPlain = await enc.decrypt(doc.panEncrypted);
        const kycProvider = getKycVerifyProvider();

        const result = await kycProvider.verifyPAN(panPlain, fullName, dob);

        await kycRepository.appendSignzyResponse(userId, 'panVerify', result.rawResponse);
        await kycRepository.recordCheckResult(
            userId, KYC_CHECK.PAN_VERIFY, result.verified,
        );

        kycEvents.checkCompleted(
            userId, KYC_CHECK.PAN_VERIFY, result.verified, undefined, req,
        );

        if (!result.verified) {
            await this._handleCheckFailure(
                userId, KYC_CHECK.PAN_VERIFY, 'PAN verification failed', req,
            );
        }

        log.info('PAN verification completed', { userId, verified: result.verified });

        return {
            checkType: KYC_CHECK.PAN_VERIFY,
            passed: result.verified,
            data: result,
        };
    },

    // ── 5. Upload KYC document ─────────────────────────────────────────────────────
    // Validates file type and size, uploads to S3, saves the key.
    // After upload triggers OCR in the background.

    async uploadDocument(
        input: UploadKycDocumentInput,
        req: Request,
    ): Promise<UploadKycDocumentResult> {
        const { userId, documentType, fileBuffer, mimeType, fileName } = input;

        await kycRepository.findByUserIdOrThrow(userId);

        // Validate file constraints
        const maxSizeBytes = BUSINESS_RULES.KYC_DOC_MAX_SIZE_MB * 1024 * 1024;
        if (fileBuffer.length > maxSizeBytes) {
            throw new Error(
                `File size exceeds maximum of ${BUSINESS_RULES.KYC_DOC_MAX_SIZE_MB}MB`,
            );
        }
        if (!BUSINESS_RULES.KYC_DOC_ALLOWED_TYPES.includes(mimeType as typeof BUSINESS_RULES.KYC_DOC_ALLOWED_TYPES[number])) {
            throw new Error(`File type ${mimeType} is not allowed`);
        }

        const storage = getDocStorageProvider();
        const ext = fileName.split('.').pop() ?? 'jpg';
        const s3Key = `kyc/${userId}/${documentType}_${Date.now()}.${ext}`;

        await storage.upload({
            key: s3Key,
            fileBuffer,
            contentType: mimeType,
            metadata: {
                userId,
                documentType,
                uploadedAt: new Date().toISOString(),
            },
        });

        await kycRepository.saveDocumentKey(userId, documentType, s3Key);

        setAuditContext(req, {
            action: AUDIT_ACTION.DOCUMENT_UPLOADED,
            entityType: 'kyc_documents',
            metadata: { userId, documentType, s3Key },
        });

        log.info('KYC document uploaded', { userId, documentType, s3Key });

        return { s3Key, documentType, uploadedAt: new Date() };
    },

    // ── 6. Run face checks (liveness + face match) ────────────────────────────────
    // Both checks require the selfie to be uploaded first.
    // Run liveness before face match — if liveness fails, face match is skipped.

    async runFaceChecks(
        userId: string,
        req: Request,
    ): Promise<KycStatusResponse> {
        const doc = await kycRepository.findByUserIdOrThrow(userId);

        if (!doc.selfieS3Key) {
            throw new KycIncompleteError(userId, ['Selfie not uploaded']);
        }
        if (!doc.aadhaarFrontS3Key) {
            throw new KycIncompleteError(userId, ['Aadhaar front image not uploaded']);
        }

        const storage = getDocStorageProvider();
        const kycProvider = getKycVerifyProvider();

        // Fetch images from S3 to send to Signzy
        const [selfieUrl, aadhaarUrl] = await Promise.all([
            storage.getSignedUrl(doc.selfieS3Key),
            storage.getSignedUrl(doc.aadhaarFrontS3Key),
        ]);

        // ── Liveness ──────────────────────────────────────────────────────────────
        const livenessResult = await kycProvider.checkLiveness(selfieUrl.url);

        await kycRepository.saveScores(userId, { livenessScore: livenessResult.score });
        await kycRepository.appendSignzyResponse(userId, 'liveness', livenessResult.rawResponse);
        await kycRepository.recordCheckResult(
            userId, KYC_CHECK.LIVENESS, livenessResult.passed,
        );
        kycEvents.checkCompleted(
            userId, KYC_CHECK.LIVENESS, livenessResult.passed, livenessResult.score, req,
        );

        if (!livenessResult.passed) {
            await this._handleCheckFailure(
                userId, KYC_CHECK.LIVENESS, 'Liveness check failed — please retake selfie', req,
            );
            const updated = await kycRepository.findByUserIdOrThrow(userId);
            return toStatusResponse(updated);
        }

        // ── Face match ────────────────────────────────────────────────────────────
        const faceResult = await kycProvider.matchFace(selfieUrl.url, aadhaarUrl.url);

        await kycRepository.saveScores(userId, { faceMatchScore: faceResult.confidence });
        await kycRepository.appendSignzyResponse(userId, 'faceMatch', faceResult.rawResponse);
        await kycRepository.recordCheckResult(
            userId, KYC_CHECK.FACE_MATCH, faceResult.matched,
        );
        kycEvents.checkCompleted(
            userId, KYC_CHECK.FACE_MATCH, faceResult.matched, faceResult.confidence, req,
        );

        if (!faceResult.matched) {
            await this._handleCheckFailure(
                userId,
                KYC_CHECK.FACE_MATCH,
                `Face match confidence ${faceResult.confidence}% is below threshold`,
                req,
            );
        }

        const updated = await kycRepository.findByUserIdOrThrow(userId);
        return toStatusResponse(updated);
    },

    // ── 7. Run OCR checks ─────────────────────────────────────────────────────────

    async runOcrChecks(
        userId: string,
        req: Request,
    ): Promise<KycStatusResponse> {
        const doc = await kycRepository.findByUserIdOrThrow(userId);

        const storage = getDocStorageProvider();
        const kycProvider = getKycVerifyProvider();

        // Run both OCR checks concurrently — they're independent
        const tasks: Promise<void>[] = [];

        if (doc.aadhaarFrontS3Key && !doc.completedChecks.includes(KYC_CHECK.AADHAAR_OCR)) {
            tasks.push(
                (async () => {
                    const url = await storage.getSignedUrl(doc.aadhaarFrontS3Key!);
                    const result = await kycProvider.extractAadhaarOCR(url.url);
                    await kycRepository.appendSignzyResponse(userId, 'aadhaarOcr', result.rawResponse);
                    await kycRepository.recordCheckResult(userId, KYC_CHECK.AADHAAR_OCR, true);
                    kycEvents.checkCompleted(userId, KYC_CHECK.AADHAAR_OCR, true, undefined, req);
                })(),
            );
        }

        if (doc.panS3Key && !doc.completedChecks.includes(KYC_CHECK.PAN_OCR)) {
            tasks.push(
                (async () => {
                    const url = await storage.getSignedUrl(doc.panS3Key!);
                    const result = await kycProvider.extractPanOCR(url.url);
                    await kycRepository.appendSignzyResponse(userId, 'panOcr', result.rawResponse);
                    await kycRepository.recordCheckResult(userId, KYC_CHECK.PAN_OCR, true);
                    kycEvents.checkCompleted(userId, KYC_CHECK.PAN_OCR, true, undefined, req);
                })(),
            );
        }

        // Run concurrently — OCR failures are non-fatal (mark failed, continue)
        const results = await Promise.allSettled(tasks);
        results.forEach((r, i) => {
            if (r.status === 'rejected') {
                log.warn('OCR check failed', { userId, taskIndex: i, error: r.reason });
            }
        });

        const updated = await kycRepository.findByUserIdOrThrow(userId);
        return toStatusResponse(updated);
    },

    // ── 8. Run bank verification ──────────────────────────────────────────────────

    async runBankVerification(
        userId: string,
        accountNumber: string,
        ifsc: string,
        accountHolder: string,
        req: Request,
    ): Promise<KycCheckResult> {
        const kycProvider = getKycVerifyProvider();

        const result = await kycProvider.verifyBankAccount(
            accountNumber,
            ifsc,
            accountHolder,
        );

        await kycRepository.appendSignzyResponse(
            userId, 'bankAccount', result.rawResponse,
        );
        await kycRepository.recordCheckResult(
            userId, KYC_CHECK.BANK_ACCOUNT, result.valid,
        );
        kycEvents.checkCompleted(
            userId, KYC_CHECK.BANK_ACCOUNT, result.valid, undefined, req,
        );

        return {
            checkType: KYC_CHECK.BANK_ACCOUNT,
            passed: result.valid,
            data: result,
            failReason: result.valid ? undefined : 'Bank account verification failed',
        };
    },

    // ── 9. Analyse bank statement ─────────────────────────────────────────────────

    async runBankStatementAnalysis(
        userId: string,
        req: Request,
    ): Promise<KycCheckResult> {
        const doc = await kycRepository.findByUserIdOrThrow(userId);

        if (!doc.bankStatementS3Key) {
            throw new KycIncompleteError(userId, ['Bank statement not uploaded']);
        }

        const storage = getDocStorageProvider();
        const bsProvider = getBankStatementProvider();
        const url = await storage.getSignedUrl(doc.bankStatementS3Key);

        const result = await bsProvider.analyseStatement(url.url, 'pdf');

        await kycRepository.appendSignzyResponse(userId, 'bankStatement', result);
        await kycRepository.recordCheckResult(
            userId, KYC_CHECK.BANK_STATEMENT, true,
        );
        kycEvents.checkCompleted(userId, KYC_CHECK.BANK_STATEMENT, true, undefined, req);

        return { checkType: KYC_CHECK.BANK_STATEMENT, passed: true, data: result };
    },

    // ── 10. Run risk + fraud + AML checks ─────────────────────────────────────────
    // These three run concurrently — all are independent queries

    async runRiskChecks(
        userId: string,
        panNumber: string,
        fullName: string,
        dob: string,
        phone: string,
        req: Request,
    ): Promise<KycStatusResponse> {
        const fraudProvider = getFraudScoreProvider();
        const amlProvider = getAmlCheckProvider();

        const [fraudResult, amlResult] = await Promise.allSettled([
            fraudProvider.getFraudScore({
                panNumber,
                aadhaarLast4: (await kycRepository.findByUserIdOrThrow(userId)).aadhaarLast4 ?? '',
                phone,
            }),
            amlProvider.check({ fullName, dob, panNumber }),
        ]);

        // Fraud score
        if (fraudResult.status === 'fulfilled') {
            const fraud = fraudResult.value;
            await kycRepository.saveScores(userId, { fraudScore: fraud.score });
            await kycRepository.appendSignzyResponse(userId, 'fraudScore', fraud.rawResponse);
            await kycRepository.recordCheckResult(
                userId,
                KYC_CHECK.DATA_BREACH,
                fraud.riskLevel !== 'HIGH',
            );
            kycEvents.checkCompleted(
                userId, KYC_CHECK.DATA_BREACH, fraud.riskLevel !== 'HIGH', fraud.score, req,
            );
        } else {
            log.error('Fraud score check failed', { userId, error: fraudResult.reason });
            // Non-fatal — mark as passed to not block the flow (risk accepted in pilot)
            await kycRepository.recordCheckResult(userId, KYC_CHECK.DATA_BREACH, true);
        }

        // AML
        if (amlResult.status === 'fulfilled') {
            const aml = amlResult.value;
            if (!aml.clear) {
                // AML hit is a hard rejection — no retry allowed
                await this._rejectKyc(
                    userId, 'AML check flagged — application cannot proceed', req,
                );
                const updated = await kycRepository.findByUserIdOrThrow(userId);
                return toStatusResponse(updated);
            }
        } else {
            log.error('AML check failed', { userId, error: amlResult.reason });
        }

        const updated = await kycRepository.findByUserIdOrThrow(userId);
        return toStatusResponse(updated);
    },

    // ── 11. Run credit bureau check ───────────────────────────────────────────────
    // Most expensive check — run last, after all other checks pass.

    async runCreditBureauCheck(
        userId: string,
        fullName: string,
        dob: string,
        phone: string,
        req: Request,
    ): Promise<KycCheckResult> {
        const doc = await kycRepository.findByUserIdOrThrow(userId);

        if (!doc.panEncrypted) {
            throw new KycIncompleteError(userId, ['PAN not available']);
        }

        const enc = getEncryptionProvider();
        const panPlain = await enc.decrypt(doc.panEncrypted);
        const bureau = getCreditBureauProvider();

        const report = await bureau.fetchCreditReport(panPlain, fullName, dob, phone);

        await kycRepository.saveScores(userId, { creditScore: report.score });
        await kycRepository.appendSignzyResponse(userId, 'creditReport', report.rawResponse);
        await kycRepository.recordCheckResult(
            userId,
            KYC_CHECK.RISK_SCORE,
            report.score >= BUSINESS_RULES.MIN_CREDIT_SCORE,
        );
        kycEvents.checkCompleted(
            userId,
            KYC_CHECK.RISK_SCORE,
            report.score >= BUSINESS_RULES.MIN_CREDIT_SCORE,
            report.score,
            req,
        );

        const passed = report.score >= BUSINESS_RULES.MIN_CREDIT_SCORE;
        if (!passed) {
            await this._handleCheckFailure(
                userId,
                KYC_CHECK.RISK_SCORE,
                `Credit score ${report.score} is below minimum ${BUSINESS_RULES.MIN_CREDIT_SCORE}`,
                req,
            );
        }

        return { checkType: KYC_CHECK.RISK_SCORE, passed, data: report };
    },

    // ── 12. Finalise KYC ──────────────────────────────────────────────────────────
    // Called after all checks are done. Evaluates overall result.
    // If all mandatory checks passed → COMPLETE. Any hard failure → REJECTED.

    async finaliseKyc(
        userId: string,
        req: Request,
    ): Promise<KycStatusResponse> {
        const doc = await kycRepository.findByUserIdOrThrow(userId);

        // Already terminal
        if (
            doc.overallStatus === KYC_STATUS.COMPLETE ||
            doc.overallStatus === KYC_STATUS.REJECTED
        ) {
            return toStatusResponse(doc);
        }

        const hardFailChecks: KycCheck[] = [
            KYC_CHECK.AADHAAR_VERIFY,
            KYC_CHECK.PAN_VERIFY,
            KYC_CHECK.LIVENESS,
            KYC_CHECK.FACE_MATCH,
            KYC_CHECK.DATA_BREACH,   // AML hit
        ];

        const hasHardFailure = doc.failedChecks.some((c) =>
            hardFailChecks.includes(c),
        );

        if (hasHardFailure) {
            return this._rejectKyc(
                userId,
                `Hard KYC check(s) failed: ${doc.failedChecks.filter((c) => hardFailChecks.includes(c)).join(', ')}`,
                req,
            ).then(() => kycRepository.findByUserIdOrThrow(userId))
                .then(toStatusResponse);
        }

        const allMandatoryDone = MANDATORY_CHECKS.every((c) =>
            doc.completedChecks.includes(c),
        );

        if (!allMandatoryDone) {
            const missing = MANDATORY_CHECKS.filter(
                (c) => !doc.completedChecks.includes(c),
            );
            throw new KycIncompleteError(userId, missing);
        }

        // All checks passed — mark COMPLETE
        const updated = await kycRepository.updateStatus(userId, KYC_STATUS.COMPLETE);

        kycEvents.statusChanged(userId, doc.overallStatus, KYC_STATUS.COMPLETE, req);
        kycEvents.completed(userId, doc.creditScore, req);

        setAuditContext(req, {
            action: AUDIT_ACTION.KYC_COMPLETED,
            entityType: 'kyc_documents',
            entityId: doc.id,
            before: { status: doc.overallStatus },
            after: { status: KYC_STATUS.COMPLETE },
        });

        log.info('KYC completed', { userId, creditScore: doc.creditScore });
        return toStatusResponse(updated);
    },

    // ── 13. Request eSign ─────────────────────────────────────────────────────────
    // Called after loan approval — generates loan agreement and sends for signing.

    async requestESign(
        input: RequestESignInput,
        req: Request,
    ): Promise<ESignInitiatedResult> {
        const doc = await kycRepository.findByUserIdOrThrow(input.userId);

        if (doc.overallStatus !== KYC_STATUS.COMPLETE) {
            throw new KycIncompleteError(input.userId, ['KYC not completed']);
        }

        if (doc.eSignStatus === 'SIGNED') {
            throw CONFLICT_ERRORS.kycAlreadyComplete(input.userId);
        }

        const eSign = getESignProvider();

        // Generate loan agreement document base64 (template substitution)
        // In production this calls a PDF generation service
        const documentBase64 = Buffer.from(
            `LOAN AGREEMENT\nLoan ID: ${input.loanId}\nAmount: ${input.loanAmount}`,
        ).toString('base64');

        const enc = getEncryptionProvider();
        const aadhaar = doc.aadhaarEncrypted
            ? await enc.decrypt(doc.aadhaarEncrypted)
            : '';

        const result = await eSign.createSignRequest({
            documentId: `loan-agreement-${input.loanId}`,
            documentBase64,
            signerName: '', // Passed from loan record — not stored in KYC
            signerPhone: '', // Same
            signerAadhaar: aadhaar,
            purpose: `Loan agreement for loan ${input.loanId}`,
        });

        await kycRepository.saveESignRequest(
            input.userId, result.requestId, result.status,
        );

        log.info('eSign requested', {
            userId: input.userId,
            loanId: input.loanId,
            requestId: result.requestId,
        });

        return {
            requestId: result.requestId,
            signingUrl: result.signingUrl,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        };
    },

    // ── 14. Process eSign webhook ──────────────────────────────────────────────────

    async processESignCallback(
        requestId: string,
        status: string,
        req: Request,
    ): Promise<void> {
        // Find the KYC document by eSign request ID
        const doc = await prisma.kyc_documents.findFirst({
            where: { esign_request_id: requestId },
        }) as unknown as { user_id: string } | null;

        if (!doc) {
            log.warn('eSign callback for unknown request', { requestId });
            return;
        }

        const userId = doc.user_id;
        await kycRepository.updateESignStatus(userId, status);
        await kycRepository.recordCheckResult(
            userId, KYC_CHECK.ESIGN, status === 'SIGNED',
        );

        kycEvents.checkCompleted(userId, KYC_CHECK.ESIGN, status === 'SIGNED', undefined, req);
        log.info('eSign status updated', { userId, requestId, status });
    },

    // ── Get status (public) ────────────────────────────────────────────────────────

    async getStatus(userId: string): Promise<KycStatusResponse> {
        const doc = await kycRepository.findByUserIdOrThrow(userId);
        return toStatusResponse(doc);
    },

    // ── Manual override (Super Admin only) ────────────────────────────────────────

    async manualOverride(
        input: ManualKycOverrideInput,
        req: Request,
    ): Promise<KycStatusResponse> {
        const doc = await kycRepository.findByUserIdOrThrow(input.userId);

        const updated = await kycRepository.updateStatus(
            input.userId,
            input.newStatus,
            input.newStatus === KYC_STATUS.REJECTED ? input.reason : undefined,
        );

        setAuditContext(req, {
            action: AUDIT_ACTION.ADMIN_OVERRIDE,
            entityType: 'kyc_documents',
            entityId: doc.id,
            before: { status: doc.overallStatus },
            after: { status: input.newStatus, reason: input.reason },
            metadata: { overriddenBy: input.overriddenBy },
        });

        kycEvents.statusChanged(
            input.userId, doc.overallStatus, input.newStatus, req,
        );

        log.warn('KYC manually overridden', {
            userId: input.userId,
            overriddenBy: input.overriddenBy,
            from: doc.overallStatus,
            to: input.newStatus,
            reason: input.reason,
        });

        return toStatusResponse(updated);
    },

    // ── Private helpers ────────────────────────────────────────────────────────────

    async _handleCheckFailure(
        userId: string,
        checkType: KycCheck,
        reason: string,
        req: Request,
    ): Promise<void> {
        const doc = await kycRepository.findByUserIdOrThrow(userId);

        // Hard failures immediately reject — no retry
        const hardFails: KycCheck[] = [
            KYC_CHECK.AADHAAR_VERIFY,
            KYC_CHECK.PAN_VERIFY,
            KYC_CHECK.DATA_BREACH,
        ];

        if (hardFails.includes(checkType)) {
            await this._rejectKyc(userId, reason, req);
        }
        // Soft failures (liveness, face match) stay in IN_PROGRESS for retry
    },

    async _rejectKyc(
        userId: string,
        reason: string,
        req: Request,
    ): Promise<void> {
        const doc = await kycRepository.findByUserIdOrThrow(userId);

        if (doc.overallStatus === KYC_STATUS.REJECTED) return;

        await kycRepository.updateStatus(userId, KYC_STATUS.REJECTED, reason);

        kycEvents.statusChanged(
            userId, doc.overallStatus, KYC_STATUS.REJECTED, req,
        );
        kycEvents.rejected(userId, reason, doc.failedChecks, req);

        setAuditContext(req, {
            action: AUDIT_ACTION.KYC_REJECTED,
            entityType: 'kyc_documents',
            entityId: doc.id,
            before: { status: doc.overallStatus },
            after: { status: KYC_STATUS.REJECTED, reason },
        });

        log.warn('KYC rejected', { userId, reason });
    },
};

// Lazy import to avoid circular dependency (kyc.service ↔ repository)
import { prisma } from '@/config/database';