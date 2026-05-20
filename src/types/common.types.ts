// src/types/common.types.ts

// ─── API Response envelope ─────────────────────────────────────────────────────
// Every successful response from this API follows this exact shape.
// Frontend can rely on this contract absolutely.

export interface ApiResponse<T = null> {
    success: true;
    data: T;
    message?: string;
    meta?: ResponseMeta;
}

export interface ApiErrorResponse {
    success: false;
    errorCode: string;
    message: string;
    details: Record<string, unknown> | null;
    timestamp: string;
    requestId?: string;
}

// Attached to list responses
export interface ResponseMeta {
    pagination?: PaginationMeta;
    total?: number;
    requestId?: string;
}

// ─── Pagination ────────────────────────────────────────────────────────────────

export interface PaginationParams {
    page: number;
    limit: number;
}

export interface PaginationMeta {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
}

export interface PaginatedResult<T> {
    data: T[];
    pagination: PaginationMeta;
}

// Converts raw query params into validated PaginationParams
export function parsePagination(
    query: { page?: unknown; limit?: unknown },
    maxLimit = 100,
): PaginationParams {
    const page = Math.max(1, parseInt(String(query.page ?? '1'), 10) || 1);
    const limit = Math.min(
        maxLimit,
        Math.max(1, parseInt(String(query.limit ?? '20'), 10) || 20),
    );
    return { page, limit };
}

export function buildPaginationMeta(
    page: number,
    limit: number,
    total: number,
): PaginationMeta {
    const totalPages = Math.ceil(total / limit);
    return {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
    };
}

// Converts pagination params into Prisma skip/take
export function toPrismaPage(p: PaginationParams): { skip: number; take: number } {
    return {
        skip: (p.page - 1) * p.limit,
        take: p.limit,
    };
}

// ─── Sorting ───────────────────────────────────────────────────────────────────

export type SortOrder = 'asc' | 'desc';

export interface SortParams {
    sortBy: string;
    sortOrder: SortOrder;
}

export function parseSortOrder(value?: unknown): SortOrder {
    return value === 'asc' ? 'asc' : 'desc';
}

// ─── Money ─────────────────────────────────────────────────────────────────────
// All monetary values are stored as Decimal in Prisma / PostgreSQL.
// In TypeScript land, we use number for calculations but round carefully.
// Never use floating-point arithmetic on raw amounts — use these helpers.

export type Rupees = number; // Always represents Indian Rupees

// Round to nearest paisa (2 decimal places), always ceiling on half-paisa
// Customers should never be underbilled due to rounding
export function roundRupees(amount: number): Rupees {
    return Math.round((amount + Number.EPSILON) * 100) / 100;
}

// Round EMI up to next paisa — prevents perpetual undercharging
export function ceilRupees(amount: number): Rupees {
    return Math.ceil(amount * 100) / 100;
}

// Format for display: ₹1,23,456.78 (Indian locale)
export function formatRupees(amount: number): string {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(amount);
}

// Safe conversion from Prisma Decimal to number
// Prisma returns Decimal objects — convert before any arithmetic
export function toNumber(value: { toNumber(): number } | number | string): number {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') return parseFloat(value);
    return value.toNumber(); // Prisma Decimal
}

// ─── Date utilities ────────────────────────────────────────────────────────────

// Add N calendar months to a date, preserving day-of-month where possible
// Handles month-end edge cases: Jan 31 + 1 month → Feb 28/29, not Mar 2/3
export function addMonths(date: Date, months: number): Date {
    const result = new Date(date);
    const day = result.getDate();
    result.setMonth(result.getMonth() + months);
    // If the day overflowed (e.g. Jan 31 → Mar 2), roll back to last day of target month
    if (result.getDate() !== day) {
        result.setDate(0); // day 0 = last day of previous month
    }
    return result;
}

// Days between two dates, ignoring time component
export function daysBetween(from: Date, to: Date): number {
    const msPerDay = 1000 * 60 * 60 * 24;
    const fromDay = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    const toDay = new Date(to.getFullYear(), to.getMonth(), to.getDate());
    return Math.floor((toDay.getTime() - fromDay.getTime()) / msPerDay);
}

// Is a date in the past (before today, ignoring time)?
export function isPast(date: Date): boolean {
    return daysBetween(date, new Date()) > 0;
}

// IST offset for display purposes (India doesn't observe DST)
export function toIST(date: Date): Date {
    const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
    return new Date(date.getTime() + IST_OFFSET_MS);
}

// ─── UUID validation ───────────────────────────────────────────────────────────

const UUID_REGEX =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidUUID(value: string): boolean {
    return UUID_REGEX.test(value);
}

// ─── Indian identity validation ────────────────────────────────────────────────

const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
const AADHAAR_REGEX = /^\d{12}$/;
const PHONE_REGEX = /^\+91[6-9]\d{9}$/;
const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const GST_REGEX = /^\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}[Z]{1}[A-Z\d]{1}$/;

