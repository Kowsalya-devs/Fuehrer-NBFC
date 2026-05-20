// src/providers/gstVerify/stub.ts
//
// Stub GST verification provider — development and test only.
//
// Behaviour:
//   - Returns valid: true, status: ACTIVE by default.
//   - To simulate a cancelled GST in tests, prefix gstin with 'CANCEL':
//       e.g. gstin: 'CANCEL123456789AB' → valid: false, CANCELLED
//   - To simulate a suspended GST, prefix gstin with 'SUSPEND':
//       e.g. gstin: 'SUSPEND123456789A' → valid: false, SUSPENDED
//   - parseGstCertificate always returns extracted data from the stub
//     regardless of the document content.

import { createModuleLogger } from '@/config/logger';
import type {
    IGstVerifyProvider,
    GstVerifyInput,
    GstVerifyResult,
    GstCertificateParseInput,
    GstCertificateParseResult,
} from './interface';

const log = createModuleLogger('gstVerify:stub');

export class StubGstVerifyProvider implements IGstVerifyProvider {

    async authenticate(input: GstVerifyInput): Promise<GstVerifyResult> {
        const gstin = input.gstin.toUpperCase();

        // ── Cancelled GST simulation ───────────────────────────────────────────
        if (gstin.startsWith('CANCEL')) {
            log.warn('StubGstVerifyProvider: simulating cancelled GST', {
                gstin: input.gstin,
            });
            return {
                valid: false,
                registrationStatus: 'CANCELLED',
                legalName: null,
                tradeName: null,
                businessType: null,
                stateCode: gstin.slice(0, 2),
                registrationDate: null,
                nameMatchScore: null,
                rawResponse: { stub: true, scenario: 'cancelled' },
            };
        }

        // ── Suspended GST simulation ───────────────────────────────────────────
        if (gstin.startsWith('SUSPEND')) {
            log.warn('StubGstVerifyProvider: simulating suspended GST', {
                gstin: input.gstin,
            });
            return {
                valid: false,
                registrationStatus: 'SUSPENDED',
                legalName: null,
                tradeName: null,
                businessType: null,
                stateCode: gstin.slice(0, 2),
                registrationDate: null,
                nameMatchScore: null,
                rawResponse: { stub: true, scenario: 'suspended' },
            };
        }

        // ── Default: valid and active ──────────────────────────────────────────
        log.info('StubGstVerifyProvider: GST verified', {
            gstin: input.gstin,
            businessName: input.businessName,
        });

        return {
            valid: true,
            registrationStatus: 'ACTIVE',
            legalName: input.businessName.toUpperCase(),
            tradeName: input.businessName.toUpperCase(),
            businessType: 'Proprietorship',
            stateCode: gstin.slice(0, 2),
            registrationDate: '2020-04-01',
            nameMatchScore: 92,
            rawResponse: { stub: true, scenario: 'active' },
        };
    }

    async parseGstCertificate(
        input: GstCertificateParseInput,
    ): Promise<GstCertificateParseResult> {
        log.info('StubGstVerifyProvider: parsing GST certificate', {
            contentType: input.contentType,
        });

        // Return realistic stub data regardless of document content
        return {
            gstin: '29ABCDE1234F1Z5',
            legalName: 'STUB BUSINESS PRIVATE LIMITED',
            tradeName: 'STUB BUSINESS',
            registrationDate: '2020-04-01',
            address: '123 Stub Street, Chennai, Tamil Nadu - 600001',
            rawResponse: { stub: true, scenario: 'gst_certificate_parsed' },
        };
    }
}