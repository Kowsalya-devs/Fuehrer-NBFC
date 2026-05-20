// src/events/index.ts
import './handlers/loan.handlers';
import './handlers/payment.handlers';
import './handlers/collection.handlers';

// Notification handlers — must come after domain handlers
import '@/modules/notifications';

import { eventBus } from './eventBus';
import { createModuleLogger } from '@/config/logger';

const log = createModuleLogger('events');

export function bootstrapEventHandlers(): void {
    const registered = eventBus.registeredListeners();
    const total = Object.values(registered)
        .reduce((sum, listeners) => sum + listeners.length, 0);

    log.info('Event handlers bootstrapped', {
        totalHandlers: total,
        events: registered,
    });
}

export { eventBus } from './eventBus';
export * from './eventBus';