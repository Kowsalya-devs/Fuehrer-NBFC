#!/usr/bin/env bash
# scripts/migrate-prod.sh
# Safe production migration runner.
# Usage: ./scripts/migrate-prod.sh

set -euo pipefail

# ── Guard: must be run with explicit prod flag ─────────────────────────────────
if [ "${1:-}" != "--confirm-prod" ]; then
  echo ""
  echo "  ⚠️  Production database migration"
  echo ""
  echo "  This script modifies the production RDS database."
  echo "  Run with --confirm-prod to proceed:"
  echo ""
  echo "  ./scripts/migrate-prod.sh --confirm-prod"
  echo ""
  exit 1
fi

if [ "${NODE_ENV:-}" != "production" ]; then
  echo "ERROR: NODE_ENV must be 'production'. Got: '${NODE_ENV:-unset}'"
  exit 1
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERROR: DATABASE_URL is not set."
  exit 1
fi

echo ""
echo "Starting production migration at $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
echo "Database: ${DATABASE_URL//:*@/:***@}"  # Mask password in output
echo ""

# Run Prisma migration deploy (never 'migrate dev' in production)
npx prisma migrate deploy

echo ""
echo "Migration completed at $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
echo ""