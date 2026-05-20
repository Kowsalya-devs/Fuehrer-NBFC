// src/modules/agents/agents.repository.ts
import { prisma } from '@/config/database';
import { withTransaction } from '@/config/database';
import { createModuleLogger } from '@/config/logger';
import {
    AGENT_STATUS,
    COMMISSION_STATUS,
} from '@/config/constants';
import type { AgentStatus, CommissionStatus } from '@/config/constants';
import {
    toNumber,
    toPrismaPage,
    buildPaginationMeta,
} from '@/types/common.types';
import type { PaginatedResult } from '@/types/common.types';
import { NotFoundError } from '@/errors';
import type {
    AgentProfile,
    AgentCommission,
    CommissionPayout,
    ListAgentsInput,
    ListCommissionsInput,
} from './agents.types';
import type { Rupees } from '@/types/common.types';

const log = createModuleLogger('agents.repository');

// ─── Mappers ───────────────────────────────────────────────────────────────────

function mapAgent(row: Record<string, unknown>): AgentProfile {
    return {
        id: row.id as string,
        userId: row.user_id as string,
        agentCode: row.agent_code as string,
        fullName: row.full_name as string,
        phone: row.phone as string,
        email: row.email as string | null,
        shopName: row.shop_name as string,
        shopAddress: row.shop_address as string,
        shopCity: row.shop_city as string,
        shopPincode: row.shop_pincode as string,
        bankAccountNo: row.bank_account_no as string,
        bankIfsc: row.bank_ifsc as string,
        bankAccountName: row.bank_account_name as string,
        status: row.status as AgentStatus,
        commissionRate: toNumber(row.commission_rate as number),
        panNumber: row.pan_number as string | null,
        aadhaarLast4: row.aadhaar_last4 as string | null,
        suspensionReason: row.suspension_reason as string | null,
        onboardedAt: row.onboarded_at as Date,
        createdAt: row.created_at as Date,
        updatedAt: row.updated_at as Date,
    };
}

function mapCommission(row: Record<string, unknown>): AgentCommission {
    return {
        id: row.id as string,
        agentId: row.agent_id as string,
        loanAccountId: row.loan_account_id as string,
        userId: row.user_id as string,
        commissionAmount: toNumber(row.commission_amount as number),
        status: row.status as CommissionStatus,
        clawbackEligibleUntil: row.clawback_eligible_until as Date,
        clawbackReason: row.clawback_reason as string | null,
        clawedBackAt: row.clawed_back_at as Date | null,
        payoutId: row.payout_id as string | null,
        earnedAt: row.earned_at as Date,
        paidAt: row.paid_at as Date | null,
        createdAt: row.created_at as Date,
        updatedAt: row.updated_at as Date,
    };
}

// ─── Agent code generator ──────────────────────────────────────────────────────

