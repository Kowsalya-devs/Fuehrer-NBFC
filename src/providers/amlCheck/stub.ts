// src/providers/amlCheck/stub.ts
//
// Stub AML check provider — development and test only.
//
// Behaviour:
//   - Always returns clear: true (no hits) by default.
//   - To simulate an AML hit in tests, prefix fullName with 'SANCTIONED ':
//       e.g. fullName: 'SANCTIONED John Doe' → clear: false, one hit returned
//   - To simulate a PEP hit, prefix fullName with 'PEP ':
//       e.g. fullName: 'PEP Politician Name' → isPep: true, clear: false
//   - To simulate a defaulter hit, prefix fullName with 'DEFAULTER ':
//       e.g. fullName: 'DEFAULTER Bad Borrower' → isDefaulter: true, clear: false

import { createModuleLogger } from '@/config/logger';
import type {
    IAmlCheckProvider,
    AmlCheckInput,
    AmlCheckResult,
} from './interface';

const log = createModuleLogger('amlCheck:stub');

export class StubAmlCheckProvider implements IAmlCheckProvider {

    async check(input: AmlCheckInput): Promise<AmlCheckResult> {
        const name = input.fullName.toUpperCase();

        // ── Sanctions hit simulation ───────────────────────────────────────────
        if (name.startsWith('SANCTIONED ')) {
            log.warn('StubAmlCheckProvider: simulating sanctions hit', {
                fullName: input.fullName,
            });
            return {
                clear: false,
                hits: [
                    {
                        listName: 'UN Consolidated Sanctions List',
                        matchScore: 95,
                        category: 'SANCTIONS',
                        description: 'Stub: name match on UN sanctions list',
                    },
                ],
                isPep: false,
                isDefaulter: false,
                rawResponse: { stub: true, scenario: 'sanctions_hit' },
            };
        }

        // ── PEP hit simulation ─────────────────────────────────────────────────
        if (name.startsWith('PEP ')) {
            log.warn('StubAmlCheckProvider: simulating PEP hit', {
                fullName: input.fullName,
            });
            return {
                clear: false,
                hits: [
                    {
                        listName: 'PEP Database',
                        matchScore: 88,
                        category: 'PEP',
                        description: 'Stub: applicant identified as politically exposed person',
                    },
                ],
                isPep: true,
                isDefaulter: false,
                rawResponse: { stub: true, scenario: 'pep_hit' },
            };
        }

        // ── Defaulter hit simulation ───────────────────────────────────────────
        if (name.startsWith('DEFAULTER ')) {
            log.warn('StubAmlCheckProvider: simulating defaulter hit', {
                fullName: input.fullName,
            });
            return {
                clear: false,
                hits: [
                    {
                        listName: 'RBI Wilful Defaulters List',
                        matchScore: 92,
                        category: 'DEFAULTER',
                        description: 'Stub: applicant found on RBI wilful defaulters list',
                    },
                ],
                isPep: false,
                isDefaulter: true,
                rawResponse: { stub: true, scenario: 'defaulter_hit' },
            };
        }

        // ── Default: all clear ─────────────────────────────────────────────────
        log.info('StubAmlCheckProvider: AML check clear', {
            panNumber: input.panNumber,
        });

        return {
            clear: true,
            hits: [],
            isPep: false,
            isDefaulter: false,
            rawResponse: { stub: true, scenario: 'clear' },
        };
    }
}
