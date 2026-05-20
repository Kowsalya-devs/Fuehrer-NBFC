import { env } from '@/config/env';
import { getSecrets } from '@/config/secrets';
import type { IEmailProvider } from './interface';

export type { IEmailProvider } from './interface';
export type { SendEmailInput, SendEmailResult } from './interface';

let instance: IEmailProvider | null = null;

export function getEmailProvider(): IEmailProvider {
    if (instance) return instance;
    if (env.email.provider === 'resend') {
        const { ResendEmailProvider } = require('./live');
        instance = new ResendEmailProvider(getSecrets().resend.apiKey);
    } else {
        const { StubEmailProvider } = require('./stub');
        instance = new StubEmailProvider();
    }
    return instance;
}

export function _resetEmailProvider(): void { instance = null; }