async function generateAgentCode(): Promise<string> {
    const year = new Date().getFullYear();
    const result = await prisma.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(*)::bigint AS count
    FROM agents
    WHERE EXTRACT(YEAR FROM created_at) = ${year}
  `;
    const seq = Number(result[0]!.count) + 1;
    return `AGT-${year}-${String(seq).padStart(6, '0')}`;
}

// ─── Repository ────────────────────────────────────────────────────────────────

export const agentsRepository = {

    // ── Agent CRUD ────────────────────────────────────────────────────────────

    async create(data: {
        userId: string;
        fullName: string;
        phone: string;
        email: string | null;
        shopName: string;
        shopAddress: string;
        shopCity: string;
        shopPincode: string;
        bankAccountNo: string;   // Already masked before storage
        bankIfsc: string;
        bankAccountName: string;
        panNumber: string;   // Masked: ABCDE****F
        aadhaarLast4: string;
        commissionRate: number;
    }): Promise<AgentProfile> {
        const agentCode = await generateAgentCode();

        const row = await prisma.agents.create({
            data: {
                user_id: data.userId,
                agent_code: agentCode,
                full_name: data.fullName,
                phone: data.phone,
                email: data.email,
                shop_name: data.shopName,
                shop_address: data.shopAddress,
                shop_city: data.shopCity,
                shop_pincode: data.shopPincode,
                bank_account_no: data.bankAccountNo,
                bank_ifsc: data.bankIfsc,
                bank_account_name: data.bankAccountName,
                status: AGENT_STATUS.PENDING,
                commission_rate: data.commissionRate,
                pan_number: data.panNumber,
                aadhaar_last4: data.aadhaarLast4,
                onboarded_at: new Date(),
                created_at: new Date(),
                updated_at: new Date(),
            },
        });

        log.info('Agent created', {
            agentId: row.id,
            agentCode,
            userId: data.userId,
        });

        return mapAgent(row as unknown as Record<string, unknown>);
    },

    async findById(id: string): Promise<AgentProfile | null> {
        const row = await prisma.agents.findUnique({ where: { id } });
        return row ? mapAgent(row as unknown as Record<string, unknown>) : null;
    },

    async findByIdOrThrow(id: string): Promise<AgentProfile> {
        const agent = await this.findById(id);
        if (!agent) throw new NotFoundError('Agent', id);
        return agent;
    },

    async findByUserId(userId: string): Promise<AgentProfile | null> {
        const row = await prisma.agents.findFirst({ where: { user_id: userId } });
        return row ? mapAgent(row as unknown as Record<string, unknown>) : null;
    },

    async findByPhone(phone: string): Promise<AgentProfile | null> {
        const row = await prisma.agents.findFirst({ where: { phone } });
        return row ? mapAgent(row as unknown as Record<string, unknown>) : null;
    },

    async findByAgentCode(agentCode: string): Promise<AgentProfile | null> {
        const row = await prisma.agents.findFirst({ where: { agent_code: agentCode } });
        return row ? mapAgent(row as unknown as Record<string, unknown>) : null;
    },

    async update(
        id: string,
        data: Partial<{
            shopName: string;
            shopAddress: string;
            shopCity: string;
            shopPincode: string;
            email: string;
            bankAccountNo: string;
            bankIfsc: string;
            bankAccountName: string;
        }>,
    ): Promise<AgentProfile> {
        const updateData: Record<string, unknown> = { updated_at: new Date() };

        if (data.shopName) updateData.shop_name = data.shopName;
        if (data.shopAddress) updateData.shop_address = data.shopAddress;
        if (data.shopCity) updateData.shop_city = data.shopCity;
        if (data.shopPincode) updateData.shop_pincode = data.shopPincode;
        if (data.email) updateData.email = data.email;
        if (data.bankAccountNo) updateData.bank_account_no = data.bankAccountNo;
        if (data.bankIfsc) updateData.bank_ifsc = data.bankIfsc;
        if (data.bankAccountName) updateData.bank_account_name = data.bankAccountName;

        const row = await prisma.agents.update({ where: { id }, data: updateData });
        return mapAgent(row as unknown as Record<string, unknown>);
    },

    async updateStatus(
        id: string,
        status: AgentStatus,
        extra?: Record<string, unknown>,
    ): Promise<AgentProfile> {
        const row = await prisma.agents.update({
            where: { id },
            data: { status, ...extra, updated_at: new Date() },
        });
        return mapAgent(row as unknown as Record<string, unknown>);
    },

    async list(input: ListAgentsInput): Promise<PaginatedResult<AgentProfile>> {
        const where: Record<string, unknown> = {};

        if (input.status) where.status = input.status;
        if (input.shopCity) where.shop_city = input.shopCity;

        if (input.search) {
            where.OR = [
                { full_name: { contains: input.search, mode: 'insensitive' } },
                { agent_code: { contains: input.search, mode: 'insensitive' } },
                { phone: { contains: input.search } },
            ];
        }

        const sortColumnMap: Record<string, string> = {
            onboardedAt: 'onboarded_at',
            fullName: 'full_name',
            totalDisbursed: 'onboarded_at',  // Proxied — real sort needs a view
        };

        const orderBy = {
            [sortColumnMap[input.sortBy ?? 'onboardedAt'] ?? 'onboarded_at']:
                input.sortOrder ?? 'desc',
        };

        const [rows, total] = await prisma.$transaction([
            prisma.agents.findMany({
                where,
                orderBy,
                ...toPrismaPage({ page: input.page, limit: input.limit }),
            }),
            prisma.agents.count({ where }),
        ]);

        return {
            data: rows.map((r) => mapAgent(r as unknown as Record<string, unknown>)),
            pagination: buildPaginationMeta(input.page, input.limit, total),
        };
    },

    // ── Commission CRUD ───────────────────────────────────────────────────────

    async findCommissionById(id: string): Promise<AgentCommission | null> {
        const row = await prisma.agent_commissions.findUnique({ where: { id } });
        return row ? mapCommission(row as unknown as Record<string, unknown>) : null;
    },

    async findCommissionByIdOrThrow(id: string): Promise<AgentCommission> {
        const c = await this.findCommissionById(id);
        if (!c) throw new NotFoundError('Commission', id);
        return c;
    },

    async findCommissionByLoanAccount(
        loanAccountId: string,
    ): Promise<AgentCommission | null> {
        const row = await prisma.agent_commissions.findFirst({
            where: { loan_account_id: loanAccountId },
        });
        return row ? mapCommission(row as unknown as Record<string, unknown>) : null;
    },

    async listCommissions(
        input: ListCommissionsInput,
        agentId?: string,
    ): Promise<PaginatedResult<AgentCommission>> {
        const where: Record<string, unknown> = {};

        if (agentId) where.agent_id = agentId;
        if (input.agentId) where.agent_id = input.agentId;
        if (input.status) where.status = input.status;

        if (input.fromDate || input.toDate) {
            where.earned_at = {
                ...(input.fromDate ? { gte: input.fromDate } : {}),
                ...(input.toDate ? { lte: input.toDate } : {}),
            };
        }

        const [rows, total] = await prisma.$transaction([
            prisma.agent_commissions.findMany({
                where,
                orderBy: { earned_at: 'desc' },
                ...toPrismaPage({ page: input.page, limit: input.limit }),
            }),
            prisma.agent_commissions.count({ where }),
        ]);

        return {
            data: rows.map(
                (r) => mapCommission(r as unknown as Record<string, unknown>),
            ),
            pagination: buildPaginationMeta(input.page, input.limit, total),
        };
    },

    async updateCommissionStatus(
        id: string,
        status: CommissionStatus,
        extra?: Record<string, unknown>,
    ): Promise<AgentCommission> {
        const row = await prisma.agent_commissions.update({
            where: { id },
            data: { status, ...extra, updated_at: new Date() },
        });
        return mapCommission(row as unknown as Record<string, unknown>);
    },

    // ── Aggregate stats for dashboard ─────────────────────────────────────────

    async getCommissionStats(agentId: string): Promise<{
        totalEarned: Rupees;
        pendingAmount: Rupees;
        paidAmount: Rupees;
        clawedBack: Rupees;
    }> {
        const rows = await prisma.agent_commissions.groupBy({
            by: ['status'],
            where: { agent_id: agentId },
            _sum: { commission_amount: true },
        });

        const byStatus = Object.fromEntries(
            (rows as Array<{
                status: string;
                _sum: { commission_amount: number | null };
            }>).map((r) => [r.status, toNumber(r._sum.commission_amount ?? 0)]),
        );

        return {
            totalEarned: (byStatus[COMMISSION_STATUS.EARNED] ?? 0) +
                (byStatus[COMMISSION_STATUS.PAID] ?? 0),
            pendingAmount: byStatus[COMMISSION_STATUS.EARNED] ?? 0,
            paidAmount: byStatus[COMMISSION_STATUS.PAID] ?? 0,
            clawedBack: byStatus[COMMISSION_STATUS.CLAWED_BACK] ?? 0,
        };
    },

    async getLoanStats(agentId: string): Promise<{
        totalSubmitted: number;
        active: number;
        rejected: number;
        totalDisbursed: Rupees;
    }> {
        const [submitted, active, rejected, disbursed] =
            await prisma.$transaction([
                prisma.loan_applications.count({
                    where: { agent_id: agentId },
                }),
                prisma.loan_accounts.count({
                    where: {
                        loan_applications: { agent_id: agentId },
                        status: { in: ['ACTIVE', 'DISBURSED'] },
                    },
                }),
                prisma.loan_applications.count({
                    where: { agent_id: agentId, status: 'REJECTED' },
                }),
                prisma.loan_accounts.aggregate({
                    where: {
                        loan_applications: { agent_id: agentId },
                    },
                    _sum: { principal_amount: true },
                }),
            ]);

        return {
            totalSubmitted: submitted,
            active,
            rejected,
            totalDisbursed: toNumber(disbursed._sum.principal_amount ?? 0),
        };
    },

    // ── Pending commissions ready for payout ──────────────────────────────────

    async findEarnedCommissionsForAgent(
        agentId: string,
    ): Promise<AgentCommission[]> {
        const rows = await prisma.agent_commissions.findMany({
            where: {
                agent_id: agentId,
                status: COMMISSION_STATUS.EARNED,
                // Only include commissions past the clawback window
                clawback_eligible_until: { lt: new Date() },
            },
            orderBy: { earned_at: 'asc' },
        });
        return rows.map(
            (r) => mapCommission(r as unknown as Record<string, unknown>),
        );
    },

    // ── Payout batch ──────────────────────────────────────────────────────────

    async createPayoutBatch(data: {
        agentId: string;
        totalAmount: Rupees;
        commissionIds: string[];
    }): Promise<CommissionPayout> {
        return withTransaction(async (tx) => {
            const payout = await tx.commission_payouts.create({
                data: {
                    agent_id: data.agentId,
                    total_amount: data.totalAmount,
                    commission_ids: data.commissionIds,
                    status: 'PENDING',
                    created_at: new Date(),
                    updated_at: new Date(),
                },
            });

            // Mark all included commissions as PAID
            await tx.agent_commissions.updateMany({
                where: { id: { in: data.commissionIds } },
                data: {
                    status: COMMISSION_STATUS.PAID,
                    payout_id: payout.id as string,
                    paid_at: new Date(),
                    updated_at: new Date(),
                },
            });

            return {
                id: payout.id as string,
                agentId: payout.agent_id as string,
                totalAmount: toNumber(payout.total_amount as number),
                commissionIds: data.commissionIds,
                utrNumber: null,
                status: 'PENDING',
                processedAt: null,
                createdAt: payout.created_at as Date,
            };
        });
    },

    async updatePayoutStatus(
        id: string,
        status: 'PROCESSED' | 'FAILED',
        utrNumber?: string,
    ): Promise<void> {
        await prisma.commission_payouts.update({
            where: { id },
            data: {
                status,
                utr_number: utrNumber ?? null,
                processed_at: status === 'PROCESSED' ? new Date() : null,
                updated_at: new Date(),
            },
        });
    },
};