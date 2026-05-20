// src/modules/kyc/kyc.routes.ts
import { Router } from 'express';
import multer from 'multer';
import { kycController } from './kyc.controller';
import {
    requireAuth,
    allowRoles,
    validateBody,
    validateParams,
    kycLimiter,
} from '@/middlewares';
import {
    initiateKycSchema,
    aadhaarOtpRequestSchema,
    aadhaarOtpVerifySchema,
    uploadDocumentSchema,
    requestESignSchema,
    manualOverrideSchema,
    userIdParamSchema,
} from './kyc.dto';
import { ROLE, BUSINESS_RULES } from '@/config/constants';

const router = Router();

// multer — memory storage so we can pass Buffer to S3 upload
// Disk storage is never used — files never touch the filesystem on App Runner
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: BUSINESS_RULES.KYC_DOC_MAX_SIZE_MB * 1024 * 1024,
        files: 1,
    },
    fileFilter(_req, file, cb) {
        if (BUSINESS_RULES.KYC_DOC_ALLOWED_TYPES.includes(
            file.mimetype as typeof BUSINESS_RULES.KYC_DOC_ALLOWED_TYPES[number],
        )) {
            cb(null, true);
        } else {
            cb(new Error(`File type ${file.mimetype} not allowed`));
        }
    },
});

// ─── Customer routes ──────────────────────────────────────────────────────────

// Initiate KYC for the authenticated customer
router.post(
    '/initiate',
    requireAuth(),
    allowRoles(ROLE.CUSTOMER),
    kycLimiter,
    validateBody(initiateKycSchema),
    kycController.initiate,
);

// Get own KYC status
router.get(
    '/status',
    requireAuth(),
    allowRoles(ROLE.CUSTOMER),
    kycController.getStatus,
);

// Aadhaar OTP flow
router.post(
    '/aadhaar/otp-request',
    requireAuth(),
    allowRoles(ROLE.CUSTOMER),
    kycLimiter,
    validateBody(aadhaarOtpRequestSchema),
    kycController.requestAadhaarOtp,
);

router.post(
    '/aadhaar/otp-verify',
    requireAuth(),
    allowRoles(ROLE.CUSTOMER),
    kycLimiter,
    validateBody(aadhaarOtpVerifySchema),
    kycController.verifyAadhaarOtp,
);

// Document upload (multipart)
router.post(
    '/documents/upload',
    requireAuth(),
    allowRoles(ROLE.CUSTOMER),
    upload.single('file'),
    validateBody(uploadDocumentSchema),
    kycController.uploadDocument,
);

// Face checks (liveness + face match)
router.post(
    '/face-checks',
    requireAuth(),
    allowRoles(ROLE.CUSTOMER),
    kycLimiter,
    kycController.runFaceChecks,
);

// Finalise (customer confirms all docs submitted)
router.post(
    '/finalise',
    requireAuth(),
    allowRoles(ROLE.CUSTOMER),
    kycController.finalise,
);

// eSign request
router.post(
    '/esign/request',
    requireAuth(),
    allowRoles(ROLE.CUSTOMER),
    validateBody(requestESignSchema),
    kycController.requestESign,
);

// ─── Frontend alias routes ────────────────────────────────────────────────────
// The frontend calls these paths — aliased to canonical backend handlers.

// POST /kyc/verify-pan → alias for POST /kyc/pan/verify
// Frontend realKYCService calls POST /kyc/verify-pan with { pan }
// TODO: add kycController.verifyPan handler that calls
//       kycService.runPanVerification(userId, pan) and returns the result.
//       For now aliased to initiate which includes PAN verification.
router.post(
    '/verify-pan',
    requireAuth(),
    allowRoles(ROLE.CUSTOMER),
    kycLimiter,
    validateBody(initiateKycSchema),
    kycController.initiate, // TODO: replace with kycController.verifyPan
);

// POST /kyc/pan/verify → canonical path (matches API docs)
router.post(
    '/pan/verify',
    requireAuth(),
    allowRoles(ROLE.CUSTOMER),
    kycLimiter,
    validateBody(initiateKycSchema),
    kycController.initiate, // TODO: replace with kycController.verifyPan
);

// POST /kyc/complete → called by frontend submitKYCCompletion()
// Maps to finalise — customer signals all KYC steps are done
router.post(
    '/complete',
    requireAuth(),
    allowRoles(ROLE.CUSTOMER),
    kycController.finalise,
);

// ─── Staff routes ─────────────────────────────────────────────────────────────

// View any user's KYC status
router.get(
    '/:userId/status',
    requireAuth(),
    allowRoles(
        ROLE.OPS_EXECUTIVE,
        ROLE.CREDIT_MANAGER,
        ROLE.SUPER_ADMIN,
    ),
    validateParams(userIdParamSchema),
    kycController.getStatusByUserId,
);

// Manual override (Super Admin only)
router.post(
    '/:userId/override',
    requireAuth(),
    allowRoles(ROLE.SUPER_ADMIN),
    validateParams(userIdParamSchema),
    validateBody(manualOverrideSchema),
    kycController.manualOverride,
);

export { router as kycRouter };