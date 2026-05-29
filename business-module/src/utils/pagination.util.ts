// src/utils/pagination.util.ts
//
// Pagination utilities.
//
// The core implementation lives in src/types/common.types.ts:
//   - parsePagination    — converts raw query params to { page, limit }
//   - buildPaginationMeta — builds the meta block for paginated responses
//   - toPrismaPage       — converts { page, limit } to Prisma { skip, take }
//   - PaginationParams, PaginationMeta, PaginatedResult (types)
//
// This file re-exports all of them so any module importing from
// '@/utils/pagination.util' resolves correctly, and adds the cursor-based
// pagination helper used by the audit log endpoint (which deals with large
// datasets where offset pagination becomes slow).

export {
    parsePagination,
    buildPaginationMeta,
    toPrismaPage,
} from '@/types/common.types';

export type {
    PaginationParams,
    PaginationMeta,
    PaginatedResult,
} from '@/types/common.types';

// ─── Query param validation ───────────────────────────────────────────────────
// Validates and clamps page/limit from an Express query object.
// Controllers call this before passing to service — never trust raw req.query.

export function parsePaginationQuery(
    query: Record<string, unknown>,
    opts: { defaultLimit?: number; maxLimit?: number } = {},
): { page: number; limit: number } {
    const defaultLimit = opts.defaultLimit ?? 20;
    const maxLimit = opts.maxLimit ?? 100;

    const page = Math.max(1, parseInt(String(query.page ?? '1'), 10) || 1);
    const limit = Math.min(
        maxLimit,
        Math.max(1, parseInt(String(query.limit ?? String(defaultLimit)), 10) || defaultLimit),
    );

    return { page, limit };
}

// ─── Cursor pagination ────────────────────────────────────────────────────────
// Used by audit_logs endpoint — offset pagination is O(n) on large tables.
// Cursor is always the last record's `created_at` ISO string.

export interface CursorPage {
    cursor?: string;   // ISO date string of last record — omit for first page
    limit: number;
}

export interface CursorPageResult<T> {
    data: T[];
    nextCursor: string | null;  // null = no more pages
    hasMore: boolean;
}

export function parseCursorQuery(
    query: Record<string, unknown>,
    maxLimit = 50,
): CursorPage {
    const limit = Math.min(
        maxLimit,
        Math.max(1, parseInt(String(query.limit ?? '20'), 10) || 20),
    );
    const cursor = typeof query.cursor === 'string' ? query.cursor : undefined;
    return { cursor, limit };
}

/**
 * Builds a cursor page result from a raw data array.
 * Fetches limit + 1 rows — if we got more than limit, there are more pages.
 * The extra row is sliced off before returning.
 */
export function buildCursorResult<T extends { createdAt: Date }>(
    rows: T[],
    limit: number,
): CursorPageResult<T> {
    const hasMore = rows.length > limit;
    const data = hasMore ? rows.slice(0, limit) : rows;
    const last = data[data.length - 1];
    const nextCursor = hasMore && last ? last.createdAt.toISOString() : null;

    return { data, nextCursor, hasMore };
}
