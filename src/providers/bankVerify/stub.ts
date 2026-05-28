// src/providers/bankVerify/stub.ts
//
// Stub bank verification provider — development and test only.
//
// Behaviour:
//   - Returns valid: true with a dummy name match by default.
//   - To simulate an invalid account, prefix accountNumber with 'INVALID':
//       e.g. accountNumber: 'INVALID123456' → valid: false
//   - To simulate a name mismatch, prefix accountNumber with 'MISMATCH':
//       e.g. accountNumber: 'MISMATCH123456' → valid: true, nameMatchScore: 30
//   - All three methods behave consistently with the same prefix rules.

import { randomUUID } from 'crypto';
import { createModuleLogger } from '@/config/logger';
import type {
    IBankVerifyProvider,
    PennyDropInput,
    PennyDropResult,
    SilentVerifyInput,
    BankVerifyResult,
} from './interface';

const log = createModuleLogger('bankVerify:stub');

// ─── Shared result builder ────────────────────────────────────────────────────

function buildResult(
    accountNumber: string,
    accountHolder: string,
    scenario: string,
): BankVerifyResult {
    const acc = accountNumber.toUpperCase();

    // Invalid account simulation
    if (acc.startsWith('INVALID')) {
        log.warn('StubBankVerifyProvider: simulating invalid account', {
            accountNumber: accountNumber.slice(-4),
        });
        return {
            valid: false,
            nameAtBank: null,
            nameMatchScore: null,
            ifscConfirmed: null,
            bankName: null,
            branchName: null,
            rawResponse: { stub: true, scenario: 'invalid_account' },
        };
    }

    // Name mismatch simulation
    if (acc.startsWith('MISMATCH')) {
        log.warn('StubBankVerifyProvider: simulating name mismatch', {
            accountNumber: accountNumber.slice(-4),
        });
        return {
            valid: true,
            nameAtBank: 'DIFFERENT NAME AT BANK',
            nameMatchScore: 30,
            ifscConfirmed: 'HDFC0001234',
            bankName: 'HDFC Bank',
            branchName: 'Stub Branch',
            rawResponse: { stub: true, scenario: 'name_mismatch' },
        };
    }

    // Default: valid account
    log.info('StubBankVerifyProvider: returning valid account', {
        accountNumber: accountNumber.slice(-4),
        scenario,
    });

    return {
        valid: true,
        nameAtBank: accountHolder.toUpperCase(),
        nameMatchScore: 95,
        ifscConfirmed: 'HDFC0001234',
        bankName: 'HDFC Bank',
        branchName: 'Stub Branch',
        rawResponse: { stub: true, scenario },
    };
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export class StubBankVerifyProvider implements IBankVerifyProvider {

    async verifyWithPennyDrop(input: PennyDropInput): Promise<PennyDropResult> {
        const base = buildResult(
            input.accountNumber,
            input.accountHolder,
            'penny_drop',
        );

        return {
            ...base,
            transactionId: base.valid ? `stub_txn_${randomUUID()}` : null,
            amountPaise: 100, // ₹1
        };
    }

    async verifyAdvanced(input: PennyDropInput): Promise<PennyDropResult> {
        const base = buildResult(
            input.accountNumber,
            input.accountHolder,
            'advanced',
        );

        return {
            ...base,
            transactionId: base.valid ? `stub_txn_adv_${randomUUID()}` : null,
            amountPaise: 100,
        };
    }

    async verifySilent(input: SilentVerifyInput): Promise<BankVerifyResult> {
        return buildResult(
            input.accountNumber,
            input.accountHolder,
            'silent',
        );
    }
}
