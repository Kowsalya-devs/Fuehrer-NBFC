// src/modules/agents/index.ts
export { agentsRouter } from './agents.routes';
export { agentsService } from './agents.service';
export { agentsRepository } from './agents.repository';
export type {
    AgentProfile,
    AgentCommission,
    AgentDashboard,
    AgentProfileResponse,
    CommissionResponse,
    OnboardAgentInput,
    SuspendAgentInput,
} from './agents.types';