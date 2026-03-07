/**
 * Platform stability verification — automated tests against running API.
 * Prerequisites: API running (e.g. pnpm dev), optional seed for firm keys.
 * Env: API_URL (default http://localhost:4000), FIRM_API_KEY, PLATFORM_ADMIN_API_KEY (optional).
 * Run: pnpm exec tsx tests/platformStability/runPlatformStabilityTests.ts
 */
const BASE = process.env.API_URL || "http://localhost:4000";
const FIRM_KEY = process.env.FIRM_API_KEY || "";
const PLATFORM_ADMIN_KEY = process.env.PLATFORM_ADMIN_API_KEY || "";

let passed = 0;
let failed = 0;

function ok(name: string) {
  passed++;
  console.log(`  ✓ ${name}`);
}

function fail(name: string, detail: string) {
  failed++;
  console.log(`  ✗ ${name}: ${detail}`);
}

async function fetchNoAuth(url: string, options: RequestInit = {}): Promise<Response> {
  return fetch(url, { ...options, headers: { "Content-Type": "application/json", ...(options.headers as Record<string, string>) } });
}

async function fetchWithKey(url: string, apiKey: string, options: RequestInit = {}): Promise<Response> {
  return fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string>),
    },
  });
}

async function run(): Promise<void> {
  console.log("Platform stability tests (API base:", BASE, ")\n");

  // 1. Unauthorized user blocked from admin routes
  const adminErrorsNoAuth = await fetchNoAuth(`${BASE}/admin/errors`).catch(() => null);
  if (adminErrorsNoAuth?.status === 401) ok("Unauthorized user blocked from GET /admin/errors");
  else fail("Unauthorized user blocked from GET /admin/errors", `expected 401, got ${adminErrorsNoAuth?.status ?? "error"}`);

  const healthNoAuth = await fetchNoAuth(`${BASE}/admin/system/health`).catch(() => null);
  if (healthNoAuth?.status === 401) ok("Unauthorized user blocked from GET /admin/system/health");
  else fail("Unauthorized user blocked from GET /admin/system/health", `expected 401, got ${healthNoAuth?.status ?? "error"}`);

  // 2. Non-admin blocked from admin/support routes (when we have a firm key)
  if (FIRM_KEY) {
    const adminErrorsAsFirm = await fetchWithKey(`${BASE}/admin/errors`, FIRM_KEY).catch(() => null);
    if (adminErrorsAsFirm?.status === 403) ok("Non-admin (firm key) blocked from GET /admin/errors");
    else fail("Non-admin blocked from GET /admin/errors", `expected 403, got ${adminErrorsAsFirm?.status ?? "error"}`);

    const bugReportsAsFirm = await fetchWithKey(`${BASE}/admin/support/bug-reports`, FIRM_KEY).catch(() => null);
    if (bugReportsAsFirm?.status === 403) ok("Non-admin (firm key) blocked from GET /admin/support/bug-reports");
    else fail("Non-admin blocked from GET /admin/support/bug-reports", `expected 403, got ${bugReportsAsFirm?.status ?? "error"}`);
  } else {
    console.log("  (skip) Non-admin admin route tests — set FIRM_API_KEY to run");
  }

  // 3. Rate limiting — without auth we get 401 first; with auth we'd need 11+ requests. Skip or note.
  console.log("  (skip) Rate limit 429 — run manually: send 11+ POST /support/bug-report from same IP with valid auth");

  // 4. Invalid payload rejected
  const invalidBugReport = await fetchWithKey(`${BASE}/support/bug-report`, FIRM_KEY || "dummy", {
    method: "POST",
    body: JSON.stringify({ title: 123, description: "" }),
  }).catch(() => null);
  if (invalidBugReport?.status === 400) ok("Invalid payload (bug-report) rejected with 400");
  else if (invalidBugReport?.status === 401) console.log("  (skip) Invalid payload — got 401 (no valid key); set FIRM_API_KEY for 400");
  else fail("Invalid payload rejected", `expected 400 or 401, got ${invalidBugReport?.status ?? "error"}`);

  // 5. Oversized upload — manual
  console.log("  (skip) Oversized upload — manual: POST /ingest with file > 25MB");

  // 6. Suspicious file — manual
  console.log("  (skip) Suspicious file — manual: POST /ingest with file.exe or disallowed MIME");

  // 7. Bug report creation (requires firm key)
  if (FIRM_KEY) {
    const createReport = await fetchWithKey(`${BASE}/support/bug-report`, FIRM_KEY, {
      method: "POST",
      body: JSON.stringify({
        title: "E2E test " + Date.now(),
        description: "Automated platform stability test",
        pageUrl: "https://app.example.com/test",
      }),
    }).catch(() => null);
    if (createReport?.ok && createReport?.status === 201) {
      const data = await createReport.json().catch(() => ({}));
      if (data.ok && data.id) ok("Bug report creation works");
      else fail("Bug report creation", "expected ok and id in response");
    } else fail("Bug report creation", `expected 201, got ${createReport?.status ?? "error"}`);
  } else {
    console.log("  (skip) Bug report creation — set FIRM_API_KEY");
  }

  // 8. Retry endpoint requires auth
  if (FIRM_KEY) {
    const retryNoAuth = await fetchNoAuth(`${BASE}/jobs/some-fake-id/retry`, { method: "POST" }).catch(() => null);
    if (retryNoAuth?.status === 401) ok("Retry endpoint requires auth (401 without key)");
    else fail("Retry endpoint auth", `expected 401, got ${retryNoAuth?.status ?? "error"}`);
  }

  // 9. Safe error responses do not leak stack
  const badId = await fetchWithKey(`${BASE}/admin/errors/invalid-id-format-123`, PLATFORM_ADMIN_KEY || "dummy").catch(() => null);
  if (badId?.status === 400 || badId?.status === 401 || badId?.status === 404) {
    const body = await badId?.json().catch(() => ({}));
    const hasStack = typeof (body as { stack?: string })?.stack === "string";
    if (!hasStack) ok("Safe error response does not leak stack");
    else fail("Safe error response", "response contained stack");
  } else {
    console.log("  (skip) Safe error stack check — got status " + (badId?.status ?? "error"));
  }

  // 10. Cross-firm support data: firm user cannot list all bug reports
  if (FIRM_KEY) {
    const listAsFirm = await fetchWithKey(`${BASE}/admin/support/bug-reports`, FIRM_KEY).catch(() => null);
    if (listAsFirm?.status === 403) ok("Cross-firm support data blocked (firm cannot list bug reports)");
    else fail("Cross-firm support data", `expected 403 for firm key, got ${listAsFirm?.status ?? "error"}`);
  }

  // Security headers present
  const healthGet = await fetchNoAuth(`${BASE}/health`).catch(() => null);
  if (healthGet?.ok) {
    const xFrame = healthGet.headers.get("x-frame-options");
    const xContent = healthGet.headers.get("x-content-type-options");
    if (xFrame && xContent) ok("Security headers present (X-Frame-Options, X-Content-Type-Options)");
    else fail("Security headers", "missing X-Frame-Options or X-Content-Type-Options");
  }

  console.log("\nResult:", passed, "passed,", failed, "failed");
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
