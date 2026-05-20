// src/modules/agents/agents.service.ts
import type { Request } from 'express';
import { agentsRepository } from './agents.repository';
import { agentEvents } from './agents.events';
import { getPaymentProvider } from '@/providers';
import { setAuditContext } from '@/middlewares';
import {
    AGENT_STATUS,
    COMMISSION_STATUS,
    AUDIT_ACTION,
    BUSINESS_RULES,
} from '@/config/constants';
import { roundRupees, toNumber } from '@/types/common.types';
import { createModuleLogger } from '@/config/logger';
import {
    CONFLICT_ERRORS,
    NotFoundError,
    AgentNotActiveError,
    CommissionClawbackError,
    ForbiddenError,
    DomainError,
} from '@/errors';
import type {
    AgentProfile,
    AgentDashboard,
    AgentProfileResponse,
    CommissionResponse,
    OnboardAgentInput,
    UpdateAgentInput,
    SuspendAgentInput,
    ListAgentsInput,
    ListCommissionsInput,
    ProcessPayoutInput,
} from './agents.types';

const log = createModuleLogger('agents.service');

// ─── Masking helpers ───────────────────────────────────────────────────────────

function maskAccountNumber(accountNo: string): string {
    // Keep only last 4 digits visible: XXXXXXXXXXXX1234
    return accountNo
        .slice(0, -4)
        .replace(/./g, 'X')
        .concat(accountNo.slice(-4));
}

function maskPan(pan: string): string {
    return pan.slice(0, 5) + '****' + pan.slice(-1);
}

// ─── Response shapers ──────────────────────────────────────────────────────────

function toProfileResponse(agent: AgentProfile): AgentProfileResponse {
    return {
        id: agent.id,
        agentCode: agent.agentCode,
        fullName: agent.fullName,
        phone: agent.phone,
        email: agent.email,
        shopName: agent.shopName,
        shopCity: agent.shopCity,
        status: agent.status,
        commissionRate: agent.commissionRate,
        panNumber: agent.panNumber,
        onboardedAt: agent.onboardedAt,
    };
}

function toCommissionResponse(c: {
    id: string;
    loanAccountId: string;
    commissionAmount: number;
    status: string;
    earnedAt: Date;
    paidAt: Date | null;
    clawbackReason: string | null;
    clawedBackAt: Date | null;
}): CommissionResponse {
    return {
        id: c.id,
        loanAccountId: c.loanAccountId,
        commissionAmount: toNumber(c.commissionAmount),
        status: c.status as CommissionResponse['status'],
        earnedAt: c.earnedAt,
        paidAt: c.paidAt,
        clawbackReason: c.clawbackReason,
        clawedBackAt: c.clawedBackAt,
    };
}

// ─── Service ───────────────────────────────────────────────────────────────────

