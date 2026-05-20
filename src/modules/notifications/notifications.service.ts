// src/modules/notifications/notifications.service.ts
import { prisma } from '@/config/database';
import { getRedisClient } from '@/config/redis';
import { getSmsProvider } from '@/providers/sms';
import { getEmailProvider } from '@/providers/email';
import { createModuleLogger } from '@/config/logger';
import { renderTemplate } from './notifications.templates';
import type {
    TemplateKey,
    TemplateVariables,
    NotificationDispatch,
    NotificationChannel,
    DeliveryStatus,
} from './notifications.types';

const log = createModuleLogger('notifications.service');

// ─── Deduplication key prefix ─────────────────────────────────────────────────

const DEDUPE_PREFIX = 'notif:dedupe:';

// ─── Channel dispatcher ───────────────────────────────────────────────────────

async function dispatchSms(
    phone: string,
    body: string,
): Promise<{ messageId: string | null; error: string | null }> {
    const provider = getSmsProvider();
    try {
        const result = await provider.sendSms({ to: phone, message: body });
        return { messageId: result.messageId, error: null };
    } catch (err) {
        return { messageId: null, error: (err as Error).message };
    }
}

async function dispatchEmail(
    email: string,
    subject: string,
    html: string,
    text: string,
): Promise<{ messageId: string | null; error: string | null }> {
    const provider = getEmailProvider();
    try {
        const result = await provider.sendEmail({
            to: email,
            subject,
            html,
            text,
        });
        return { messageId: result.messageId, error: null };
    } catch (err) {
        return { messageId: null, error: (err as Error).message };
    }
}

// Push — using Expo push notification format
async function dispatchPush(
    fcmToken: string,
    title: string,
    body: string,
    data: Record<string, string>,
): Promise<{ messageId: string | null; error: string | null }> {
    try {
        // Expo push endpoint — provider adapter handles auth
        const response = await fetch('https://exp.host/--/api/v2/push/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                to: fcmToken,
                title,
                body,
                data,
                sound: 'default',
                channelId: 'default',
            }),
        });

        if (!response.ok) {
            return {
                messageId: null,
                error: `Expo push failed: ${response.status}`,
            };
        }

        const result = await response.json() as {
            data: { status: string; id?: string; message?: string };
        };

        if (result.data.status === 'error') {
            return { messageId: null, error: result.data.message ?? 'Push error' };
        }

        return { messageId: result.data.id ?? null, error: null };
    } catch (err) {
        return { messageId: null, error: (err as Error).message };
    }
}

// ─── Delivery logger ──────────────────────────────────────────────────────────
// Fire-and-forget — never block dispatch on log write

async function logDelivery(entry: {
    templateKey: TemplateKey;
    channel: NotificationChannel;
    recipient: string;
    status: DeliveryStatus;
    messageId: string | null;
    error: string | null;
}): Promise<void> {
    await prisma.notification_deliveries.create({
        data: {
            template_key: entry.templateKey,
            channel: entry.channel,
            recipient: entry.recipient,
            status: entry.status,
            message_id: entry.messageId,
            error: entry.error,
            sent_at: entry.status === 'SENT' ? new Date() : null,
            created_at: new Date(),
        },
    }).catch((err) => {
        log.error('Failed to log notification delivery', {
            error: (err as Error).message,
            template: entry.templateKey,
            channel: entry.channel,
        });
    });
}

// ─── Service ───────────────────────────────────────────────────────────────────

