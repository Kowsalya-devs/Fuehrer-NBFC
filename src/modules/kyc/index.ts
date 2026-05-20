// src/modules/kyc/index.ts
export { kycRouter } from './kyc.routes';
export { kycService } from './kyc.service';
export { kycRepository } from './kyc.repository';
export type {
    KycDocument,
    KycStatusResponse,
    KycUnderwritingData,
    InitiateKycInput,
    RequestESignInput,
} from './kyc.types';