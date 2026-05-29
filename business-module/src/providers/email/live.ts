// src/providers/email/live.ts
//
// Resend email provider — production implementation.
//
// Resend (resend.com) is the transactional email provider.
// Uses the official resend npm SDK v2.
//
// Emails sent by this system:
//   - Loan agreement PDF (attachment)
//   - Loan approval / rejection notification
//   - Monthly EMI statement
//   - NOC (No Objection Certificate) on loan closure
//   - EMI overdue and NPA alerts
//   - Welcome email on first login
//
// From address format: "Feuhrer NBFC <noreply@feuhrer.in>"
// Configure EMAIL_FROM_ADDRESS in env — must be a verified Resend domain.
//
// Rate limits (Resend free tier): 100 emails/day, 3000/month
// Production tier: unlimited (pricing per email volume)
// Verify your domain at: https://resend.com/domains

import { Resend } from 'resend';
import { env } from '@/config/env';
import { createModuleLogger } from '@/config/logger';
import { vendorCall } from '../_base/provider.utils';
import type { IEmailProvider, SendEmailInput, SendEmailResult } from './interface';

const log = createModuleLogger('email:resend');

export class ResendEmailProvider implements IEmailProvider {
    private readonly client: Resend;
    private readonly fromAddress: string;

    constructor(apiKey: string) {
        this.client = new Resend(apiKey);
        this.fromAddress = env.email.fromAddress;

        log.info('ResendEmailProvider initialised', {
            fromAddress: this.fromAddress,
        });
    }

    async sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
        return vendorCall({
            vendor: 'resend',
            fn: async () => {
                const recipients = Array.isArray(input.to)
                    ? input.to
                    : [input.to];

                // Map our generic attachment format to Resend's Attachment type
                const attachments = input.attachments?.map((a) => ({
                    filename: a.filename,
                    content: a.content,   // Buffer — Resend accepts Buffer directly
                }));

                const { data, error } = await this.client.emails.send({
                    from: this.fromAddress,
                    to: recipients,
                    subject: input.subject,
                    html: input.html,
                    text: input.text,
                    attachments: attachments?.length ? attachments : undefined,
                });

                if (error || !data) {
                    log.error('Resend sendEmail failed', {
                        errorName: error?.name,
                        errorMessage: error?.message,
                        subject: input.subject,
                        // Never log recipient email addresses
                    });

                    throw new Error(
                        `Resend email send failed: ${error?.message ?? 'unknown error'}`,
                    );
                }

                log.info('Resend email sent', {
                    messageId: data.id,
                    subject: input.subject,
                    recipientCount: recipients.length,
                });

                return { messageId: data.id };
            },
            retry: { maxAttempts: 3, delayMs: 1000 },
        });
    }
}
