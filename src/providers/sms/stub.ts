// src/providers/sms/stub.ts
//
// Stub SMS provider — development and test only.
//
// Behaviour:
//   - Logs every SMS to the console so developers can see OTPs and
//     notifications without needing a real phone or SMS credits.
//   - Never makes any HTTP calls — zero external dependencies.
//   - Returns a deterministic messageId for test assertions.
//   - sendOtp() logs the OTP clearly so dev login works without a phone.
//
// To simulate a failure in tests, prefix the phone number with '+99':
//   e.g. phone: '+9999999999' → StubSmsProvider throws SEND_FAILED

import { randomUUID } from 'crypto';
import { createModuleLogger } from '@/config/logger';
import type { ISmsProvider, SendSmsInput, SendSmsResult } from './interface';

const log = createModuleLogger('sms:stub');

export class StubSmsProvider implements ISmsProvider {

    async sendSms(input: SendSmsInput): Promise<SendSmsResult> {
        // Failure simulation — phone starting with +99 forces error
        if (input.to.startsWith('+99')) {
            log.warn('StubSmsProvider: simulating sendSms failure', {
                to: input.to,
            });
            return {
                messageId: `stub_sms_failed_${randomUUID()}`,
                status: 'FAILED',
            };
        }

        const messageId = `stub_sms_${randomUUID()}`;

        // Log clearly so the developer can see the message in terminal
        log.info('📱 [STUB SMS]', {
            to: input.to,
            templateId: input.templateId ?? 'none',
            message: input.message,
            messageId,
        });

        // Also write to stdout directly so it shows up even with silent loggers
        if (process.env.NODE_ENV !== 'test') {
            console.log(
                `\n📱 STUB SMS → ${input.to}\n` +
                `   ${input.message}\n` +
                `   messageId: ${messageId}\n`,
            );
        }

        return { messageId, status: 'SENT' };
    }

    async sendOtp(phone: string, otp: string): Promise<SendSmsResult> {
        // Failure simulation
        if (phone.startsWith('+99')) {
            log.warn('StubSmsProvider: simulating sendOtp failure', { phone });
            return {
                messageId: `stub_otp_failed_${randomUUID()}`,
                status: 'FAILED',
            };
        }

        const messageId = `stub_otp_${randomUUID()}`;

        // Make the OTP very visible in dev — developers need this to log in
        log.info('🔑 [STUB OTP]', { phone, otp, messageId });

        if (process.env.NODE_ENV !== 'test') {
            console.log(
                `\n🔑 STUB OTP → ${phone}\n` +
                `   OTP: ${otp}\n` +
                `   messageId: ${messageId}\n`,
            );
        }

        return { messageId, status: 'SENT' };
    }
}