// src/errors/index.ts

// ─── Base ──────────────────────────────────────────────────────────────────────
export { AppError } from './AppError';
export type { AppErrorOptions } from './AppError';

// ─── HTTP errors ──────────────────────────────────────────────────────────────
export { NotFoundError } from './NotFoundError';
export { Errors as NotFound } from './NotFoundError';

export { ValidationError } from './ValidationError';
export type { ValidationErrorDetail } from './ValidationError';

export { UnauthorizedError } from './UnauthorizedError';
export { AUTH_ERRORS } from './UnauthorizedError';

export { ForbiddenError } from './ForbiddenError';
export { RBAC_ERRORS } from './ForbiddenError';

export { ConflictError } from './ConflictError';
export { CONFLICT_ERRORS } from './ConflictError';

export { RateLimitError } from './RateLimitError';
export { RATE_LIMIT_ERRORS } from './RateLimitError';

// ─── Domain errors ────────────────────────────────────────────────────────────
export { LoanStateError } from './LoanStateError';
export {
    DomainError,
    KycIncompleteError,
    KycRejectedError,
    CreditScoreTooLowError,
    FoirExceededError,
    LoanAmountOutOfRangeError,
    TenureOutOfRangeError,
    LoanAlreadyClosedError,
    EmiAlreadyPaidError,
    EmiNotDueYetError,
    ESignNotCompletedError,
    DisbursementAlreadyDoneError,
    AgentNotActiveError,
    CommissionClawbackError,
} from './domain.errors';

// ─── Vendor errors ────────────────────────────────────────────────────────────
export {
    VendorError,
    KycVendorError,
    KYC_VENDOR_ERRORS,
    BureauVendorError,
    BUREAU_ERRORS,
    PaymentVendorError,
    PAYMENT_ERRORS,
    SmsVendorError,
    StorageVendorError,
} from './VendorErrors';