export const agentsService = {

    // ── 1. Onboard agent ──────────────────────────────────────────────────────
    // Creates an agent in PENDING status — must be activated by ops before
    // they can submit loan applications.

    async onboardAgent(
        input: OnboardAgentInput,
        req: Request,
    ): Promise<AgentProfileResponse> {
        const {
            userId, fullName, phone, panNumber,
            aadhaarLast4, bankAccountNo, commissionRate,
            ...rest
        } = input;

        // Prevent duplicate agent for same phone
        const existingByPhone = await agentsRepository.findByPhone(phone);
        if (existingByPhone) {
            throw CONFLICT_ERRORS.duplicateAgent(phone);
        }

        // Prevent duplicate agent for same userId
        const existingByUser = await agentsRepository.findByUserId(userId);
        if (existingByUser) {
            throw new DomainError(
                'This user already has an agent profile',
                'DUPLICATE_AGENT_USER',
                { userId },
            );
        }

        const agent = await agentsRepository.create({
            userId,
            fullName,
            phone,
            email: input.email ?? null,
            shopName: rest.shopName,
            shopAddress: rest.shopAddress,
            shopCity: rest.shopCity,
            shopPincode: rest.shopPincode,
            // Mask sensitive data before storage
            bankAccountNo: maskAccountNumber(bankAccountNo),
            bankIfsc: input.bankIfsc,
            bankAccountName: input.bankAccountName,
            panNumber: maskPan(panNumber),
            aadhaarLast4,
            commissionRate: commissionRate ?? BUSINESS_RULES.AGENT_COMMISSION_RATE,
        });

        setAuditContext(req, {
            action: AUDIT_ACTION.AGENT_ONBOARDED,
            entityType: 'agents',
            entityId: agent.id,
            after: { agentCode: agent.agentCode, status: agent.status },
        });

        agentEvents.onboarded({
            agentId: agent.id,
            userId: agent.userId,
            shopName: agent.shopName,
            requestId: req.requestId,
        });

        log.info('Agent onboarded', {
            agentId: agent.id,
            agentCode: agent.agentCode,
            userId,
        });

        return toProfileResponse(agent);
    },

    // ── 2. Activate agent (ops executive approves onboarding) ────────────────

    async activateAgent(
        agentId: string,
        activatedBy: string,
        req: Request,
    ): Promise<AgentProfileResponse> {
        const agent = await agentsRepository.findByIdOrThrow(agentId);

        if (agent.status === AGENT_STATUS.ACTIVE) {
            return toProfileResponse(agent);
        }

        if (agent.status === AGENT_STATUS.TERMINATED) {
            throw new DomainError(
                'A terminated agent cannot be reactivated',
                'AGENT_TERMINATED',
                { agentId },
            );
        }

        const updated = await agentsRepository.updateStatus(
            agentId,
            AGENT_STATUS.ACTIVE,
        );

        setAuditContext(req, {
            action: AUDIT_ACTION.AGENT_ONBOARDED,
            entityType: 'agents',
            entityId: agentId,
            before: { status: agent.status },
            after: { status: AGENT_STATUS.ACTIVE },
            metadata: { activatedBy },
        });

        agentEvents.statusChanged({
            agentId,
            previousStatus: agent.status,
            currentStatus: AGENT_STATUS.ACTIVE,
            changedBy: activatedBy,
            requestId: req.requestId,
        });

        log.info('Agent activated', { agentId, activatedBy });
        return toProfileResponse(updated);
    },

    // ── 3. Suspend agent ──────────────────────────────────────────────────────

    async suspendAgent(
        input: SuspendAgentInput,
        req: Request,
    ): Promise<AgentProfileResponse> {
        const { agentId, suspendedBy, reason } = input;
        const agent = await agentsRepository.findByIdOrThrow(agentId);

        if (agent.status === AGENT_STATUS.SUSPENDED) {
            return toProfileResponse(agent);
        }
        if (agent.status === AGENT_STATUS.TERMINATED) {
            throw new DomainError(
                'A terminated agent cannot be suspended',
                'AGENT_TERMINATED',
                { agentId },
            );
        }

        const updated = await agentsRepository.updateStatus(
            agentId,
            AGENT_STATUS.SUSPENDED,
            { suspension_reason: reason },
        );

        setAuditContext(req, {
            action: AUDIT_ACTION.AGENT_SUSPENDED,
            entityType: 'agents',
            entityId: agentId,
            before: { status: agent.status },
            after: { status: AGENT_STATUS.SUSPENDED, reason },
            metadata: { suspendedBy },
        });

        agentEvents.statusChanged({
            agentId,
            previousStatus: agent.status,
            currentStatus: AGENT_STATUS.SUSPENDED,
            changedBy: suspendedBy,
            requestId: req.requestId,
        });

        log.warn('Agent suspended', { agentId, suspendedBy, reason });
        return toProfileResponse(updated);
    },

    // ── 4. Reactivate suspended agent ─────────────────────────────────────────

    async reactivateAgent(
        agentId: string,
        reactivatedBy: string,
        req: Request,
    ): Promise<AgentProfileResponse> {
        const agent = await agentsRepository.findByIdOrThrow(agentId);

        if (agent.status !== AGENT_STATUS.SUSPENDED) {
            throw new DomainError(
                `Only SUSPENDED agents can be reactivated. Current status: ${agent.status}`,
                'INVALID_REACTIVATION_STATE',
                { agentId, currentStatus: agent.status },
            );
        }

        const updated = await agentsRepository.updateStatus(
            agentId,
            AGENT_STATUS.ACTIVE,
            { suspension_reason: null },
        );

        agentEvents.statusChanged({
            agentId,
            previousStatus: AGENT_STATUS.SUSPENDED,
            currentStatus: AGENT_STATUS.ACTIVE,
            changedBy: reactivatedBy,
            requestId: req.requestId,
        });

        log.info('Agent reactivated', { agentId, reactivatedBy });
        return toProfileResponse(updated);
    },

    // ── 5. Terminate agent ────────────────────────────────────────────────────

    async terminateAgent(
        agentId: string,
        terminatedBy: string,
        reason: string,
        req: Request,
    ): Promise<AgentProfileResponse> {
        const agent = await agentsRepository.findByIdOrThrow(agentId);

        if (agent.status === AGENT_STATUS.TERMINATED) {
            return toProfileResponse(agent);
        }

        const updated = await agentsRepository.updateStatus(
            agentId,
            AGENT_STATUS.TERMINATED,
            { suspension_reason: reason },
        );

        agentEvents.statusChanged({
            agentId,
            previousStatus: agent.status,
            currentStatus: AGENT_STATUS.TERMINATED,
            changedBy: terminatedBy,
            requestId: req.requestId,
        });

        log.warn('Agent terminated', { agentId, terminatedBy, reason });
        return toProfileResponse(updated);
    },

    // ── 6. Update agent profile ────────────────────────────────────────────────

    async updateProfile(
        agentId: string,
        userId: string,
        role: string,
        input: UpdateAgentInput,
        req: Request,
    ): Promise<AgentProfileResponse> {
        const agent = await agentsRepository.findByIdOrThrow(agentId);

        // Agents can only update their own profile
        const staffRoles = new Set(['OPS_EXECUTIVE', 'SUPER_ADMIN']);
        if (!staffRoles.has(role) && agent.userId !== userId) {
            throw new ForbiddenError('You can only update your own profile');
        }

        // Mask bank account before storing if it's being updated
        const updateData = { ...input };
        if (updateData.bankAccountNo) {
            updateData.bankAccountNo = maskAccountNumber(updateData.bankAccountNo);
        }

        const updated = await agentsRepository.update(agentId, updateData);

        log.info('Agent profile updated', { agentId });
        return toProfileResponse(updated);
    },

    // ── 7. Get agent profile ───────────────────────────────────────────────────

    async getAgent(
        agentId: string,
        userId: string,
        role: string,
    ): Promise<AgentProfileResponse> {
        const agent = await agentsRepository.findByIdOrThrow(agentId);

        const staffRoles = new Set([
            'OPS_EXECUTIVE', 'CREDIT_MANAGER', 'FINANCE', 'SUPER_ADMIN',
        ]);
        if (!staffRoles.has(role) && agent.userId !== userId) {
            throw new ForbiddenError('You can only view your own agent profile');
        }

        return toProfileResponse(agent);
    },

    // ── 8. Get agent by userId (for token-decoded lookups) ────────────────────

    async getAgentByUserId(userId: string): Promise<AgentProfileResponse | null> {
        const agent = await agentsRepository.findByUserId(userId);
        return agent ? toProfileResponse(agent) : null;
    },

    // ── 9. List agents ─────────────────────────────────────────────────────────

    async listAgents(input: ListAgentsInput) {
        const result = await agentsRepository.list(input);
        return {
            ...result,
            data: result.data.map(toProfileResponse),
        };
    },

    // ── 10. Agent dashboard ────────────────────────────────────────────────────

    async getDashboard(
        agentId: string,
        userId: string,
        role: string,
    ): Promise<AgentDashboard> {
        const agent = await agentsRepository.findByIdOrThrow(agentId);

        const staffRoles = new Set(['OPS_EXECUTIVE', 'SUPER_ADMIN', 'FINANCE']);
        if (!staffRoles.has(role) && agent.userId !== userId) {
            throw new ForbiddenError('You can only view your own dashboard');
        }

        const [commissionStats, loanStats, recentLoans] = await Promise.all([
            agentsRepository.getCommissionStats(agentId),
            agentsRepository.getLoanStats(agentId),
            // Recent 5 loans for the dashboard preview
            prisma.loan_applications.findMany({
                where: { agent_id: agentId },
                orderBy: { applied_at: 'desc' },
                take: 5,
                select: {
                    id: true,
                    amount_requested: true,
                    status: true,
                    applied_at: true,
                    users: {
                        select: { full_name: true },
                    },
                    loan_accounts: {
                        select: {
                            agent_commissions: {
                                select: { commission_amount: true },
                                take: 1,
                            },
                        },
                    },
                },
            }),
        ]);

        const pendingCommission = commissionStats.pendingAmount;
        const nextPayoutEstimate = roundRupees(
            pendingCommission * (1 - 0.02), // 2% TDS deduction estimate
        );

        return {
            agentId: agent.id,
            agentCode: agent.agentCode,
            fullName: agent.fullName,
            status: agent.status,
            commissionRate: agent.commissionRate,
            totalLoansSubmitted: loanStats.totalSubmitted,
            activeLoans: loanStats.active,
            rejectedLoans: loanStats.rejected,
            totalDisbursed: loanStats.totalDisbursed,
            totalEarned: commissionStats.totalEarned,
            pendingCommission,
            paidCommission: commissionStats.paidAmount,
            clawedBackAmount: commissionStats.clawedBack,
            nextPayoutEstimate,
            recentLoans: recentLoans.map((l) => ({
                loanId: l.id,
                customerName: (l.users as { full_name: string })?.full_name ?? 'Unknown',
                amount: toNumber(l.amount_requested as number),
                status: l.status as string,
                appliedAt: l.applied_at as Date,
                commission: l.loan_accounts?.[0]?.agent_commissions?.[0]
                    ? toNumber(l.loan_accounts[0].agent_commissions[0].commission_amount as number)
                    : null,
            })),
        };
    },

    // ── 11. List commissions ────────────────────────────────────────────────────

    async listCommissions(
        agentId: string | undefined,
        input: ListCommissionsInput,
        userId: string,
        role: string,
    ) {
        // Agents can only see their own commissions
        const staffRoles = new Set(['FINANCE', 'SUPER_ADMIN', 'OPS_EXECUTIVE']);
        if (!staffRoles.has(role)) {
            const agent = await agentsRepository.findByUserId(userId);
            if (!agent) throw new NotFoundError('Agent profile', userId);
            agentId = agent.id;
        }

        const result = await agentsRepository.listCommissions(input, agentId);
        return {
            ...result,
            data: result.data.map(toCommissionResponse),
        };
    },

    // ── 12. Process commission payout ──────────────────────────────────────────
    // Finance processes all pending commissions for an agent in one batch.
    // Commissions within clawback window are excluded.

    async processPayout(
        input: ProcessPayoutInput,
        req: Request,
    ): Promise<{ payoutId: string; totalAmount: number; count: number }> {
        const { agentId, processedBy } = input;

        const agent = await agentsRepository.findByIdOrThrow(agentId);

        if (agent.status !== AGENT_STATUS.ACTIVE) {
            throw new AgentNotActiveError(agentId, agent.status);
        }

        // Find all commissions past the clawback window
        const earned = await agentsRepository.findEarnedCommissionsForAgent(agentId);

        if (earned.length === 0) {
            throw new DomainError(
                'No commissions are currently eligible for payout. ' +
                'Either there are no earned commissions, or they are still within the clawback window.',
                'NO_ELIGIBLE_COMMISSIONS',
                { agentId },
            );
        }

        const totalAmount = roundRupees(
            earned.reduce((sum, c) => sum + c.commissionAmount, 0),
        );

        // Create the payout batch record — marks commissions as PAID atomically
        const payout = await agentsRepository.createPayoutBatch({
            agentId,
            totalAmount,
            commissionIds: earned.map((c) => c.id),
        });

        // Trigger the actual bank transfer
        const paymentProvider = getPaymentProvider();

        try {
            const result = await paymentProvider.createPayout({
                accountNumber: agent.bankAccountNo,
                ifsc: agent.bankIfsc,
                accountName: agent.bankAccountName,
                amount: totalAmount,
                purpose: `Agent commission payout - ${agent.agentCode}`,
                referenceId: payout.id,
            });

            await agentsRepository.updatePayoutStatus(
                payout.id,
                'PROCESSED',
                result.utrNumber ?? undefined,
            );

            setAuditContext(req, {
                action: AUDIT_ACTION.COMMISSION_PAID,
                entityType: 'commission_payouts',
                entityId: payout.id,
                after: {
                    agentId,
                    totalAmount,
                    count: earned.length,
                    utrNumber: result.utrNumber,
                },
                metadata: { processedBy },
            });

            log.info('Commission payout processed', {
                agentId,
                payoutId: payout.id,
                totalAmount,
                count: earned.length,
                utrNumber: result.utrNumber,
            });

        } catch (err) {
            // Payout transfer failed — mark batch as failed
            // Commissions are PAID in DB but payout batch is FAILED
            // Finance must retry the bank transfer manually
            await agentsRepository.updatePayoutStatus(payout.id, 'FAILED');

            log.error('Commission payout bank transfer failed', {
                agentId,
                payoutId: payout.id,
                error: (err as Error).message,
            });

            throw err;
        }

        return { payoutId: payout.id, totalAmount, count: earned.length };
    },

    // ── 13. Gate check — used by loans module ────────────────────────────────
    // Called before allowing an agent to submit a loan application.

    async assertAgentActive(agentId: string): Promise<void> {
        const agent = await agentsRepository.findByIdOrThrow(agentId);
        if (agent.status !== AGENT_STATUS.ACTIVE) {
            throw new AgentNotActiveError(agentId, agent.status);
        }
    },
};

// Lazy import to avoid circular dependency
import { prisma } from '@/config/database';