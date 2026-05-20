// src/modules/notifications/index.ts
//
// This module has no router — it is purely event-driven.
// Import this module's events file to bootstrap all notification listeners.
// The service is also exported for direct use in the emiReminder.job cron.

export { notificationsService } from './notifications.service';
export { renderTemplate } from './notifications.templates';
export type {
    TemplateKey,
    TemplateVariables,
    NotificationDispatch,
    NotificationChannel,
    RenderedTemplate,
    DeliveryStatus,
} from './notifications.types';

// Re-export the events bootstrap — imported by src/events/index.ts
import './notifications.events';