export const Validators = {
    isPAN: (v: string): boolean => PAN_REGEX.test(v),
    isAadhaar: (v: string): boolean => AADHAAR_REGEX.test(v),
    isPhone: (v: string): boolean => PHONE_REGEX.test(v),
    isIFSC: (v: string): boolean => IFSC_REGEX.test(v),
    isGST: (v: string): boolean => GST_REGEX.test(v),
    isUUID: isValidUUID,
} as const;

// ─── Repository contract types ────────────────────────────────────────────────
// All repository classes follow this pattern for consistency.
// Each module's .repository.ts implements these generics for its own models.

export interface IBaseRepository<TModel, TCreateInput, TUpdateInput> {
    findById(id: string): Promise<TModel | null>;
    findAll(params: PaginationParams): Promise<PaginatedResult<TModel>>;
    create(data: TCreateInput): Promise<TModel>;
    update(id: string, data: TUpdateInput): Promise<TModel>;
    delete(id: string): Promise<void>;
    exists(id: string): Promise<boolean>;
}

// ─── Service result types ──────────────────────────────────────────────────────
// Some service operations return a discriminated union (success | failure)
// rather than throwing — useful for operations where failure is routine (e.g. credit checks)

export type ServiceResult<T, E = string> =
    | { ok: true; data: T }
    | { ok: false; error: E };

export function ok<T>(data: T): ServiceResult<T> {
    return { ok: true, data };
}

export function fail<E = string>(error: E): ServiceResult<never, E> {
    return { ok: false, error };
}

// ─── Nullable / Optional utilities ────────────────────────────────────────────

export type Nullable<T> = T | null;
export type Optional<T> = T | undefined;
export type Maybe<T> = T | null | undefined;

// Strip null/undefined from all fields — useful for clean DTO mapping
export type NonNullableFields<T> = {
    [K in keyof T]: NonNullable<T[K]>;
};

// Make specific keys optional
export type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

// Make specific keys required
export type RequiredBy<T, K extends keyof T> = T & Required<Pick<T, K>>;

// ─── Retry configuration ───────────────────────────────────────────────────────
// Shared retry config type used by vendor provider implementations

export interface RetryConfig {
    maxAttempts: number;
    delayMs: number;
    backoffFactor: number;
    retryOn?: (error: unknown) => boolean; // Custom predicate for retryable errors
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
    maxAttempts: 3,
    delayMs: 1000,
    backoffFactor: 2,
} as const;

// ─── Async retry utility ───────────────────────────────────────────────────────
// Used in every provider implementation — exponential backoff with jitter

export async function withRetry<T>(
    fn: () => Promise<T>,
    config: Partial<RetryConfig> = {},
): Promise<T> {
    const cfg = { ...DEFAULT_RETRY_CONFIG, ...config };
    let lastError: unknown;

    for (let attempt = 1; attempt <= cfg.maxAttempts; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;

            const isRetryable = cfg.retryOn ? cfg.retryOn(error) : true;
            const isLastAttempt = attempt === cfg.maxAttempts;

            if (!isRetryable || isLastAttempt) throw error;

            // Exponential backoff with ±10% jitter to prevent thundering herd
            const base = cfg.delayMs * Math.pow(cfg.backoffFactor, attempt - 1);
            const jitter = base * 0.1 * (Math.random() * 2 - 1);
            const delay = Math.round(base + jitter);

            await new Promise((resolve) => setTimeout(resolve, delay));
        }
    }

    throw lastError;
}

// ─── Phone number normalisation ───────────────────────────────────────────────
// Accepts: 9876543210 | 09876543210 | +919876543210 | 919876543210
// Returns: +919876543210 (E.164 format) or null if invalid

export function normalisePhone(raw: string): string | null {
    const digits = raw.replace(/\D/g, '');

    if (digits.length === 10 && /^[6-9]/.test(digits)) {
        return `+91${digits}`;
    }
    if (digits.length === 11 && digits.startsWith('0')) {
        const core = digits.slice(1);
        if (/^[6-9]/.test(core)) return `+91${core}`;
    }
    if (digits.length === 12 && digits.startsWith('91')) {
        const core = digits.slice(2);
        if (/^[6-9]/.test(core)) return `+91${core}`;
    }
    if (digits.length === 13 && digits.startsWith('091')) {
        const core = digits.slice(3);
        if (/^[6-9]/.test(core)) return `+91${core}`;
    }

    return null;
}

// ─── Response builders ─────────────────────────────────────────────────────────
// Controllers use these instead of constructing the envelope manually.
// Guarantees every success response matches ApiResponse<T>.

export function successResponse<T>(
    data: T,
    message?: string,
    meta?: ResponseMeta,
): ApiResponse<T> {
    return {
        success: true,
        data,
        ...(message ? { message } : {}),
        ...(meta ? { meta } : {}),
    };
}

export function paginatedResponse<T>(
    result: PaginatedResult<T>,
    message?: string,
): ApiResponse<T[]> {
    return {
        success: true,
        data: result.data,
        ...(message ? { message } : {}),
        meta: {
            pagination: result.pagination,
            total: result.pagination.total,
        },
    };
}