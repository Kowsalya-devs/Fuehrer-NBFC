// src/constants/npa.constants.ts
//
// NPA (Non-Performing Asset) and collections constants.
//
// All threshold values derive from:
//   - RBI Master Direction – Non-Banking Financial Company (NBFC) – 2023
//   - RBI Prudential Norms on Income Recognition, Asset Classification
//     and Provisioning (IRACP)
//
// DPD = Days Past Due (days since earliest unpaid EMI due date)
// NPA threshold: 90 DPD for NBFCs (same as banks post-2022 harmonisation)

import { BUSINESS_RULES, CRON_SCHEDULE } from '@/config/constants';

// ─── Core NPA thresholds ──────────────────────────────────────────────────────

/** Days past due before placing account on NPA watch list */
export const NPA_WATCH_TRIGGER_DAYS = 30;

/** Days past due before declaring account NPA (RBI NBFC norm) */
export const NPA_DECLARE_TRIGGER_DAYS = BUSINESS_RULES.NPA_TRIGGER_DAYS; // 90

/** Days past due before writing off the account */
export const WRITE_OFF_TRIGGER_DAYS = BUSINESS_RULES.WRITE_OFF_TRIGGER_DAYS; // 180

// Legacy alias used by existing constants/index.ts stub
export const NPA_DAYS = {
    WATCH_TRIGGER: NPA_WATCH_TRIGGER_DAYS,
    DECLARE_TRIGGER: NPA_DECLARE_TRIGGER_DAYS,
    WRITE_OFF: WRITE_OFF_TRIGGER_DAYS,
} as const;

// ─── DPD bucket classification ────────────────────────────────────────────────
// Standard RBI asset classification buckets.
// Used by collections module for case prioritisation and MIS reports.

export const DPD_BUCKETS = {
    CURRENT: { min: 0, max: 0, label: 'Current' },
    BUCKET_1: { min: 1, max: 30, label: '1–30 DPD' },
    BUCKET_2: { min: 31, max: 60, label: '31–60 DPD' },
    BUCKET_3: { min: 61, max: 90, label: '61–90 DPD' },
    NPA: { min: 91, max: 180, label: '90+ DPD (NPA)' },
    WRITTEN_OFF: { min: 181, max: Infinity, label: '180+ DPD (Write-off)' },
} as const;

export type DpdBucketKey = keyof typeof DPD_BUCKETS;

/**
 * Classifies an account into a DPD bucket based on days past due.
 * Matches the classifyDpd() function in collections.types.ts.
 * Import from here in new code — single source of truth.
 */
export function classifyDpd(overdueDays: number): DpdBucketKey {
    if (overdueDays <= 0) return 'CURRENT';
    if (overdueDays <= 30) return 'BUCKET_1';
    if (overdueDays <= 60) return 'BUCKET_2';
    if (overdueDays <= 90) return 'BUCKET_3';
    if (overdueDays <= 180) return 'NPA';
    return 'WRITTEN_OFF';
}

/**
 * Returns the display label for a DPD bucket.
 * Used in admin dashboard and MIS reports.
 */
export function getDpdLabel(overdueDays: number): string {
    const bucket = classifyDpd(overdueDays);
    return DPD_BUCKETS[bucket].label;
}

// ─── NPA watch cron schedule ──────────────────────────────────────────────────

/** node-cron expression — Daily 1:00 AM IST (low traffic window) */
export const CRON_NPA_WATCH = CRON_SCHEDULE.NPA_WATCH;

// ─── Provisioning rates ───────────────────────────────────────────────────────
// RBI-mandated minimum provisioning on outstanding principal by DPD bucket.
// Used by portfolio MIS report to calculate provision requirement.

export const PROVISIONING_RATES: Record<DpdBucketKey, number> = {
    CURRENT: 0.000,  // 0%   — standard assets
    BUCKET_1: 0.000,  // 0%   — within 30 DPD, no provision required
    BUCKET_2: 0.100,  // 10%  — 31–60 DPD (sub-standard)
    BUCKET_3: 0.200,  // 20%  — 61–90 DPD (sub-standard, near NPA)
    NPA: 0.500,  // 50%  — NPA doubtful assets
    WRITTEN_OFF: 1.000,  // 100% — loss assets, fully provided
} as const;

/**
 * Calculates the minimum RBI provision amount for an outstanding balance.
 */
export function calculateProvision(
    outstandingBalance: number,
    overdueDays: number,
): number {
    const bucket = classifyDpd(overdueDays);
    const rate = PROVISIONING_RATES[bucket];
    return Math.ceil(outstandingBalance * rate * 100) / 100;
}

// ─── Collection escalation thresholds ────────────────────────────────────────
// At these DPD thresholds the collection case is automatically escalated
// to the next team level.

export const COLLECTION_ESCALATION = {
    /** DPD at which case moves from field agent to senior collections */
    SENIOR_ESCALATION_DPD: 45,
    /** DPD at which case moves to legal / recovery team */
    LEGAL_ESCALATION_DPD: 75,
    /** DPD at which loan is marked NPA and case transferred to NPA desk */
    NPA_DESK_DPD: NPA_DECLARE_TRIGGER_DAYS,
} as const;

// ─── NPA recovery interest rate ───────────────────────────────────────────────
// Penal interest continues accruing on NPA accounts until settled.

export const NPA_PENAL_RATE_PA = BUSINESS_RULES.EMI_OVERDUE_PENALTY_RATE; // 24% p.a.
