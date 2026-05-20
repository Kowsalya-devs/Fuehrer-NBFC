// src/utils/phoneNumber.util.ts
//
// Indian phone number utilities.
//
// normalisePhone() lives in src/types/common.types.ts alongside the other
// string helpers. This util re-exports it and adds format validators, display
// formatters, and OTP generation used by the auth and notifications modules.
//
// All phone numbers in this system use E.164 format internally: +91XXXXXXXXXX
// This is the format stored in the database, sent to Twilio/MSG91, and
// expected by the JWT payload. Conversion from user input happens at the
// controller/middleware boundary — never inside services.

export { normalisePhone } from '@/types/common.types';

// ─── Validation ───────────────────────────────────────────────────────────────

/**
 * Returns true if the string is a valid Indian mobile number in any format:
 *   9876543210  |  09876543210  |  919876543210  |  +919876543210
 * Valid Indian mobile numbers start with 6, 7, 8, or 9.
 */
export function isValidIndianPhone(raw: string): boolean {
    const digits = raw.replace(/\D/g, '');

    if (digits.length === 10) return /^[6-9]\d{9}$/.test(digits);
    if (digits.length === 11) return digits.startsWith('0') && /^[6-9]\d{9}$/.test(digits.slice(1));
    if (digits.length === 12) return digits.startsWith('91') && /^[6-9]\d{9}$/.test(digits.slice(2));
    if (digits.length === 13) return digits.startsWith('091') && /^[6-9]\d{9}$/.test(digits.slice(3));

    return false;
}

/**
 * Returns true if the value is already in E.164 format: +91XXXXXXXXXX
 * Used to assert before passing to SMS provider or storing in DB.
 */
export function isE164(phone: string): boolean {
    return /^\+91[6-9]\d{9}$/.test(phone);
}

// ─── Formatting ───────────────────────────────────────────────────────────────

/**
 * Formats E.164 number for display: +91 98765 43210
 * Used in admin dashboard and email templates — never in DB or API responses.
 */
export function formatPhoneDisplay(e164: string): string {
    if (!isE164(e164)) return e164;
    const digits = e164.slice(3); // strip +91
    return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
}

/**
 * Strips +91 prefix and returns the 10-digit local number.
 * Used when Twilio/MSG91 requires the number without country code.
 */
export function toLocalPhone(e164: string): string {
    if (e164.startsWith('+91')) return e164.slice(3);
    if (e164.startsWith('91') && e164.length === 12) return e164.slice(2);
    return e164;
}

// ─── OTP generation ───────────────────────────────────────────────────────────
// Cryptographically random 6-digit OTP.
// Uses crypto.randomInt (Node 14.10+) for uniform distribution — Math.random()
// is not suitable for security-sensitive values.

import crypto from 'crypto';

const OTP_LENGTH = 6;
const OTP_MIN = 100_000;   // smallest 6-digit number
const OTP_MAX = 999_999;   // largest 6-digit number

/**
 * Generates a cryptographically random 6-digit OTP string.
 * Always returns exactly 6 digits (zero-padded if needed, though statistically
 * near-impossible for a 6-digit range).
 */
export function generateOtp(): string {
    const value = crypto.randomInt(OTP_MIN, OTP_MAX + 1);
    return value.toString().padStart(OTP_LENGTH, '0');
}

/**
 * Returns the Redis TTL in seconds for an OTP.
 * Default: 5 minutes (300 seconds) — matches the API documentation.
 */
export const OTP_TTL_SECONDS = 300;

/**
 * Redis key for storing an OTP against a phone number.
 * Pattern: otp:+919876543210
 */
export function otpRedisKey(phone: string): string {
    return `otp:${phone}`;
}

/**
 * Redis key for tracking OTP attempt count against a phone number.
 * Pattern: otp_attempts:+919876543210
 */
export function otpAttemptsKey(phone: string): string {
    return `otp_attempts:${phone}`;
}