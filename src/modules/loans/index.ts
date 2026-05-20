// src/modules/loans/index.ts
export { loansRouter } from './loans.routes';
export { loansService } from './loans.service';
export { loansRepository } from './loans.repository';
export type {
    LoanApplication,
    LoanAccount,
    LoanApplicationResponse,
    LoanAccountResponse,
    CreateLoanApplicationInput,
    ApproveLoanInput,
    RejectLoanInput,
    EmiPreviewInput,
    EmiPreviewResult,
} from './loans.types';