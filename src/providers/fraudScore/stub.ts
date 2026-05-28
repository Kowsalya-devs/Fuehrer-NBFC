// src/providers/fraudScore/stub.ts
//
// Stub fraud score provider — development and test only.
//
// Behaviour:
//   - Returns score: 10, riskLevel: 'LOW' by default — application proceeds.
//   - To simulate a HIGH risk score in tests, prefix panNumber with 'HIGHRISK':
//       e.g. panNumber: 'HIGHRISKABCD1' → score: 75, riskLevel: 'HIGH' → auto reject
//   - To simulate a MEDIUM risk score, prefix panNumber with 'MEDRISK':
//       e.g. panNumber: 'MEDRISKABCD1' → score: 50, riskLevel: 'MEDIUM' → manual review

import { createModuleLogger } from '@/config/logger';
import type {
    IFraudScoreProvider,
    FraudScoreInput,
    FraudScoreResult,
} from './interface';

const log = createModuleLogger('fraudScore:stub');

export class StubFraudScoreProvider implements IFraudScoreProvider {

    async getFraudScore(input: FraudScoreInput): Promise<FraudScoreResult> {
        const pan = input.panNumber.toUpperCase();

        // ── HIGH risk simulation ───────────────────────────────────────────────
        if (pan.startsWith('HIGHRISK')) {
            log.warn('StubFraudScoreProvider: simulating HIGH risk score', {
                panNumber: input.panNumber,
            });
            return {
                score: 75,
                riskLevel: 'HIGH',
                signals: [
                    {
                        type: 'VELOCITY_FRAUD',
                        description: 'Stub: multiple loan applications in short period',
                        severity: 'HIGH',
                    },
                    {
                        type: 'DEVICE_RISK',
                        description: 'Stub: device associated with previous fraud cases',
                        severity: 'HIGH',
                    },
                ],
                rawResponse: { stub: true, scenario: 'high_risk' },
            };
        }

        // ── MEDIUM risk simulation ─────────────────────────────────────────────
        if (pan.startsWith('MEDRISK')) {
            log.warn('StubFraudScoreProvider: simulating MEDIUM risk score', {
                panNumber: input.panNumber,
            });
            return {
                score: 50,
                riskLevel: 'MEDIUM',
                signals: [
                    {
                        type: 'IDENTITY_MISMATCH',
                        description: 'Stub: minor name mismatch across documents',
                        severity: 'MEDIUM',
                    },
                ],
                rawResponse: { stub: true, scenario: 'medium_risk' },
            };
        }

        // ── Default: LOW risk ──────────────────────────────────────────────────
        log.info('StubFraudScoreProvider: returning LOW risk score', {
            panNumber: input.panNumber.slice(-4),
        });

        return {
            score: 10,
            riskLevel: 'LOW',
            signals: [],
            rawResponse: { stub: true, scenario: 'low_risk' },
        };
    }
}
