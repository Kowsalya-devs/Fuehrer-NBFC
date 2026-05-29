// src/providers/_base/provider.utils.ts
//
// Shared utilities for every "live" provider implementation.
//
// Two exports:
//   1. createHttpClient(opts) — pre-configured axios instance with timeouts,
//        retry-on-timeout, structured request/response logging, and per-vendor
//        correlation IDs in headers.
//
//   2. vendorCall(opts) — wraps a single vendor API call with:
//        - automatic retry on transient failure (network errors, 5xx, 429)
//        - exponential backoff (200ms → 400ms → 800ms by default)
//        - clean VendorError wrapping for non-transient failures
//        - structured logging of the attempt count and latency
//
// Used by: every provider in src/providers/*/live.ts

import axios, {
    type AxiosInstance,
    type AxiosRequestConfig,
    type AxiosResponse,
    type AxiosError,
} from 'axios';
import { randomUUID } from 'crypto';
import { createModuleLogger } from '@/config/logger';
import { VendorError } from '@/errors/VendorError';

// ─── createHttpClient ─────────────────────────────────────────────────────────

export interface CreateHttpClientOptions {
    baseURL: string;
    timeoutMs: number;
    headers?: Record<string, string>;
    vendor: string;   // For correlation in logs — 'signzy', 'bureau:cibil', etc.
}

/**
 * Create an axios instance with sensible defaults for vendor API calls.
 *
 * - Per-request UUID injected into the `x-correlation-id` header
 * - Timeout set from the passed option (NEVER use axios' default of 0)
 * - Request and response logged at debug level with redacted body
 * - 4xx/5xx responses converted to thrown AxiosError (default behaviour kept)
 */
export function createHttpClient(opts: CreateHttpClientOptions): AxiosInstance {
    const log = createModuleLogger(`http:${opts.vendor}`);

    const client = axios.create({
        baseURL: opts.baseURL,
        timeout: opts.timeoutMs,
        headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            ...opts.headers,
        },
        validateStatus: (status) => status >= 200 && status < 300,
    });

    // ── Request interceptor ──────────────────────────────────────────────────
    client.interceptors.request.use((config) => {
        const correlationId = randomUUID();
        config.headers = config.headers ?? {};
        config.headers['x-correlation-id'] = correlationId;

        (config as AxiosRequestConfig & { _correlationId?: string })
            ._correlationId = correlationId;
        (config as AxiosRequestConfig & { _startTime?: number })
            ._startTime = Date.now();

        log.debug('Vendor request', {
            method: config.method?.toUpperCase(),
            url: config.url,
            correlationId,
        });
        return config;
    });

    // ── Response interceptor ─────────────────────────────────────────────────
    client.interceptors.response.use(
        (response: AxiosResponse) => {
            const cfg = response.config as AxiosRequestConfig & {
                _correlationId?: string;
                _startTime?: number;
            };
            const latencyMs = cfg._startTime ? Date.now() - cfg._startTime : 0;

            log.debug('Vendor response', {
                status: response.status,
                url: response.config.url,
                latencyMs,
                correlationId: cfg._correlationId,
            });
            return response;
        },
        (error: AxiosError) => {
            const cfg = (error.config ?? {}) as AxiosRequestConfig & {
                _correlationId?: string;
                _startTime?: number;
            };
            const latencyMs = cfg._startTime ? Date.now() - cfg._startTime : 0;

            log.warn('Vendor error', {
                status: error.response?.status,
                code: error.code,
                url: error.config?.url,
                latencyMs,
                correlationId: cfg._correlationId,
                message: error.message,
            });
            return Promise.reject(error);
        },
    );

    return client;
}

// ─── vendorCall ───────────────────────────────────────────────────────────────

export interface VendorCallOptions<T> {
    vendor: string;
    fn: () => Promise<T>;
    /**
     * Retry config — pass as an object:
     *   retry: { maxAttempts: 3, delayMs: 1000, backoffFactor: 2 }
     *
     * maxAttempts = total attempts (including the first). Default 3.
     * delayMs     = initial backoff delay in ms. Default 200.
     * backoffFactor = multiplier per retry. Default 2 (exponential).
     */
    retry?: {
        maxAttempts?: number;
        delayMs?: number;
        backoffFactor?: number;
    };
    onRetry?: (attempt: number, error: unknown) => void;
}

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BACKOFF_MS = 200;
const DEFAULT_BACKOFF_FACTOR = 2;
const DEFAULT_MAX_BACKOFF_MS = 5000;

