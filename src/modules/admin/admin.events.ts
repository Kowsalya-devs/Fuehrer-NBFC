// src/modules/admin/admin.events.ts
import { createModuleLogger } from '@/config/logger';

const log = createModuleLogger('admin.events');

// Admin events are written directly to audit_logs via setAuditContext
// rather than through the event bus — they are synchronous compliance
// records, not reactive side effects.

export const adminEvents = {
    configUpdated(key: string, value: string, updatedBy: string): void {
        log.warn('System configuration updated', { key, value, updatedBy });
    },
    maintenanceModeChanged(enabled: boolean, setBy: string): void {
        log.warn('Maintenance mode changed', { enabled, setBy });
    },
};