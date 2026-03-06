#!/usr/bin/env bash
cd "$(dirname "$0")/.."

echo "=== 1) git status ==="
git status 2>&1 || echo "(not a git repo or error)"

echo ""
echo "=== 2) git log -10 --oneline ==="
git log -10 --oneline 2>&1 || echo "(not a git repo or error)"

echo ""
echo "=== 3) listening ports 3000 and 4000 (lsof) ==="
lsof -i :3000 2>/dev/null || echo "(none on 3000)"
lsof -i :4000 2>/dev/null || echo "(none on 4000)"

echo ""
echo "=== 4) Next routes (page.tsx + route.ts) ==="
find apps/web/app -maxdepth 6 -type f \( -name "page.tsx" -o -name "route.ts" \) 2>/dev/null | sort

echo ""
echo "=== 5) API entrypoints (app.get/post/patch/put/delete in apps/api/src) ==="
find apps/api/src -maxdepth 6 -type f -name "*.ts" -print0 2>/dev/null | xargs -0 grep -h -E '(app|router)\.(get|post|patch|put|delete)\s*\(' 2>/dev/null | sed 's/^[[:space:]]*//' | sort -u || echo "(none found)"

echo ""
echo "=== 6) Prisma schema (first 400 lines) ==="
head -400 apps/api/prisma/schema.prisma

echo ""
echo "=== 7) Package scripts ==="
echo "--- apps/web/package.json (scripts) ---"
node -e "
const w = require('./apps/web/package.json');
console.log(JSON.stringify(w.scripts || {}, null, 2));
"
echo ""
echo "--- apps/api/package.json (scripts) ---"
node -e "
const a = require('./apps/api/package.json');
console.log(JSON.stringify(a.scripts || {}, null, 2));
"
