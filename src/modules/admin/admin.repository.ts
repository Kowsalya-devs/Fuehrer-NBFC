// src/modules/admin/admin.repository.ts
import { prisma } from '@/config/database';
import { getRedisClient } from '@/config/redis';
import { createModuleLogger } from '@/config/logger';
import type { Role } from '@/config/constants';
import {
    toNumber,
    toPrismaPage,
    buildPaginationMeta,
} from '@/types/common.types';
import type { PaginatedResult } from '@/types/common.types';
import { NotFoundError } from '@/errors';
import type {
    AdminUser,
    AdminUserStatus,
    SystemConfig,
    ConfigKey,
    OperationalOverride,
    ListAdminUsersInput,
    PlatformStats,
    TodayStats,
} from './admin.types';

const log = createModuleLogger('admin.repository');
const CONFIG_CACHE_TTL = 5 * 60;  // 5 minutes
const CONFIG_KEY = (k: string) => `admin:config:${k}`;

// ─── Mappers ──────────────────────────────────────────────────────────────────

function mapAdminUser(row: Record<string, unknown>): AdminUser {
    return {
        id: row.id as string,
        fullName: row.full_name as string,
        email: row.email as string,
        phone: row.phone as string,
        role: row.role as Role,
        status: row.status as AdminUserStatus,
        department: row.department as string | null,
        lastLoginAt: row.last_login_at as Date | null,
        createdAt: row.created_at as Date,
        updatedAt: row.updated_at as Date,
    };
}

function mapConfig(row: Record<string, unknown>): SystemConfig {
    return {
        key: row.key as string,
        value: row.value as string,
        description: row.description as string,
        updatedBy: row.updated_by as string,
        updatedAt: row.updated_at as Date,
    };
}

// ─── Repository ────────────────────────────────────────────────────────────────

