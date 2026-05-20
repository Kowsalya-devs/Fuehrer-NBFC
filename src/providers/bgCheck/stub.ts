// src/providers/bgCheck/stub.ts
//
// Stub background check provider — development and test only.
//
// Behaviour:
//   - Returns status: CLEAR with no records by default.
//   - To simulate a flagged check, prefix fullName with 'FLAGGED ':
//       e.g. fullName: 'FLAGGED John Doe' → status: FLAGGED, one record
//   - To simulate a pending async check, prefix fullName with 'PENDING ':
//       e.g. fullName: 'PENDING John Doe' → status: PENDING
//   - getStatus() always returns CLEAR — simulates async completion.

import { randomUUID } from 'crypto';
import { createModuleLogger } from '@/config/logger';
import type {
    IBgCheckProvider,
    BgCheckInput,
    BgCheckResult,
} from './interface';

const log = createModuleLogger('bgCheck:stub');

export class StubBgCheckProvider implements IBgCheckProvider {

    async check(input: BgCheckInput): Promise<BgCheckResult> {
        const name = input.fullName.toUpperCase();

        // ── Flagged simulation ─────────────────────────────────────────────────
        if (name.startsWith('FLAGGED ')) {
            log.warn('StubBgCheckProvider: simulating flagged background check', {
                fullName: input.fullName,
            });
            return {
                status: 'FLAGGED',
                records: [
                    {
                        recordType: 'COURT_CASE',
                        description: 'Stub: civil dispute case on record',
                        year: 2021,
                        authority: 'Chennai City Civil Court',
                        caseStatus: 'PENDING',
                    },
                ],
                referenceId: `stub_bg_${randomUUID()}`,
                rawResponse: { stub: true, scenario: 'flagged' },
            };
        }

        // ── Pending simulation ─────────────────────────────────────────────────
        if (name.startsWith('PENDING ')) {
            log.info('StubBgCheckProvider: simulating pending background check', {
                fullName: input.fullName,
            });
            return {
                status: 'PENDING',
                records: [],
                referenceId: `stub_bg_pending_${randomUUID()}`,
                rawResponse: { stub: true, scenario: 'pending' },
            };
        }

        // ── Default: clear ─────────────────────────────────────────────────────
        log.info('StubBgCheckProvider: background check clear', {
            panNumber: input.panNumber.slice(-4),
        });

        return {
            status: 'CLEAR',
            records: [],
            referenceId: `stub_bg_${randomUUID()}`,
            rawResponse: { stub: true, scenario: 'clear' },
        };
    }

    async getStatus(referenceId: string): Promise<BgCheckResult> {
        // Stub always resolves async checks as CLEAR
        log.info('StubBgCheckProvider: getStatus returning CLEAR', {
            referenceId,
        });

        return {
            status: 'CLEAR',
            records: [],
            referenceId,
            rawResponse: { stub: true, scenario: 'async_complete' },
        };
    }
}