/**
 * Run a vendor API call with retry-on-transient-failure semantics.
 *
 * Retry decisions:
 *   - AxiosError with code ECONNABORTED / ETIMEDOUT / ECONNRESET → retry
 *   - HTTP 408 / 429 / 502 / 503 / 504 → retry
 *   - VendorError with retryable=true → retry
 *   - Everything else → throw immediately
 *
 * After exhausting retries, the final error is wrapped in a VendorError
 * (unless it already was one) so upstream callers have a consistent type.
 */
export async function vendorCall<T>(opts: VendorCallOptions<T>): Promise<T> {
    const log = createModuleLogger(`vendor:${opts.vendor}`);
    const maxAttempts = opts.retry?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    const initialBackoff = opts.retry?.delayMs ?? DEFAULT_BACKOFF_MS;
    const backoffFactor = opts.retry?.backoffFactor ?? DEFAULT_BACKOFF_FACTOR;
    const maxRetries = maxAttempts - 1; // convert total attempts → retry count

    let lastError: unknown;
    let attempt = 0;

    while (attempt <= maxRetries) {
        const startMs = Date.now();
        try {
            const result = await opts.fn();
            if (attempt > 0) {
                log.info('Vendor call succeeded after retry', {
                    attempts: attempt + 1,
                    latencyMs: Date.now() - startMs,
                });
            }
            return result;
        } catch (err) {
            lastError = err;
            const retryable = _isRetryable(err);

            if (!retryable || attempt === maxRetries) {
                log.error('Vendor call failed', {
                    attempts: attempt + 1,
                    retryable,
                    latencyMs: Date.now() - startMs,
                    error: err instanceof Error ? err.message : String(err),
                });
                throw _wrapAsVendorError(opts.vendor, err);
            }

            // Exponential backoff with ±20% jitter to avoid thundering herd
            const baseBackoff = Math.min(
                initialBackoff * Math.pow(backoffFactor, attempt),
                DEFAULT_MAX_BACKOFF_MS,
            );
            const jitter = baseBackoff * (0.8 + Math.random() * 0.4);
            const sleepMs = Math.round(jitter);

            log.warn('Vendor call failed — retrying', {
                attempt: attempt + 1,
                nextAttempt: attempt + 2,
                sleepMs,
                error: err instanceof Error ? err.message : String(err),
            });

            if (opts.onRetry) {
                try { opts.onRetry(attempt + 1, err); } catch { /* noop */ }
            }

            await new Promise((resolve) => setTimeout(resolve, sleepMs));
            attempt += 1;
        }
    }

    // Should be unreachable, but TypeScript needs a terminal throw
    throw _wrapAsVendorError(opts.vendor, lastError);
}

// ─── Internals ────────────────────────────────────────────────────────────────

function _isRetryable(err: unknown): boolean {
    if (err instanceof VendorError) {
        return err.retryable;
    }

    if (axios.isAxiosError(err)) {
        if (err.code === 'ECONNABORTED') return true;
        if (err.code === 'ETIMEDOUT') return true;
        if (err.code === 'ECONNRESET') return true;
        if (err.code === 'ENOTFOUND') return false;  // DNS — not transient
        if (err.code === 'ECONNREFUSED') return true;

        const status = err.response?.status;
        if (status === undefined) return true;  // no response = network blip
        if (status === 408) return true;
        if (status === 429) return true;
        if (status === 502) return true;
        if (status === 503) return true;
        if (status === 504) return true;

        return false;
    }

    return false;
}

function _wrapAsVendorError(vendor: string, err: unknown): VendorError {
    if (err instanceof VendorError) {
        return err;
    }

    if (axios.isAxiosError(err)) {
        const status = err.response?.status;
        const vendorMessage =
            (err.response?.data as { message?: string } | undefined)?.message ??
            err.message;

        return new VendorError({
            vendor,
            message: `Vendor ${vendor} call failed: ${err.message}`,
            errorCode: 'VENDOR_HTTP_ERROR',
            statusCode: 502,
            vendorCode: err.code ?? String(status ?? 'unknown'),
            vendorMessage,
            retryable: _isRetryable(err),
            cause: err,
        });
    }

    const message = err instanceof Error ? err.message : String(err);
    return new VendorError({
        vendor,
        message: `Vendor ${vendor} call failed: ${message}`,
        errorCode: 'VENDOR_UNKNOWN_ERROR',
        statusCode: 502,
        retryable: false,
        cause: err,
    });
}
