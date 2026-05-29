// src/providers/email/stub.ts
//
// Stub email provider — development and test only.
//
// Behaviour:
//   - Logs every email to the console with subject, recipients and a
//     truncated HTML preview so developers can verify email content.
//   - Never makes any HTTP calls — zero external dependencies.
//   - Attachments are acknowledged but not written to disk.
//   - Returns a deterministic messageId for test assertions.
//
// To simulate a failure in tests, set the subject prefix to '[FAIL]':
//   e.g. subject: '[FAIL] Loan agreement' → throws an error

import { randomUUID } from 'crypto';
import { createModuleLogger } from '@/config/logger';
import type { IEmailProvider, SendEmailInput, SendEmailResult } from './interface';

const log = createModuleLogger('email:stub');

// Max HTML chars to print in terminal — prevents flooding the console
const HTML_PREVIEW_LENGTH = 200;

export class StubEmailProvider implements IEmailProvider {

    async sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
        // Failure simulation — prefix subject with '[FAIL]' in tests
        if (input.subject.startsWith('[FAIL]')) {
            log.warn('StubEmailProvider: simulating sendEmail failure', {
                subject: input.subject,
            });
            throw new Error(
                `StubEmailProvider: forced failure via [FAIL] subject prefix`,
            );
        }

        const messageId = `stub_email_${randomUUID()}`;
        const recipients = Array.isArray(input.to) ? input.to : [input.to];
        const preview = input.html
            .replace(/<[^>]+>/g, ' ')          // strip tags for readable preview
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, HTML_PREVIEW_LENGTH);

        log.info('📧 [STUB EMAIL]', {
            to: recipients,
            subject: input.subject,
            attachments: input.attachments?.map((a) => a.filename) ?? [],
            messageId,
        });

        // Print clearly to stdout so it's visible even with silent loggers
        if (process.env.NODE_ENV !== 'test') {
            console.log(
                `\n📧 STUB EMAIL\n` +
                `   To:      ${recipients.join(', ')}\n` +
                `   Subject: ${input.subject}\n` +
                `   Preview: ${preview}${preview.length >= HTML_PREVIEW_LENGTH ? '…' : ''}\n` +
                (input.attachments?.length
                    ? `   Attachments: ${input.attachments.map((a) => a.filename).join(', ')}\n`
                    : '') +
                `   messageId: ${messageId}\n`,
            );
        }

        return { messageId };
    }
}
