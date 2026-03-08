#!/usr/bin/env bash
# End-to-end smoke test: create firm, ingest PDF, wait for processing, assert status, hit dashboard.
# Requires: API running, Redis, PostgreSQL, jq, curl.
# Run from repo root: pnpm smoke  OR  bash scripts/smoke_test.sh
set -e

cd "$(dirname "$0")/.."
ROOT="$(pwd)"
API_BASE="${DOC_API_URL:-http://127.0.0.1:4000}"
MAX_WAIT=90
POLL_INTERVAL=3

red='\033[0;31m'
green='\033[0;32m'
nc='\033[0m'

fail() { echo -e "${red}FAIL: $*${nc}" >&2; exit 1; }
pass() { echo -e "${green}PASS: $*${nc}"; }

# Check deps
command -v curl >/dev/null || fail "curl required"
command -v jq >/dev/null || fail "jq required"

echo "=== Smoke Test ==="
echo "API_BASE=$API_BASE"
echo ""

# 1) Health check
echo "1) Health check..."
health=$(curl -sf "$API_BASE/health" 2>/dev/null || true)
if ! echo "$health" | jq -e '.ok == true' >/dev/null 2>&1; then
  fail "API not reachable at $API_BASE. Start with: cd apps/api && pnpm dev"
fi
pass "API reachable"

# 2) Create firm (dev)
echo ""
echo "2) Create firm + API key (dev)..."
firm_resp=$(curl -sf -X POST "$API_BASE/dev/create-firm" \
  -H "Content-Type: application/json" \
  -d '{"name":"Smoke Test Firm"}' 2>/dev/null || true)
if ! FIRM_ID=$(echo "$firm_resp" | jq -r '.id // empty'); then
  fail "Create firm failed: $firm_resp"
fi
[ -n "$FIRM_ID" ] || fail "Create firm failed: no id in $firm_resp"
pass "Firm created: $FIRM_ID"

# 3) Create API key
key_resp=$(curl -sf -X POST "$API_BASE/dev/create-api-key/$FIRM_ID" \
  -H "Content-Type: application/json" \
  -d '{"name":"Smoke test"}' 2>/dev/null || true)
API_KEY=$(echo "$key_resp" | jq -r '.apiKey // empty')
[ -n "$API_KEY" ] || fail "Create API key failed: $key_resp"
pass "API key created"

# 4) Create sample PDF and ingest
echo ""
echo "3) Ingest sample PDF..."
PDF_FILE="${TMPDIR:-/tmp}/smoke_test_$$.pdf"
(cd apps/api && pnpm exec tsx scripts/create_smoke_pdf.ts > "$PDF_FILE") || fail "Could not create sample PDF"

ingest_resp=$(curl -sf -X POST "$API_BASE/ingest" \
  -H "Authorization: Bearer $API_KEY" \
  -F "file=@$PDF_FILE" \
  -F "source=smoke-test" 2>/dev/null || true)
rm -f "$PDF_FILE"

DOC_ID=$(echo "$ingest_resp" | jq -r '.documentId // empty')
[ -n "$DOC_ID" ] || fail "Ingest failed: $ingest_resp"
pass "Document ingested: $DOC_ID"

# 5) Wait for processing (NEEDS_REVIEW or UPLOADED)
echo ""
echo "4) Waiting for processing (max ${MAX_WAIT}s)..."
elapsed=0
DOC_STATUS=""
while [ $elapsed -lt $MAX_WAIT ]; do
  docs_resp=$(curl -sf "$API_BASE/me/documents?limit=50" \
    -H "Authorization: Bearer $API_KEY" 2>/dev/null || true)
  DOC_STATUS=$(echo "$docs_resp" | jq -r --arg id "$DOC_ID" '.items[]? | select(.id == $id) | .status // empty')
  if [ -n "$DOC_STATUS" ]; then
    if [ "$DOC_STATUS" = "NEEDS_REVIEW" ] || [ "$DOC_STATUS" = "UPLOADED" ]; then
      pass "Document status: $DOC_STATUS"
      break
    fi
    echo "  status=$DOC_STATUS (${elapsed}s)"
  fi
  sleep $POLL_INTERVAL
  elapsed=$((elapsed + POLL_INTERVAL))
done

if [ "$DOC_STATUS" != "NEEDS_REVIEW" ] && [ "$DOC_STATUS" != "UPLOADED" ]; then
  fail "Document did not reach NEEDS_REVIEW or UPLOADED (status=$DOC_STATUS after ${elapsed}s). Ensure worker is running: cd apps/api && pnpm dev:worker"
fi

# 6) Dashboard endpoints
echo ""
echo "5) Dashboard endpoints..."
usage_resp=$(curl -sf "$API_BASE/me/usage" -H "Authorization: Bearer $API_KEY" 2>/dev/null || true)
if ! echo "$usage_resp" | jq -e '.firm and .usage' >/dev/null 2>&1; then
  fail "GET /me/usage failed: $usage_resp"
fi
pass "GET /me/usage OK"

docs_resp=$(curl -sf "$API_BASE/me/documents?limit=5" -H "Authorization: Bearer $API_KEY" 2>/dev/null || true)
if ! echo "$docs_resp" | jq -e '.items != null' >/dev/null 2>&1; then
  fail "GET /me/documents failed: $docs_resp"
fi
pass "GET /me/documents OK"

echo ""
echo -e "${green}=== SMOKE TEST PASSED ===${nc}"
exit 0
