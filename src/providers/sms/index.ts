import { env } from '@/config/env';
import { getSecrets } from '@/config/secrets';
import type { ISmsProvider } from './interface';

export type { ISmsProvider } from './interface';
export type { SendSmsInput, SendSmsResult } from './interface';

let instance: ISmsProvider | null = null;

export function getSmsProvider(): ISmsProvider {
    if (instance) return instance;
    if (env.sms.provider === 'twilio') {
        const { TwilioSmsProvider } = require('./live');
        const s = getSecrets();
        instance = new TwilioSmsProvider(
            s.twilio.accountSid,
            s.twilio.authToken,
            s.twilio.fromNumber,
        );
    } else if (env.sms.provider === 'msg91') {
        const { Msg91SmsProvider } = require('./live');
        const s = getSecrets();
        instance = new Msg91SmsProvider(
            s.msg91.authKey,
            s.msg91.senderId,
            s.msg91.templateId,
        );
    } else {
        const { StubSmsProvider } = require('./stub');
        instance = new StubSmsProvider();
    }
    return instance;
}

export function _resetSmsProvider(): void { instance = null; }