export const adminRepository = {

    // ── Admin users ───────────────────────────────────────────────────────────

    async createAdminUser(data: {
        fullName: string;
        email: string;
        phone: string;
        role: Role;
        department: string;
    }): Promise<AdminUser> {
        const row = await prisma.admin_users.create({
            data: {
                full_name: data.fullName,
                email: data.email,
                phone: data.phone,
                role: data.role,
                status: 'ACTIVE',
                department: data.department,
                created_at: new Date(),
                updated_at: new Date(),
            },
        });
        return mapAdminUser(row as unknown as Record<string, unknown>);
    },

    async findAdminUserById(id: string): Promise<AdminUser | null> {
        const row = await prisma.admin_users.findUnique({ where: { id } });
        return row ? mapAdminUser(row as unknown as Record<string, unknown>) : null;
    },

    async findAdminUserByIdOrThrow(id: string): Promise<AdminUser> {
        const u = await this.findAdminUserById(id);
        if (!u) throw new NotFoundError('Admin user', id);
        return u;
    },

    async findAdminUserByEmail(email: string): Promise<AdminUser | null> {
        const row = await prisma.admin_users.findFirst({ where: { email } });
        return row ? mapAdminUser(row as unknown as Record<string, unknown>) : null;
    },

    async listAdminUsers(
        input: ListAdminUsersInput,
    ): Promise<PaginatedResult<AdminUser>> {
        const where: Record<string, unknown> = {};
        if (input.role) where.role = input.role;
        if (input.status) where.status = input.status;
        if (input.search) {
            where.OR = [
                { full_name: { contains: input.search, mode: 'insensitive' } },
                { email: { contains: input.search, mode: 'insensitive' } },
                { phone: { contains: input.search } },
            ];
        }

        const [rows, total] = await prisma.$transaction([
            prisma.admin_users.findMany({
                where,
                orderBy: { created_at: input.sortOrder ?? 'desc' },
                ...toPrismaPage({ page: input.page, limit: input.limit }),
            }),
            prisma.admin_users.count({ where }),
        ]);

        return {
            data: rows.map((r) => mapAdminUser(r as unknown as Record<string, unknown>)),
            pagination: buildPaginationMeta(input.page, input.limit, total),
        };
    },

    async updateAdminUser(
        id: string,
        data: Partial<{
            fullName: string;
            department: string;
            status: AdminUserStatus;
        }>,
    ): Promise<AdminUser> {
        const update: Record<string, unknown> = { updated_at: new Date() };
        if (data.fullName !== undefined) update.full_name = data.fullName;
        if (data.department !== undefined) update.department = data.department;
        if (data.status !== undefined) update.status = data.status;

        const row = await prisma.admin_users.update({
            where: { id },
            data: update,
        });
        return mapAdminUser(row as unknown as Record<string, unknown>);
    },

    async updateLastLogin(id: string): Promise<void> {
        await prisma.admin_users.update({
            where: { id },
            data: { last_login_at: new Date(), updated_at: new Date() },
        });
    },

    // ── System configuration ──────────────────────────────────────────────────

    async getAllConfigs(): Promise<SystemConfig[]> {
        const rows = await prisma.system_config.findMany({
            orderBy: { key: 'asc' },
        });
        return rows.map((r) => mapConfig(r as unknown as Record<string, unknown>));
    },

    async getConfig(key: ConfigKey): Promise<SystemConfig | null> {
        // Check Redis cache first
        const redis = getRedisClient();
        const cached = await redis.get(CONFIG_KEY(key)).catch(() => null);
        if (cached) {
            return JSON.parse(cached) as SystemConfig;
        }

        const row = await prisma.system_config.findUnique({ where: { key } });
        if (!row) return null;

        const config = mapConfig(row as unknown as Record<string, unknown>);

        // Cache for 5 minutes
        await redis.setex(
            CONFIG_KEY(key),
            CONFIG_CACHE_TTL,
            JSON.stringify(config),
        ).catch(() => { });

        return config;
    },

    async upsertConfig(
        key: ConfigKey,
        value: string,
        description: string,
        updatedBy: string,
    ): Promise<SystemConfig> {
        const row = await prisma.system_config.upsert({
            where: { key },
            update: {
                value,
                updated_by: updatedBy,
                updated_at: new Date(),
            },
            create: {
                key,
                value,
                description,
                updated_by: updatedBy,
                updated_at: new Date(),
            },
        });

        // Invalidate Redis cache
        const redis = getRedisClient();
        await redis.del(CONFIG_KEY(key)).catch(() => { });

        return mapConfig(row as unknown as Record<string, unknown>);
    },

    // ── Operational overrides ─────────────────────────────────────────────────

    async logOverride(data: {
        targetType: string;
        targetId: string;
        action: string;
        reason: string;
        performedBy: string;
        metadata?: Record<string, unknown>;
    }): Promise<OperationalOverride> {
        const row = await prisma.operational_overrides.create({
            data: {
                target_type: data.targetType,
                target_id: data.targetId,
                action: data.action,
                reason: data.reason,
                performed_by: data.performedBy,
                performed_at: new Date(),
                metadata: data.metadata
                    ? JSON.stringify(data.metadata) : null,
            },
        });

        return {
            id: row.id as string,
            targetType: row.target_type as string,
            targetId: row.target_id as string,
            action: row.action as string,
            reason: row.reason as string,
            performedBy: row.performed_by as string,
            performedAt: row.performed_at as Date,
            metadata: row.metadata
                ? JSON.parse(row.metadata as string) as Record<string, unknown>
                : null,
        };
    },

    // ── Dashboard stats ───────────────────────────────────────────────────────

    async getPlatformStats(): Promise<PlatformStats> {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const [
            totalUsers,
            loanStats,
            pendingApps,
            pendingKyc,
            activeMandates,
        ] = await prisma.$transaction([

            prisma.users.count(),

            prisma.loan_accounts.aggregate({
                _count: { id: true },
                _sum: {
                    principal_amount: true,
                    outstanding_balance: true,
                },
                where: { status: { in: ['ACTIVE', 'DISBURSED'] } },
            }),

            prisma.loan_applications.count({
                where: { status: { in: ['KYC_PENDING', 'UNDERWRITING', 'PENDING_APPROVAL'] } },
            }),

            prisma.kyc_documents.count({
                where: { overall_status: { in: ['IN_PROGRESS', 'NOT_STARTED'] } },
            }),

            prisma.enach_mandates.count({
                where: { status: 'ACTIVE' },
            }),
        ]);

        const npaLoans = await prisma.loan_accounts.aggregate({
            where: { status: 'NPA' },
            _sum: { outstanding_balance: true },
        });

        const outstanding = toNumber(loanStats._sum.outstanding_balance ?? 0);
        const npaAmount = toNumber(npaLoans._sum.outstanding_balance ?? 0);
        const npaRate = outstanding > 0
            ? Math.round((npaAmount / outstanding) * 10000) / 100
            : 0;

        return {
            totalUsers,
            activeLoans: loanStats._count.id,
            totalDisbursed: toNumber(loanStats._sum.principal_amount ?? 0),
            totalOutstanding: outstanding,
            npaRate,
            activeMandates,
            pendingApplications: pendingApps,
            pendingKyc,
        };
    },

    async getTodayStats(): Promise<TodayStats> {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);

        const [
            newApps,
            approvals,
            rejections,
            disbursements,
            payments,
            newNpa,
        ] = await prisma.$transaction([

            prisma.loan_applications.count({
                where: { applied_at: { gte: today, lt: tomorrow } },
            }),

            prisma.loan_applications.count({
                where: {
                    status: 'APPROVED',
                    reviewed_at: { gte: today, lt: tomorrow },
                },
            }),

            prisma.loan_applications.count({
                where: {
                    status: 'REJECTED',
                    reviewed_at: { gte: today, lt: tomorrow },
                },
            }),

            prisma.loan_accounts.count({
                where: { disbursed_at: { gte: today, lt: tomorrow } },
            }),

            prisma.payments.aggregate({
                where: {
                    status: 'SUCCESS',
                    settled_at: { gte: today, lt: tomorrow },
                },
                _count: { id: true },
                _sum: { amount: true },
            }),

            prisma.loan_accounts.count({
                where: {
                    status: 'NPA',
                    updated_at: { gte: today, lt: tomorrow },
                },
            }),
        ]);

        return {
            newApplications: newApps,
            approvals,
            rejections,
            disbursements,
            paymentsReceived: payments._count.id,
            paymentsAmount: toNumber(payments._sum.amount ?? 0),
            newNpa,
        };
    },
};
