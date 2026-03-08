#!/usr/bin/env node
/**
 * API Health Check Script
 * Verifies core API endpoints respond correctly.
 * If API is unreachable or DOC_API_KEY is missing, prints clear messages and exits without throwing.
 */
import "dotenv/config";

const BASE = process.env.DOC_API_URL || "http://localhost:4000";
const API_KEY = process.env.DOC_API_KEY || "";

type Result = { name: string; pass: boolean; detail?: string };

async function request(
  method: string,
  path: string,
  opts: { body?: object; headers?: Record<string, string> } = {}
): Promise<{ status: number; data: any }> {
  const url = path.startsWith("http") ? path : `${BASE}${path}`;
  const headers: Record<string, string> = {
    ...opts.headers,
  };
  if (API_KEY) headers["Authorization"] = `Bearer ${API_KEY}`;
  if (opts.body && method !== "GET") headers["Content-Type"] = "application/json";

  const res = await fetch(url, {
    method,
    headers,
    body: opts.body && method !== "GET" ? JSON.stringify(opts.body) : undefined,
  });
  let data: any = null;
  const ct = res.headers.get("content-type");
  if (ct && ct.includes("application/json")) {
    try {
      data = await res.json();
    } catch {
      data = null;
    }
  } else {
    data = await res.text();
  }
  return { status: res.status, data };
}

