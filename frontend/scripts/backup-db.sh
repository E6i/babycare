#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ -f ".env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source ".env"
  set +a
fi

: "${DATABASE_URL:?DATABASE_URL is required}"

BACKUP_DIR="${BACKUP_DIR:-$ROOT_DIR/backups/db}"
mkdir -p "$BACKUP_DIR"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_FILE="$BACKUP_DIR/smartcare-$STAMP.sql.gz"

DUMP_DATABASE_URL="$(
  node -e 'const url = new URL(process.env.DATABASE_URL); url.searchParams.delete("schema"); process.stdout.write(url.toString());'
)"

pg_dump "$DUMP_DATABASE_URL" | gzip -9 > "$BACKUP_FILE"
find "$BACKUP_DIR" -name "smartcare-*.sql.gz" -type f -mtime +14 -delete

echo "$BACKUP_FILE"
