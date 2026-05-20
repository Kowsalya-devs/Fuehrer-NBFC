// src/modules/underwriting/index.ts
export { underwritingRouter } from './underwriting.routes';
export { underwritingService } from './underwriting.service';
export { underwritingRepository } from './underwriting.repository';
export {
    runRuleEngine,
    lookupInterestRate,
    computeMaxEligibleAmount,
    RULE_DEFINITIONS,
} from './underwriting.rules';
export type {
    UnderwritingReport,
    UnderwritingReportResponse,
    UnderwritingDecision,
    RuleResult,
    UnderwritingConfig,
    RunUnderwritingInput,
    CreditManagerReviewInput,
} from './underwriting.types';