async function run(): Promise<{ results: Result[]; apiReachable: boolean }> {
  const results: Result[] = [];

  // 1) API is running — catch fetch failures (network, ECONNREFUSED, etc.)
  try {
    const { status, data } = await request("GET", "/health");
    const ok = status === 200 && data && (data.ok === true || data.ok === "true");
    results.push({
      name: "GET /health",
      pass: ok,
      detail: ok ? undefined : `status=${status} data=${JSON.stringify(data)}`,
    });
    if (!ok) {
      return { results, apiReachable: false };
    }
  } catch (e: any) {
    const msg = e?.message || String(e);
    results.push({ name: "GET /health", pass: false, detail: msg });
    console.error(
      `API unreachable at ${BASE}. Start: cd apps/api && pnpm dev`
    );
    return { results, apiReachable: false };
  }

  if (!API_KEY) {
    results.push({
      name: "DOC_API_KEY",
      pass: false,
      detail: "DOC_API_KEY not set; skipping authenticated checks. Set in apps/api/.env",
    });
    return { results, apiReachable: true };
  }

  // 2) Documents endpoint (GET /me/documents)
  try {
    const { status, data } = await request("GET", "/me/documents");
    const ok = status === 200 && data && Array.isArray((data as any).items);
    results.push({
      name: "GET /me/documents",
      pass: ok,
      detail: ok ? undefined : `status=${status}`,
    });
  } catch (e: any) {
    results.push({ name: "GET /me/documents", pass: false, detail: e?.message || String(e) });
  }

  // Get a document id for subsequent calls
  let documentId: string | null = null;
  try {
    const { status, data } = await request("GET", "/me/documents?limit=5");
    if (status === 200 && data && Array.isArray((data as any).items) && (data as any).items.length > 0) {
      documentId = (data as any).items[0].id;
    }
  } catch {
    // ignore
  }

  // 3) Recognition pipeline
  if (documentId) {
    try {
      const { status, data } = await request("POST", `/documents/${documentId}/recognize`);
      const ok = status === 200 && data && (data as any).ok === true;
      results.push({
        name: "POST /documents/:id/recognize",
        pass: ok,
        detail: ok ? undefined : `status=${status}`,
      });
    } catch (e: any) {
      results.push({
        name: "POST /documents/:id/recognize",
        pass: false,
        detail: e?.message || String(e),
      });
    }
  } else {
    results.push({
      name: "POST /documents/:id/recognize",
      pass: true,
      detail: "SKIP (no documents)",
    });
  }

  // 4) Routing
  if (documentId) {
    try {
      const { status } = await request("POST", `/documents/${documentId}/route`, {
        body: { caseId: "health-check-case-id" },
      });
      results.push({
        name: "POST /documents/:id/route",
        pass: status === 200,
        detail: status === 200 ? undefined : `status=${status}`,
      });
    } catch (e: any) {
      results.push({
        name: "POST /documents/:id/route",
        pass: false,
        detail: e?.message || String(e),
      });
    }
  } else {
    results.push({
      name: "POST /documents/:id/route",
      pass: true,
      detail: "SKIP (no documents)",
    });
  }

  // 5) Reject
  if (documentId) {
    try {
      const { status } = await request("POST", `/documents/${documentId}/reject`);
      results.push({
        name: "POST /documents/:id/reject",
        pass: status === 200,
        detail: status === 200 ? undefined : `status=${status}`,
      });
    } catch (e: any) {
      results.push({
        name: "POST /documents/:id/reject",
        pass: false,
        detail: e?.message || String(e),
      });
    }
  } else {
    results.push({ name: "POST /documents/:id/reject", pass: true, detail: "SKIP (no documents)" });
  }

  // 6) Claim
  if (documentId) {
    try {
      const { status } = await request("POST", `/documents/${documentId}/claim`, {
        body: { claimedBy: "health-check-script" },
      });
      results.push({
        name: "POST /documents/:id/claim",
        pass: status === 200,
        detail: status === 200 ? undefined : `status=${status}`,
      });
    } catch (e: any) {
      results.push({
        name: "POST /documents/:id/claim",
        pass: false,
        detail: e?.message || String(e),
      });
    }
  } else {
    results.push({ name: "POST /documents/:id/claim", pass: true, detail: "SKIP (no documents)" });
  }

  // 7) Unclaim
  if (documentId) {
    try {
      const { status } = await request("POST", `/documents/${documentId}/unclaim`);
      results.push({
        name: "POST /documents/:id/unclaim",
        pass: status === 200,
        detail: status === 200 ? undefined : `status=${status}`,
      });
    } catch (e: any) {
      results.push({
        name: "POST /documents/:id/unclaim",
        pass: false,
        detail: e?.message || String(e),
      });
    }
  } else {
    results.push({ name: "POST /documents/:id/unclaim", pass: true, detail: "SKIP (no documents)" });
  }

  // 8) Audit log
  if (documentId) {
    try {
      const { status, data } = await request("GET", `/documents/${documentId}/audit`);
      const ok = status === 200 && data && Array.isArray((data as any).items);
      results.push({
        name: "GET /documents/:id/audit",
        pass: ok,
        detail: ok ? undefined : `status=${status}`,
      });
    } catch (e: any) {
      results.push({
        name: "GET /documents/:id/audit",
        pass: false,
        detail: e?.message || String(e),
      });
    }
  } else {
    results.push({
      name: "GET /documents/:id/audit",
      pass: true,
      detail: "SKIP (no documents)",
    });
  }

  // 9) Providers
  try {
    const { status, data } = await request("GET", "/providers");
    const ok = status === 200 && data && Array.isArray((data as any).items);
    results.push({
      name: "GET /providers",
      pass: ok,
      detail: ok ? undefined : `status=${status}`,
    });
  } catch (e: any) {
    results.push({ name: "GET /providers", pass: false, detail: e?.message || String(e) });
  }

  // 10) Records requests
  try {
    const { status, data } = await request("GET", "/cases/health-check-case-id/records-requests");
    const ok = status === 200 && data && Array.isArray((data as any).items);
    results.push({
      name: "GET /cases/:id/records-requests",
      pass: ok,
      detail: ok ? undefined : `status=${status}`,
    });
  } catch (e: any) {
    results.push({
      name: "GET /cases/:id/records-requests",
      pass: false,
      detail: e?.message || String(e),
    });
  }

  return { results, apiReachable: true };
}

run()
  .then(({ results, apiReachable }) => {
    let failed = 0;
    for (const r of results) {
      const label = r.pass ? "PASS" : "FAIL";
      console.log(`${label}  ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
      if (!r.pass) failed++;
    }
    if (!apiReachable) {
      console.log("\nAPI unreachable at " + (process.env.DOC_API_URL || "http://localhost:4000") + ". Start: cd apps/api && pnpm dev");
    }
    if (!API_KEY && results.some((r) => r.name === "DOC_API_KEY")) {
      console.log("\nDOC_API_KEY not set. Add to apps/api/.env to run authenticated checks.");
    }
    process.exit(failed > 0 ? 1 : 0);
  })
  .catch((err) => {
    console.error("Health check error:", err);
    process.exit(1);
  });
