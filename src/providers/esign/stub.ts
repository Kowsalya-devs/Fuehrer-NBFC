// src/providers/esign/stub.ts
//
// Stub eSign + eStamp provider — development and test only.
//
// Behaviour:
//   - createSignRequest  → returns a fake requestId and a localhost signing URL.
//   - getSignStatus      → returns PENDING on first call, SIGNED on subsequent
//                          calls for the same requestId (simulates customer signing).
//   - applyEStamp        → always returns APPLIED immediately.
//   - getSignedDocument  → returns a minimal base64-encoded PDF placeholder.
//
// The auto-sign behaviour (PENDING → SIGNED on second poll) means the full
// KYC + disbursement flow can be exercised in dev without any manual step.
//
// To simulate a failure in tests, set the requestId prefix to 'fail_':
//   e.g. documentId: 'fail_loan-agreement-test'
//   → createSignRequest will throw KYC_VENDOR_ERRORS.eSignFailed

import { randomUUID } from 'crypto';
import { KYC_VENDOR_ERRORS } from '@/errors';
import { createModuleLogger } from '@/config/logger';
import type {
    IESignProvider,
    CreateSignRequestInput,
    CreateSignRequestResult,
    ESignStatusResult,
    ApplyEStampInput,
    ApplyEStampResult,
    GetSignedDocumentResult,
} from './interface';

const log = createModuleLogger('esign:stub');

// Tracks call counts per requestId so we can auto-advance PENDING → SIGNED
const callCounts = new Map<string, number>();

// Minimal valid PDF (1-page blank) as base64 — enough to pass Buffer checks
const STUB_PDF_BASE64 =
    'JVBERi0xLjQKMSAwIG9iago8PAovVHlwZSAvQ2F0YWxvZwovUGFnZXMgMiAwIFIKPj4KZW5kb2Jq' +
    'CjIgMCBvYmoKPDwKL1R5cGUgL1BhZ2VzCi9LaWRzIFszIDAgUl0KL0NvdW50IDEKPJ4KZW5kb2Jq' +
    'CjMgMCBvYmoKPDwKL1R5cGUgL1BhZ2UKL1BhcmVudCAyIDAgUgovTWVkaWFCb3ggWzAgMCA2MTIg' +
    'NzkyXQo+PgplbmRvYmoKeHJlZgowIDQKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDA5IDAw' +
    'MDAwIG4gCjAwMDAwMDAwNTggMDAwMDAgbiAKMDAwMDAwMDExNSAwMDAwMCBuIAp0cmFpbGVyCjw8' +
    'Ci9TaXplIDQKL1Jvb3QgMSAwIFIKPj4Kc3RhcnR4cmVmCjE5MAolJUVPRgo=';

export class StubESignProvider implements IESignProvider {

    async createSignRequest(
        input: CreateSignRequestInput,
    ): Promise<CreateSignRequestResult> {
        // Failure simulation — prefix documentId with 'fail_' in tests
        if (input.documentId.startsWith('fail_')) {
            log.warn('StubESignProvider: simulating createSignRequest failure', {
                documentId: input.documentId,
            });
            throw KYC_VENDOR_ERRORS.eSignFailed(
                new Error('Stub: forced failure via fail_ documentId prefix'),
            );
        }

        const requestId = `stub_esign_${randomUUID()}`;

        // Initialise call counter for this request
        callCounts.set(requestId, 0);

        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

        log.info('StubESignProvider: sign request created', {
            documentId: input.documentId,
            requestId,
        });

        return {
            requestId,
            signingUrl: `http://localhost:3000/stub/esign/sign/${requestId}`,
            status: 'PENDING',
            expiresAt,
        };
    }

    async getSignStatus(requestId: string): Promise<ESignStatusResult> {
        // Unknown requestId — simulate expired / not found
        if (!callCounts.has(requestId)) {
            log.warn('StubESignProvider: unknown requestId', { requestId });
            return {
                requestId,
                status: 'EXPIRED',
                signedAt: null,
                signedDocumentBase64: null,
                rawResponse: { stub: true, reason: 'unknown requestId' },
            };
        }

        const count = (callCounts.get(requestId) ?? 0) + 1;
        callCounts.set(requestId, count);

        // First poll → PENDING (customer hasn't signed yet)
        // Second poll onward → SIGNED (simulates customer completing signing)
        const status = count >= 2 ? 'SIGNED' : 'PENDING';
        const signedAt = status === 'SIGNED' ? new Date() : null;

        log.info('StubESignProvider: sign status', {
            requestId,
            pollCount: count,
            status,
        });

        return {
            requestId,
            status,
            signedAt,
            signedDocumentBase64: status === 'SIGNED' ? STUB_PDF_BASE64 : null,
            rawResponse: { stub: true, pollCount: count },
        };
    }

    async applyEStamp(input: ApplyEStampInput): Promise<ApplyEStampResult> {
        // Stub always applies immediately — no async delay needed in tests
        const stampDutyRupees = Math.ceil(input.loanAmountRupees * 0.001); // 0.1% of loan

        log.info('StubESignProvider: eStamp applied', {
            requestId: input.requestId,
            stateCode: input.stateCode,
            stampDutyRupees,
        });

        return {
            stampId: `stub_stamp_${randomUUID()}`,
            status: 'APPLIED',
            stampDutyRupees,
            stampedDocumentBase64: STUB_PDF_BASE64,
            rawResponse: { stub: true },
        };
    }

    async getSignedDocument(requestId: string): Promise<GetSignedDocumentResult> {
        if (!callCounts.has(requestId)) {
            log.warn('StubESignProvider: getSignedDocument for unknown requestId', {
                requestId,
            });
            throw KYC_VENDOR_ERRORS.eSignFailed(
                new Error(`Stub: no signed document found for requestId ${requestId}`),
            );
        }

        log.info('StubESignProvider: signed document retrieved', { requestId });

        return {
            documentBase64: STUB_PDF_BASE64,
            s3Key: null, // Caller sets this after uploading to S3
        };
    }
}

// ─── Test helper — reset state between tests ──────────────────────────────────
// Call this in afterEach() to clear the in-memory call counter map.
export function _resetStubESignState(): void {
    callCounts.clear();
}