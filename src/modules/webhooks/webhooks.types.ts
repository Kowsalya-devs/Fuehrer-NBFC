// src/modules/webhooks/webhooks.types.ts

// ─── Supported webhook sources ─────────────────────────────────────────────────

export type WebhookSource =
    | 'razorpay'
    | 'signzy'
    | 'bureau'
    | 'esign';

// ─── Processing result ─────────────────────────────────────────────────────────

export type WebhookProcessingStatus =
    | 'PROCESSED'       // Handled successfully
    | 'SKIPPED'         // Already processed (idempotent duplicate)
    | 'IGNORED'         // Event type not handled — no action needed
    | 'FAILED';         // Processing threw — logged, not retried

// ─── Webhook log record — persisted for audit ─────────────────────────────────

export interface WebhookLogRecord {
    id: string;
    source: WebhookSource;
    event: string;
    gatewayEventId: string | null;   // Vendor's own event / payment ID
    status: WebhookProcessingStatus;
    processingMs: number;
    errorMessage: string | null;
    receivedAt: Date;
    processedAt: Date | null;
}

// ─── Razorpay-specific ─────────────────────────────────────────────────────────

export interface RazorpayWebhookHeaders {
    'x-razorpay-signature': string | undefined;
    'x-razorpay-event-id': string | undefined;
}

// ─── eSign callback ────────────────────────────────────────────────────────────

export interface ESignCallbackPayload {
    requestId: string;
    status: string;           // 'SIGNED' | 'DECLINED' | 'EXPIRED'
    signedDocUrl?: string;
    timestamp: number;
    signature: string;           // HMAC-SHA256 of (requestId + status + timestamp)
}

// ─── Bureau callback ───────────────────────────────────────────────────────────

export interface BureauCallbackPayload {
    reportId: string;
    pan: string;           // Partial — for lookup only
    status: string;           // 'READY' | 'NO_HIT' | 'ERROR'
    timestamp: number;
    signature: string;
}

// ─── Signzy async callback ────────────────────────────────────────────────────

export interface SignzyCallbackPayload {
    requestId: string;
    checkType: string;
    status: string;           // 'SUCCESS' | 'FAILURE'
    data: unknown;
    timestamp: number;
    signature: string;
}
