// src/modules/collections/index.ts
export { collectionsRouter } from './collections.routes';
export { collectionsService } from './collections.service';
export { collectionsRepository } from './collections.repository';
export {
    classifyDpd,
} from './collections.types';
export type {
    CollectionCase,
    CollectionCaseResponse,
    ContactLog,
    DpdBucket,
    ContactOutcome,
    CollectionCaseStatus,
    CollectionPortfolioSummary,
    CreateCaseInput,
    LogContactInput,
} from './collections.types';
