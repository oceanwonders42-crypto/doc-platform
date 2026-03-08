#!/usr/bin/env bash
# Full project audit: structure, routes, Prisma, migrations, build, TODOs, duplicates, ports.
# Output: audit/latest_audit.txt and summary to terminal.
# Run from repo root: bash scripts/full_audit.sh

set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
AUDIT_DIR="$ROOT/audit"
mkdir -p "$AUDIT_DIR"
OUT="$AUDIT_DIR/latest_audit.txt"
exec 1> >(tee -a "$OUT") 2>&1

echo "=============================================="
echo "FULL PROJECT AUDIT — $(date -Iseconds 2>/dev/null || date)"
echo "=============================================="

echo ""
echo "=== 1) Repo root path ==="
echo "$ROOT"

echo ""
echo "=== 2) Git status ==="
git status 2>&1 || echo "(not a git repo or error)"

echo ""
echo "=== 3) Recent commits (git log -10 --oneline) ==="
git log -10 --oneline 2>&1 || echo "(not a git repo or error)"

echo ""
echo "=== 4) Root structure (ls) ==="
ls -la 2>/dev/null || dir 2>/dev/null || echo "(ls/dir failed)"

echo ""
echo "=== 5) apps directory tree (find apps -maxdepth 4 -type d | sort) ==="
find apps -maxdepth 4 -type d 2>/dev/null | sort || echo "(find failed)"

echo ""
echo "=== 6) Web routes (page.tsx, route.ts, layout.tsx) ==="
find apps/web/app -type f \( -name "page.tsx" -o -name "route.ts" -o -name "layout.tsx" \) 2>/dev/null | sort || echo "(apps/web/app not found or empty)"

echo ""
echo "=== 7) API source files (apps/api/src **/*.ts) ==="
find apps/api/src -type f \( -name "*.ts" -o -name "*.tsx" \) 2>/dev/null | sort || echo "(find failed)"

echo ""
echo "=== 8) Prisma models and enums (from schema.prisma) ==="
if [ -f apps/api/prisma/schema.prisma ]; then
  echo "--- Models ---"
  grep -E '^model ' apps/api/prisma/schema.prisma | sed 's/model \([A-Za-z0-9_]*\).*/\1/' || true
  echo "--- Enums ---"
  grep -E '^enum ' apps/api/prisma/schema.prisma | sed 's/enum \([A-Za-z0-9_]*\).*/\1/' || true
else
  echo "(schema.prisma not found)"
fi

echo ""
echo "=== 9) Migrations list ==="
ls -la apps/api/prisma/migrations 2>/dev/null || echo "(migrations dir not found)"
echo "--- Prisma migrate status ---"
(cd apps/api && pnpm prisma migrate status 2>&1) || true

echo ""
echo "=== 10) Install/build checks ==="
echo "--- pnpm -v ---"
pnpm -v 2>/dev/null || echo "(pnpm not found)"
echo "--- Web build (apps/web) ---"
(cd apps/web && pnpm run build 2>&1) || echo "(web build skipped or failed)"
echo "--- API typecheck (apps/api tsc --noEmit) ---"
(cd apps/api && pnpm exec tsc --noEmit 2>&1) || echo "(api typecheck skipped or failed)"

echo ""
echo "=== 11) TODO / FIXME / partial implementation markers ==="
grep -RIn "TODO\|FIXME\|HACK\|TEMP\|NOT IMPLEMENTED\|placeholder\|coming soon" apps packages scripts docs 2>/dev/null | head -200 || echo "(none or grep failed)"

echo ""
echo "=== 12) Duplicate basenames (suspicious) ==="
find apps -type f 2>/dev/null | sed 's#^.*/##' | sort | uniq -d | head -50 || echo "(none or find failed)"

echo ""
echo "=== 13) Listening ports 3000, 4000 ==="
(lsof -nP -iTCP:3000 -sTCP:LISTEN 2>/dev/null || echo "Port 3000: none")
(lsof -nP -iTCP:4000 -sTCP:LISTEN 2>/dev/null || echo "Port 4000: none")

echo ""
echo "=============================================="
echo "AUDIT COMPLETE — output saved to $OUT"
echo "=============================================="
