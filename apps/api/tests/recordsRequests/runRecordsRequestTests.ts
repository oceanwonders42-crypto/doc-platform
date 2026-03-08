/**
 * Records request API tests: create draft, tenant isolation (Firm A cannot access Firm B request), dashboard counts.
 * Prerequisites: run tests/seedTenantData.ts, start API. Uses seed-output.json for firm/case/keys.
 * Run: pnpm exec tsx tests/recordsRequests/runRecordsRequestTests.ts
 */
import * as path from "path";
import * as fs from "fs";

const BASE = process.env.API_URL || "http://localhost:4000";
const SEED_PATH = path.resolve(__dirname, "..", "tenantIsolation", "seed-output.json");

type SeedOutput = {
  firmAId?: string;
  firmBId?: string;
  caseAId?: string;
  caseBId?: string;
  apiKeyA?: string;
  apiKeyB?: string;
};

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

function loadSeedOutput(): SeedOutput {
  const p = fs.existsSync(SEED_PATH) ? SEED_PATH : path.join(__dirname, "seed-output.json");
  if (!fs.existsSync(p)) {
    throw new Error(`Seed output not found. Run: pnpm exec tsx tests/seedTenantData.ts. Path: ${p}`);
  }
  return JSON.parse(fs.readFileSync(p, "utf8")) as SeedOutput;
}

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

async function run() {
  console.log("Records request tests (API base:", BASE, ")\n");

  let seed: SeedOutput;
  try {
    seed = loadSeedOutput();
  } catch (e) {
    console.log("  Skip: seed-output.json not found. Run tests/seedTenantData.ts first.");
    process.exit(0);
  }

  const apiKeyA = seed.apiKeyA;
  const apiKeyB = seed.apiKeyB;
  const caseAId = seed.caseAId;

  if (!apiKeyA || !caseAId) {
    console.log("  Skip: apiKeyA or caseAId missing in seed output.");
    process.exit(0);
  }

  let requestIdA: string | null = null;

  // 1. Create draft (Firm A)
  const createRes = await fetchWithKey(`${BASE}/records-requests`, apiKeyA, {
    method: "POST",
    body: JSON.stringify({ caseId: caseAId, requestType: "RECORDS", destinationType: "EMAIL", destinationValue: "test@example.com" }),
  });
  const createData = await createRes.json().catch(() => ({}));
  if (createRes.ok && createData.ok && createData.request?.id) {
    requestIdA = createData.request.id;
    ok("Create draft request");
  } else {
    fail("Create draft request", createData?.error || String(createRes.status));
  }

  if (!requestIdA) {
    console.log("\n  Total:", passed, "passed,", failed, "failed");
    process.exit(failed > 0 ? 1 : 0);
  }

  // 2. Firm B cannot access Firm A request
  if (apiKeyB) {
    const getAsB = await fetchWithKey(`${BASE}/records-requests/${requestIdA}`, apiKeyB).catch(() => null);
    if (getAsB?.status === 404 || getAsB?.status === 403) ok("Firm B cannot access Firm A request");
    else fail("Firm B cannot access Firm A request", `expected 404/403, got ${getAsB?.status ?? "error"}`);
  }

  // 3. Dashboard returns counts for current firm only
  const dashRes = await fetchWithKey(`${BASE}/records-requests/dashboard`, apiKeyA);
  const dashData = await dashRes.json().catch(() => ({}));
  if (dashRes.ok && dashData.ok && typeof dashData.dashboard?.open === "number") {
    ok("Dashboard returns counts");
  } else {
    fail("Dashboard returns counts", dashData?.error || String(dashRes.status));
  }

  console.log("\n  Total:", passed, "passed,", failed, "failed");
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