export const notificationsService = {

    // ── Core dispatch ──────────────────────────────────────────────────────────
    // The single entry point for all notification sends.
    // Handles deduplication, rendering, and multi-channel dispatch.

    async dispatch<K extends TemplateKey>(
        dispatch: NotificationDispatch<K>,
    ): Promise<void> {
        const { template, variables, channels, recipient, dedupeKey, dedupeTtl } =
            dispatch;

        // ── Deduplication check ───────────────────────────────────────────────────
        if (dedupeKey) {
            const redis = getRedisClient();
            const fullKey = `${DEDUPE_PREFIX}${dedupeKey}`;
            const exists = await redis.get(fullKey).catch(() => null);

            if (exists) {
                log.debug('Notification suppressed (dedupe)', {
                    template,
                    dedupeKey,
                });

                await logDelivery({
                    templateKey: template,
                    channel: channels[0]!,
                    recipient: recipient.phone ?? recipient.email ?? recipient.userId ?? '',
                    status: 'SUPPRESSED',
                    messageId: null,
                    error: null,
                });

                return;
            }

            // Mark as sent — TTL prevents re-send within the window
            const ttl = dedupeTtl ?? 3600; // Default 1 hour
            await redis.setex(fullKey, ttl, '1').catch(() => { });
        }

        // ── Render template ───────────────────────────────────────────────────────
        let rendered;
        try {
            rendered = renderTemplate(template, variables);
        } catch (err) {
            log.error('Template render failed', {
                template,
                error: (err as Error).message,
            });
            return;
        }

        // ── Dispatch per channel ──────────────────────────────────────────────────
        const dispatchTasks = channels.map(async (channel) => {
            switch (channel) {

                case 'SMS': {
                    if (!recipient.phone || !rendered.smsBody) {
                        log.debug('SMS skipped — no phone or no body', { template });
                        return;
                    }

                    const result = await dispatchSms(recipient.phone, rendered.smsBody);

                    await logDelivery({
                        templateKey: template,
                        channel: 'SMS',
                        recipient: recipient.phone,
                        status: result.error ? 'FAILED' : 'SENT',
                        messageId: result.messageId,
                        error: result.error,
                    });

                    if (result.error) {
                        log.warn('SMS dispatch failed', {
                            template,
                            phone: recipient.phone,
                            error: result.error,
                        });
                    } else {
                        log.debug('SMS sent', { template, phone: recipient.phone });
                    }
                    break;
                }

                case 'EMAIL': {
                    if (
                        !recipient.email ||
                        !rendered.emailSubject ||
                        !rendered.emailHtml
                    ) {
                        log.debug('Email skipped — no address or template', { template });
                        return;
                    }

                    const result = await dispatchEmail(
                        recipient.email,
                        rendered.emailSubject,
                        rendered.emailHtml,
                        rendered.emailText ?? '',
                    );

                    await logDelivery({
                        templateKey: template,
                        channel: 'EMAIL',
                        recipient: recipient.email,
                        status: result.error ? 'FAILED' : 'SENT',
                        messageId: result.messageId,
                        error: result.error,
                    });

                    if (result.error) {
                        log.warn('Email dispatch failed', {
                            template,
                            email: recipient.email,
                            error: result.error,
                        });
                    }
                    break;
                }

                case 'PUSH': {
                    if (
                        !recipient.fcmToken ||
                        !rendered.pushTitle ||
                        !rendered.pushBody
                    ) {
                        log.debug('Push skipped — no token or template', { template });
                        return;
                    }

                    const result = await dispatchPush(
                        recipient.fcmToken,
                        rendered.pushTitle,
                        rendered.pushBody,
                        rendered.pushData ?? {},
                    );

                    await logDelivery({
                        templateKey: template,
                        channel: 'PUSH',
                        recipient: recipient.fcmToken,
                        status: result.error ? 'FAILED' : 'SENT',
                        messageId: result.messageId,
                        error: result.error,
                    });

                    if (result.error) {
                        log.warn('Push dispatch failed', {
                            template,
                            error: result.error,
                        });
                    }
                    break;
                }
            }
        });

        // Dispatch all channels concurrently — a failure in one does not block others
        await Promise.allSettled(dispatchTasks);
    },

    // ── Fetch user contact details ─────────────────────────────────────────────
    // Resolves phone/email/fcmToken from userId — avoids passing these
    // through every event payload.

    async resolveRecipient(userId: string): Promise<{
        phone?: string;
        email?: string;
        fcmToken?: string;
    }> {
        const user = await prisma.users.findUnique({
            where: { id: userId },
            select: {
                phone: true,
                email: true,
                fcm_token: true,
            },
        });

        if (!user) return {};

        return {
            phone: (user.phone as string) ?? undefined,
            email: (user.email as string | null) ?? undefined,
            fcmToken: (user.fcm_token as string | null) ?? undefined,
        };
    },
};