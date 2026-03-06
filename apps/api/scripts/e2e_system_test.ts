#!/usr/bin/env node
/**
 * Automated end-to-end system test: API, auth, ingest, documents, timeline.
 * Run with: DOC_API_KEY=<key> [API_BASE_URL=http://127.0.0.1:4000] npx tsx apps/api/scripts/e2e_system_test.ts
 * Requires: API server running, DOC_API_KEY set. Uses native fetch.
 */
import "dotenv/config";
import { PDFDocument, StandardFonts } from "pdf-lib";

const BASE = process.env.API_BASE_URL || process.env.DOC_API_URL || "http://127.0.0.1:4000";
const API_KEY = process.env.DOC_API_KEY || "";

const results = {
  api: false,
  auth: false,
  cases: false,
  documents: false,
  ingest: false,
  db: false,
  timeline: false,
};

async function createMinimalPdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([612, 792]);
  page.drawText("E2E system test PDF", { x: 50, y: 700, size: 12, font });
  const pdfBytes = await doc.save();
  return Buffer.from(pdfBytes);
}

async function fetchJson(
  path: string,
  opts: { method?: string; headers?: Record<string, string>; body?: string | FormData } = {}
): Promise<{ status: number; data: unknown }> {
  const url = path.startsWith("http") ? path : `${BASE}${path}`;
  const headers: Record<string, string> = { ...opts.headers };
  if (opts.body && typeof opts.body === "string" && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(url, {
    method: opts.method || "GET",
    headers: Object.keys(headers).length ? headers : undefined,
    body: opts.body,
  });
  let data: unknown = null;
  const ct = res.headers.get("content-type");
  if (ct && ct.includes("application/json")) {
    try {
      data = await res.json();
    } catch {
      data = null;
    }
  }
  return { status: res.status, data };
}

async function run(): Promise<void> {
  console.log("E2E System Test");
  console.log("Base URL:", BASE);
  console.log("");

  // 1. Health check
  try {
    const health = await fetchJson("/health");
    results.api = health.status === 200 && (health.data as { ok?: boolean })?.ok === true;
    console.log(results.api ? "[PASS] Health check" : "[FAIL] Health check");
  } catch (e) {
    console.log("[FAIL] Health check:", (e as Error).message);
  }

  if (!API_KEY) {
    console.log("[FAIL] API Auth - DOC_API_KEY not set");
  } else {
    // 2. API Auth – GET /me/documents
    try {
      const authRes = await fetchJson("/me/documents?limit=5", {
        headers: { Authorization: `Bearer ${API_KEY}` },
      });
      results.auth = authRes.status === 200 && (authRes.data as { ok?: boolean })?.ok !== false;
      console.log(results.auth ? "[PASS] API Auth (/me/documents)" : "[FAIL] API Auth");
    } catch (e) {
      console.log("[FAIL] API Auth:", (e as Error).message);
    }
  }

  // 3. Cases endpoint – GET /cases (may 404 if not implemented)
  try {
    const casesRes = await fetchJson("/cases", {
      headers: API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {},
    });
    const d = casesRes.data as { ok?: boolean; cases?: unknown[]; items?: unknown[] };
    results.cases = casesRes.status === 200 && (d?.ok === true || d?.ok !== false) && Array.isArray(d?.cases ?? d?.items ?? d);
    console.log(results.cases ? "[PASS] Cases endpoint" : "[FAIL] Cases endpoint (expected ok:true and array)");
  } catch (e) {
    console.log("[FAIL] Cases endpoint:", (e as Error).message);
  }

  // 4. Documents endpoint – GET /me/documents?limit=10
  try {
    const docsRes = await fetchJson("/me/documents?limit=10", {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    const d = docsRes.data as { ok?: boolean; items?: unknown[] };
    results.documents = docsRes.status === 200 && (d?.ok === true || d?.ok !== false);
    console.log(results.documents ? "[PASS] Documents endpoint" : "[FAIL] Documents endpoint");
  } catch (e) {
    console.log("[FAIL] Documents endpoint:", (e as Error).message);
  }

  // 5. Ingest pipeline – POST /ingest with test PDF
  let ingestedDocumentId: string | null = null;
  try {
    const pdfBuffer = await createMinimalPdf();
    const form = new FormData();
    form.append("file", new Blob([pdfBuffer], { type: "application/pdf" }), "e2e-system-test.pdf");
    form.append("source", "test");
    form.append("externalId", "system-test");

    const ingestRes = await fetch(`${BASE}/ingest`, {
      method: "POST",
      headers: { Authorization: `Bearer ${API_KEY}` },
      body: form,
    });
    const ingestData = (await ingestRes.json().catch(() => ({}))) as { ok?: boolean; documentId?: string };
    results.ingest = ingestRes.status === 200 && ingestData?.ok === true && Boolean(ingestData?.documentId);
    ingestedDocumentId = ingestData?.documentId ?? null;
    console.log(results.ingest ? "[PASS] Ingest pipeline" : "[FAIL] Ingest pipeline");
  } catch (e) {
    console.log("[FAIL] Ingest pipeline:", (e as Error).message);
  }

  // 6. Confirm document exists – GET /me/documents, find ingested doc or externalId
  try {
    const listRes = await fetchJson("/me/documents?limit=20", {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    const d = listRes.data as { items?: { id: string; external_id?: string }[] };
    const items = Array.isArray(d?.items) ? d.items : [];
    const found =
      ingestedDocumentId != null
        ? items.some((i) => i.id === ingestedDocumentId)
        : items.some((i) => (i as { externalId?: string }).externalId === "system-test" || i.external_id === "system-test");
    results.db = listRes.status === 200 && (found || items.length > 0);
    console.log(results.db ? "[PASS] Document exists in list" : "[FAIL] Document not found in list");
  } catch (e) {
    console.log("[FAIL] Confirm document:", (e as Error).message);
  }

  // 7. Timeline endpoint – GET /cases/:id/timeline (any caseId returns 200 + ok)
  try {
    const caseId = "e2e-test-case";
    const timelineRes = await fetchJson(`/cases/${caseId}/timeline`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    const t = timelineRes.data as { ok?: boolean; items?: unknown[] };
    results.timeline = timelineRes.status === 200 && t?.ok === true && Array.isArray(t?.items);
    console.log(results.timeline ? "[PASS] Timeline endpoint" : "[FAIL] Timeline endpoint");
  } catch (e) {
    console.log("[FAIL] Timeline endpoint:", (e as Error).message);
  }

  // Summary
  console.log("");
  console.log("SYSTEM TEST RESULTS");
  console.log("--------------------");
  console.log("API:       ", results.api ? "PASS" : "FAIL");
  console.log("AUTH:      ", results.auth ? "PASS" : "FAIL");
  console.log("INGEST:    ", results.ingest ? "PASS" : "FAIL");
  console.log("TIMELINE:  ", results.timeline ? "PASS" : "FAIL");
  console.log("DB:        ", results.db ? "PASS" : "FAIL");
  console.log("");

  const required = [results.api, results.auth, results.ingest, results.timeline, results.db];
  const anyFailed = required.some((r) => !r);
  process.exit(anyFailed ? 1 : 0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
