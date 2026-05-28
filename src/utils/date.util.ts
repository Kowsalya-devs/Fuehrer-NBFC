// src/utils/date.util.ts
//
// Date and time utilities for the Feuhrer business module.
//
// Core date functions (addMonths, daysBetween, isPast, toIST) live in
// common.types.ts alongside the types that use them. This util re-exports
// them and adds IST-aware helpers needed by cron jobs and MIS reports.
//
// All dates are stored in UTC in PostgreSQL. Conversion to IST happens only
// at the boundary — report generation and SMS/push notification content.
// Never store IST dates — India does not observe DST so UTC+5:30 is fixed,
// but storing IST causes silent bugs when comparing timestamps across zones.

export {
    addMonths,
    daysBetween,
    isPast,
    toIST,
} from '@/types/common.types';

// ─── IST constants ────────────────────────────────────────────────────────────

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // UTC+5:30, no DST

// ─── Start / end of day in IST ────────────────────────────────────────────────
// Used by cron jobs to query "today's" EMIs and NPA checks.
// All DB queries use UTC — these convert IST midnight to UTC timestamps.

export function startOfDayIST(date?: Date): Date {
    const d = date ? new Date(date) : new Date();
    // Convert to IST, zero out time, convert back to UTC
    const istMs = d.getTime() + IST_OFFSET_MS;
    const istDay = new Date(istMs);
    istDay.setUTCHours(0, 0, 0, 0);
    return new Date(istDay.getTime() - IST_OFFSET_MS);
}

export function endOfDayIST(date?: Date): Date {
    const d = date ? new Date(date) : new Date();
    const istMs = d.getTime() + IST_OFFSET_MS;
    const istDay = new Date(istMs);
    istDay.setUTCHours(23, 59, 59, 999);
    return new Date(istDay.getTime() - IST_OFFSET_MS);
}

// ─── Date range helpers ───────────────────────────────────────────────────────
// Used by MIS report endpoints that accept ?fromDate=&toDate= query params.

export interface DateRange {
    fromDate: Date;
    toDate: Date;
}

/**
 * Builds a UTC date range for a given calendar month.
 * e.g. monthRange(2026, 4) → April 2026: 2026-03-31T18:30:00Z → 2026-04-30T18:30:00Z
 */
export function monthRange(year: number, month: number): DateRange {
    // month is 1-based (1=Jan, 12=Dec)
    const from = startOfDayIST(new Date(year, month - 1, 1));
    const to = endOfDayIST(new Date(year, month, 0)); // day 0 = last day of prev month
    return { fromDate: from, toDate: to };
}

/**
 * Parses a YYYY-MM-DD string into a UTC Date (midnight IST).
 * Returns null if the string is not a valid date.
 */
export function parseDateParam(value: string): Date | null {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const [year, month, day] = value.split('-').map(Number) as [number, number, number];
    const d = new Date(year, month - 1, day);
    if (isNaN(d.getTime())) return null;
    return startOfDayIST(d);
}

/**
 * Formats a Date as YYYY-MM-DD in IST for display in reports and SMS.
 * e.g. formatDateIST(new Date('2026-04-15T00:00:00Z')) → '2026-04-15'
 */
export function formatDateIST(date: Date): string {
    const ist = new Date(date.getTime() + IST_OFFSET_MS);
    const y = ist.getUTCFullYear();
    const m = String(ist.getUTCMonth() + 1).padStart(2, '0');
    const d = String(ist.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

/**
 * Formats a Date as "15 Apr 2026" in IST — used in customer-facing SMS/email.
 */
export function formatDateDisplay(date: Date): string {
    const MONTHS = [
        'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    ];
    const ist = new Date(date.getTime() + IST_OFFSET_MS);
    return `${ist.getUTCDate()} ${MONTHS[ist.getUTCMonth()]} ${ist.getUTCFullYear()}`;
}

// ─── Due-date helpers ─────────────────────────────────────────────────────────
// Used by EMI scheduler and NPA watch cron jobs.

/**
 * Returns true if the given due date falls on today in IST.
 */
export function isDueToday(dueDate: Date): boolean {
    const today = formatDateIST(new Date());
    const dueDateStr = formatDateIST(dueDate);
    return today === dueDateStr;
}

/**
 * Returns true if dueDate is exactly N calendar days from now (IST).
 * Used to find EMIs due in 3 days or 1 day for reminder SMS.
 */
export function isDueInDays(dueDate: Date, days: number): boolean {
    const target = new Date();
    target.setDate(target.getDate() + days);
    return formatDateIST(dueDate) === formatDateIST(target);
}

/**
 * Returns the number of days a due date is overdue as of today (IST).
 * Returns 0 if the due date is today or in the future.
 */
export function overdueDays(dueDate: Date): number {
    const todayStr = formatDateIST(new Date());
    const dueStr = formatDateIST(dueDate);
    if (dueStr >= todayStr) return 0;

    const today = new Date(todayStr);
    const due = new Date(dueStr);
    const msPerDay = 1000 * 60 * 60 * 24;
    return Math.floor((today.getTime() - due.getTime()) / msPerDay);
}

// ─── Report period label ──────────────────────────────────────────────────────
// Used by RBI return and MIS report generators.

/**
 * Returns "April 2026" style label for a given year + month.
 */
export function monthLabel(year: number, month: number): string {
    const MONTHS = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December',
    ];
    return `${MONTHS[month - 1]} ${year}`;
}

/**
 * Parses a YYYYMM string (used by RBI return endpoint ?month=202604)
 * into { year, month } numbers. Returns null if invalid.
 */
export function parseYearMonth(value: string): { year: number; month: number } | null {
    if (!/^\d{6}$/.test(value)) return null;
    const year = parseInt(value.slice(0, 4), 10);
    const month = parseInt(value.slice(4, 6), 10);
    if (month < 1 || month > 12) return null;
    return { year, month };
}
