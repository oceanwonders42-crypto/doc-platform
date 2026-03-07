/**
 * Tenant isolation test runner.
 * Prerequisites: run tests/seedTenantData.ts then start API (e.g. pnpm dev).
 * Uses seed-output.json for Firm A / Firm B IDs and API keys.
 * Run: pnpm exec tsx tests/tenantIsolation/runTenantIsolation.ts
 */
import * as path from "path";
import * as fs from "fs";

const BASE = process.env.API_URL || "http://localhost:4000";
const SEED_OUTPUT = path.join(__dirname, "seed-output.json");

type SeedOutput = {
  firmAId: string;
  firmBId: string;
  caseAId: string;
  caseBId: string;
  documentAId: string;
  documentBId: string;
  providerAId: string;
  providerBId: string;
  apiKeyA: string;
  apiKeyB: string;
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
  if (!fs.existsSync(SEED_OUTPUT)) {
    throw new Error(`Seed output not found. Run: pnpm exec tsx tests/seedTenantData.ts then start API. Path: ${SEED_OUTPUT}`);
  }
  return JSON.parse(fs.readFileSync(SEED_OUTPUT, "utf8")) as SeedOutput;
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
  console.log("Tenant isolation tests (API base:", BASE, ")\n");

  const seed = loadSeedOutput();

  // 1. Firm A cannot read Firm B case
  const caseBAsA = await fetchWithKey(`${BASE}/cases/${seed.caseBId}`, seed.apiKeyA).catch(() => null);
  if (caseBAsA?.status === 404 || caseBAsA?.status === 403) ok("Firm A cannot read Firm B case");
  else fail("Firm A cannot read Firm B case", `expected 404/403, got ${caseBAsA?.status ?? "error"}`);

  // 2. Firm A cannot read Firm B document
  const docBAsA = await fetchWithKey(`${BASE}/documents/${seed.documentBId}`, seed.apiKeyA).catch(() => null);
  if (docBAsA?.status === 404 || docBAsA?.status === 403) ok("Firm A cannot read Firm B document");
  else fail("Firm A cannot read Firm B document", `expected 404/403, got ${docBAsA?.status ?? "error"}`);

  // 3. Firm A cannot update Firm B provider
  const updateProviderBAsA = await fetchWithKey(`${BASE}/providers/${seed.providerBId}`, seed.apiKeyA, {
    method: "PATCH",
    body: JSON.stringify({ name: "Hacked" }),
  }).catch(() => null);
  if (updateProviderBAsA?.status === 404 || updateProviderBAsA?.status === 403) ok("Firm A cannot update Firm B provider");
  else fail("Firm A cannot update Firm B provider", `expected 404/403, got ${updateProviderBAsA?.status ?? "error"}`);

  // 4. Firm A cannot delete Firm B data
  const deleteCaseBAsA = await fetchWithKey(`${BASE}/cases/${seed.caseBId}`, seed.apiKeyA, {
    method: "DELETE",
  }).catch(() => null);
  if (deleteCaseBAsA?.status === 404 || deleteCaseBAsA?.status === 403 || deleteCaseBAsA?.status === 405) ok("Firm A cannot delete Firm B data");
  else fail("Firm A cannot delete Firm B data", `expected 404/403/405, got ${deleteCaseBAsA?.status ?? "error"}`);

  // 5. Firm A search cannot return Firm B records
  const searchAsA = await fetchWithKey(`${BASE}/me/documents?limit=50`, seed.apiKeyA).catch(() => null);
  if (!searchAsA?.ok) {
    fail("Firm A search (documents)", `request failed: ${searchAsA?.status ?? "error"}`);
  } else {
    const data = await searchAsA.json();
    const items = data?.items ?? data?.data ?? [];
    const hasB = items.some((d: { id?: string }) => d.id === seed.documentBId);
    if (!hasB) ok("Firm A search cannot return Firm B records");
    else fail("Firm A search cannot return Firm B records", "document B appeared in Firm A list");
  }

  // 6. Direct ID access across firms returns 404
  const docAByB = await fetchWithKey(`${BASE}/documents/${seed.documentAId}`, seed.apiKeyB).catch(() => null);
  if (docAByB?.status === 404 || docAByB?.status === 403) ok("Direct ID access across firms (doc) returns 404");
  else fail("Direct ID access across firms", `expected 404/403, got ${docAByB?.status ?? "error"}`);

  const caseAByB = await fetchWithKey(`${BASE}/cases/${seed.caseAId}`, seed.apiKeyB).catch(() => null);
  if (caseAByB?.status === 404 || caseAByB?.status === 403) ok("Direct ID access across firms (case) returns 404");
  else fail("Direct ID access across firms (case)", `expected 404/403, got ${caseAByB?.status ?? "error"}`);

  console.log("\nResult:", passed, "passed,", failed, "failed");
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
