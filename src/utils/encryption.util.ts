// src/utils/encryption.util.ts
//
// Field-level encryption helpers and PII masking utilities.
//
// The actual AES-256-GCM / KMS encryption lives in src/providers/encryption/.
// This util provides:
//   1. Masking helpers  — display-safe versions of PAN, Aadhaar, phone, bank AC
//   2. One-way hashing  — SHA-256 fingerprints for dedup / lookup without decrypting
//   3. HMAC helpers     — webhook signature verification (Razorpay, Signzy)
//
// maskPan() and aadhaarLast4() are currently duplicated in kyc.service.ts and
// agents.service.ts. Centralise here and remove the local copies from those files.
//
// CRITICAL:
//   - NEVER log the plaintext of PAN, Aadhaar, or phone numbers.
//   - NEVER store plaintext PII in the database — use getEncryptionProvider().
//   - Masking is for DISPLAY only — masked values cannot be decrypted.

import crypto from 'crypto';

// ─── PAN masking ──────────────────────────────────────────────────────────────
// ABCDE1234F → ABCDE****F
// RBI KYC guidelines require masking middle 4 characters for display.

export function maskPan(pan: string): string {
    if (!pan || pan.length !== 10) return '**********';
    return pan.slice(0, 5) + '****' + pan.slice(-1);
}

// ─── Aadhaar masking ──────────────────────────────────────────────────────────
// 123456789012 → XXXX XXXX 9012
// UIDAI mandates showing only last 4 digits on all display surfaces.

export function maskAadhaar(aadhaar: string): string {
    const digits = aadhaar.replace(/\D/g, '');
    if (digits.length !== 12) return 'XXXX XXXX XXXX';
    return `XXXX XXXX ${digits.slice(-4)}`;
}

export function aadhaarLast4(aadhaar: string): string {
    const digits = aadhaar.replace(/\D/g, '');
    if (digits.length !== 12) return '****';
    return digits.slice(-4);
}

// ─── Phone masking ────────────────────────────────────────────────────────────
// +919876543210 → +91 98765 **210  (last 3 visible for support reference)

export function maskPhone(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 10) return '**********';
    const last3 = digits.slice(-3);
    const first5 = digits.slice(-10, -5);
    return `+91 ${first5} **${last3}`;
}

// ─── Bank account masking ─────────────────────────────────────────────────────
// 1234567890123456 → ************3456  (last 4 digits visible)

export function maskBankAccount(accountNumber: string): string {
    const digits = accountNumber.replace(/\D/g, '');
    if (digits.length < 4) return '****';
    return '*'.repeat(digits.length - 4) + digits.slice(-4);
}

// ─── Email masking ────────────────────────────────────────────────────────────
// arjun@example.com → a***n@example.com

export function maskEmail(email: string): string {
    const atIdx = email.indexOf('@');
    if (atIdx < 0) return '***@***.***';
    const local = email.slice(0, atIdx);
    const domain = email.slice(atIdx);
    if (local.length <= 2) return `${local[0]}***${domain}`;
    return `${local[0]}${'*'.repeat(local.length - 2)}${local.slice(-1)}${domain}`;
}

// ─── One-way SHA-256 fingerprint ──────────────────────────────────────────────
// Used to create a deterministic dedup key from PAN or phone without storing
// the plaintext. The same input always produces the same hash — useful for
// duplicate application detection.
//
// NEVER use this as a security primitive for passwords — use bcrypt for that.
// This is purely for deterministic lookup / dedup.

export function sha256Fingerprint(value: string): string {
    return crypto.createHash('sha256').update(value.trim().toUpperCase()).digest('hex');
}

// ─── HMAC-SHA256 (webhook signature verification) ─────────────────────────────
// Constant-time comparison prevents timing oracle attacks.
// Used by webhooks.service.ts for Razorpay and Signzy callbacks.

export function hmacSha256(secret: string, data: string): string {
    return crypto
        .createHmac('sha256', secret)
        .update(data)
        .digest('hex');
}

export function constantTimeEqual(a: string, b: string): boolean {
    try {
        const bufA = Buffer.from(a, 'hex');
        const bufB = Buffer.from(b, 'hex');
        if (bufA.length !== bufB.length) return false;
        return crypto.timingSafeEqual(bufA, bufB);
    } catch {
        return false;
    }
}

// ─── Safe log sanitiser ───────────────────────────────────────────────────────
// Strips known PII fields from an object before it reaches the logger.
// Pass any request body or service input through this before log.debug().
//
// Usage: log.debug('loan apply', sanitiseForLog(body))

const PII_FIELDS = new Set([
    'pan', 'panNumber', 'aadhaar', 'aadhaarNumber',
    'phone', 'phoneNumber', 'mobile', 'mobileNumber',
    'accountNumber', 'bankAccount', 'ifsc',
    'email', 'password', 'otp', 'token',
    'signerAadhaar', 'documentBase64', 'document',
]);

export function sanitiseForLog(obj: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
        if (PII_FIELDS.has(key)) {
            result[key] = '[REDACTED]';
        } else if (value && typeof value === 'object' && !Array.isArray(value)) {
            result[key] = sanitiseForLog(value as Record<string, unknown>);
        } else {
            result[key] = value;
        }
    }
    return result;
}