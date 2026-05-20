// src/providers/sms/live.ts
//
// Production SMS providers — MSG91 and Twilio.
//
// MSG91 is the primary provider for India:
//   - DLT-registered sender ID and templates (mandatory for Indian telcos)
//   - All SMS templates must be pre-registered on the DLT portal before go-live
//   - Uses MSG91 Send SMS v2 API (HTTP POST to api.msg91.com)
//   - OTP templates use MSG91's dedicated OTP API for higher delivery rates
//
// Twilio is the fallback provider:
//   - Used when MSG91 is unavailable or for international numbers
//   - Uses the official twilio npm SDK (v4)
//
// DLT COMPLIANCE (mandatory for production):
//   Before go-live, register all SMS templates at:
//   https://dlt.trai.gov.in  or  https://smartping.live
//   Templates required: OTP, EMI reminder, overdue alert, disbursement,
//   loan approval, loan rejection, KYC status, eSign request, NOC.
//   Each template gets a DLT Template ID — store in MSG91_TEMPLATE_ID env.

import axios from 'axios';
import twilio from 'twilio';
import { createModuleLogger } from '@/config/logger';
import { createHttpClient, vendorCall } from '../_base/provider.utils';
import type { ISmsProvider, SendSmsInput, SendSmsResult } from './interface';

const log = createModuleLogger('sms:live');

// ─── MSG91 Provider ───────────────────────────────────────────────────────────

const MSG91_BASE_URL = 'https://api.msg91.com/api/v2';
const MSG91_OTP_URL = 'https://api.msg91.com/api/v5/otp';

export class Msg91SmsProvider implements ISmsProvider {
    private readonly authKey: string;
    private readonly senderId: string;
    private readonly templateId: string;

    constructor(authKey: string, senderId: string, templateId: string) {
        this.authKey = authKey;
        this.senderId = senderId;
        this.templateId = templateId;

        log.info('Msg91SmsProvider initialised', { senderId });
    }

    async sendSms(input: SendSmsInput): Promise<SendSmsResult> {
        return vendorCall({
            vendor: 'msg91',
            fn: async () => {
                // Strip +91 — MSG91 expects 10-digit Indian number or
                // full international format without +
                const mobile = input.to.replace(/^\+/, '');

                let res: { data: { type: string; message: string } };
                try {
                    res = await axios.post(
                        `${MSG91_BASE_URL}/sendsms`,
                        {
                            sender: this.senderId,
                            route: '4',           // Transactional route
                            country: '91',
                            sms: [
                                {
                                    message: input.message,
                                    to: [mobile],
                                },
                            ],
                        },
                        {
                            headers: {
                                'authkey': this.authKey,
                                'Content-Type': 'application/json',
                            },
                            timeout: 5_000,
                        },
                    );
                } catch (err: unknown) {
                    log.error('MSG91 sendSms HTTP error', {
                        to: input.to.slice(-4), // Log last 4 digits only
                    });
                    throw err;
                }

                const success = res.data.type === 'success';

                if (!success) {
                    log.error('MSG91 sendSms failed', {
                        type: res.data.type,
                        message: res.data.message,
                    });
                }

                log.info('MSG91 SMS sent', {
                    to: input.to.slice(-4),
                    success,
                });

                return {
                    messageId: res.data.message ?? `msg91_${Date.now()}`,
                    status: success ? 'SENT' : 'FAILED',
                };
            },
            retry: { maxAttempts: 3, delayMs: 500 },
        });
    }

    async sendOtp(phone: string, otp: string): Promise<SendSmsResult> {
        return vendorCall({
            vendor: 'msg91',
            fn: async () => {
                // MSG91 OTP API — uses dedicated high-priority route
                const mobile = phone.replace(/^\+91/, '').replace(/^\+/, '');

                let res: { data: { type: string; message: string } };
                try {
                    res = await axios.post(
                        MSG91_OTP_URL,
                        {
                            template_id: this.templateId,
                            mobile: `91${mobile}`,
                            authkey: this.authKey,
                            otp,
                        },
                        {
                            headers: { 'Content-Type': 'application/json' },
                            timeout: 5_000,
                        },
                    );
                } catch (err: unknown) {
                    log.error('MSG91 sendOtp HTTP error', {
                        phone: phone.slice(-4),
                    });
                    throw err;
                }

                const success = res.data.type === 'success';

                if (!success) {
                    log.error('MSG91 OTP send failed', {
                        type: res.data.type,
                        message: res.data.message,
                        phone: phone.slice(-4),
                    });
                }

                log.info('MSG91 OTP sent', {
                    phone: phone.slice(-4),
                    success,
                });

                return {
                    messageId: res.data.message ?? `msg91_otp_${Date.now()}`,
                    status: success ? 'SENT' : 'FAILED',
                };
            },
            retry: { maxAttempts: 2, delayMs: 300 },
        });
    }
}

// ─── Twilio Provider ──────────────────────────────────────────────────────────

export class TwilioSmsProvider implements ISmsProvider {
    private readonly client: ReturnType<typeof twilio>;
    private readonly fromNumber: string;

    constructor(
        accountSid: string,
        authToken: string,
        fromNumber: string,
    ) {
        this.client = twilio(accountSid, authToken);
        this.fromNumber = fromNumber;

        log.info('TwilioSmsProvider initialised', {
            fromNumber: fromNumber.slice(-4),
        });
    }

    async sendSms(input: SendSmsInput): Promise<SendSmsResult> {
        return vendorCall({
            vendor: 'twilio',
            fn: async () => {
                let message: { sid: string; status: string };
                try {
                    message = await this.client.messages.create({
                        body: input.message,
                        from: this.fromNumber,
                        to: input.to,
                    });
                } catch (err: unknown) {
                    log.error('Twilio sendSms error', {
                        to: input.to.slice(-4),
                    });
                    throw err;
                }

                const success = !['failed', 'undelivered'].includes(
                    message.status,
                );

                log.info('Twilio SMS sent', {
                    sid: message.sid,
                    status: message.status,
                    to: input.to.slice(-4),
                });

                return {
                    messageId: message.sid,
                    status: success ? 'SENT' : 'FAILED',
                };
            },
            retry: { maxAttempts: 2, delayMs: 500 },
        });
    }

    async sendOtp(phone: string, otp: string): Promise<SendSmsResult> {
        return this.sendSms({
            to: phone,
            message: `Your Feuhrer OTP is ${otp}. Valid for 5 minutes. Do not share with anyone. -Feuhrer NBFC`,
        });
    }
}