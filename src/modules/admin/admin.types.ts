// src/modules/admin/admin.types.ts
import type { Role } from '@/config/constants';
import type { SortOrder } from '@/types/common.types';

// ─── Admin user ───────────────────────────────────────────────────────────────
// Staff who access the internal platform (not customers or agents)

export interface AdminUser {
    id: string;
    fullName: string;
    email: string;
    phone: string;
    role: Role;
    status: AdminUserStatus;
    department: string | null;
    lastLoginAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export type AdminUserStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';

// ─── System configuration ─────────────────────────────────────────────────────
// Runtime configuration that can be changed without a deployment.
// Stored in the DB, cached in Redis.

export interface SystemConfig {
    key: string;
    value: string;
    description: string;
    updatedBy: string;
    updatedAt: Date;
}

export type ConfigKey =
    | 'MAX_LOAN_AMOUNT'
    | 'MIN_LOAN_AMOUNT'
    | 'MAX_TENURE_MONTHS'
    | 'MIN_TENURE_MONTHS'
    | 'MIN_CREDIT_SCORE'
    | 'NPA_OVERDUE_DAYS'
    | 'MAX_FOIR'
    | 'DEFAULT_INTEREST_RATE'
    | 'PROCESSING_FEE_RATE'
    | 'AGENT_COMMISSION_RATE'
    | 'ENACH_RETRY_LIMIT'
    | 'KYC_PROVIDER'
    | 'SMS_PROVIDER'
    | 'MAINTENANCE_MODE'
    | 'MAINTENANCE_MESSAGE';

// ─── Operational override ─────────────────────────────────────────────────────

export interface OperationalOverride {
    id: string;
    targetType: string;   // 'loan' | 'kyc' | 'payment' | 'agent'
    targetId: string;
    action: string;
    reason: string;
    performedBy: string;
    performedAt: Date;
    metadata: Record<string, unknown> | null;
}

// ─── Dashboard summary ────────────────────────────────────────────────────────

export interface AdminDashboard {
    platform: PlatformStats;
    today: TodayStats;
    alerts: SystemAlert[];
}

export interface PlatformStats {
    totalUsers: number;
    activeLoans: number;
    totalDisbursed: number;
    totalOutstanding: number;
    npaRate: number;
    activeMandates: number;
    pendingApplications: number;
    pendingKyc: number;
}

export interface TodayStats {
    newApplications: number;
    approvals: number;
    rejections: number;
    disbursements: number;
    paymentsReceived: number;
    paymentsAmount: number;
    newNpa: number;
}

export interface SystemAlert {
    severity: 'INFO' | 'WARN' | 'CRITICAL';
    category: string;
    message: string;
    count: number;
    link?: string;
}

// ─── Inputs ───────────────────────────────────────────────────────────────────

export interface CreateAdminUserInput {
    fullName: string;
    email: string;
    phone: string;
    role: Role;
    department: string;
}

export interface UpdateAdminUserInput {
    fullName?: string;
    department?: string;
    status?: AdminUserStatus;
}

export interface UpdateSystemConfigInput {
    key: ConfigKey;
    value: string;
    updatedBy: string;
}

export interface ListAdminUsersInput {
    role?: Role;
    status?: AdminUserStatus;
    search?: string;
    page: number;
    limit: number;
    sortOrder?: SortOrder;
}

// ─── Response shapes ──────────────────────────────────────────────────────────

export interface AdminUserResponse {
    id: string;
    fullName: string;
    email: string;
    phone: string;
    role: Role;
    status: AdminUserStatus;
    department: string | null;
    lastLoginAt: Date | null;
    createdAt: Date;
}