// src/providers/email/index.ts
//
// Factory for the email provider singleton.
// Picks Resend in production, stub in development/test.
// Lazy-require keeps the live SDK out of the dev bundle.

import { env } from '@/config/env';
import { getSecrets } from '@/config/secrets';
import type { IEmailProvider } from './interface';

export type { IEmailProvider } from './interface';
export type { SendEmailInput, SendEmailResult } from './interface';

let instance: IEmailProvider | null = null;

export function getEmailProvider(): IEmailProvider {
    if (instance !== null) return instance;

    let created: IEmailProvider;

    if (env.email.provider === 'resend') {
        const { ResendEmailProvider } = require('./live');
        created = new ResendEmailProvider(getSecrets().resend.apiKey);
    } else {
        const { StubEmailProvider } = require('./stub');
        created = new StubEmailProvider();
    }

    instance = created;
    return created;
}

// Test isolation — call from afterEach() so each test gets a fresh stub.
export function _resetEmailProvider(): void {
    instance = null;
}
