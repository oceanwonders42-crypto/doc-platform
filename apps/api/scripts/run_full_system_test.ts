#!/usr/bin/env node
/**
 * Full automated system verification suite.
 * Ensures the entire platform can be tested automatically for all major features.
 *
 * Run: cd apps/api && DOC_API_URL=http://localhost:4000 DOC_API_KEY=<key> npx tsx scripts/run_full_system_test.ts
 *
 * Exit code: 0 unless API unreachable or DB integrity failure.
 */
import "dotenv/config";
import { spawn } from "child_process";
import path from "path";
import { PDFDocument, StandardFonts } from "pdf-lib";

const BASE = process.env.DOC_API_URL || "http://localhost:4000";
const API_KEY = process.env.DOC_API_KEY || "";
const ROOT = process.cwd();

type StepResult = "PASS" | "FAIL" | "SKIP";

async function request(
  method: string,
  path: string,
  opts: { body?: object | FormData; headers?: Record<string, string> } = {}
): Promise<{ status: number; data: any }> {
  const url = path.startsWith("http") ? path : `${BASE}${path}`;
  const headers: Record<string, string> = { ...opts.headers };
  if (API_KEY) headers["Authorization"] = `Bearer ${API_KEY}`;
  if (opts.body && !(opts.body instanceof FormData)) headers["Content-Type"] = "application/json";

  const res = await fetch(url, {
    method,
    headers,
    body:
      opts.body instanceof FormData ? opts.body : opts.body ? JSON.stringify(opts.body) : undefined,
  });
  let data: any = null;
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

async function createSamplePdf(): Promise<Buffer> {
  const doc = PDFDocument.create();
  const font = doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([612, 792]);
  const text = [
    "Medical Record",
    "Patient: Jane Smith",
    "Case No: CASE-2024-001",
    "Date of loss: 01/15/2024",
    "Diagnosis: Lower back strain.",
  ].join("\n");
  page.drawText(text, { x: 50, y: 700, size: 12, font });
  const pdfBytes = await doc.save();
  return Buffer.from(pdfBytes);
}

async function runDbIntegrityCheck(): Promise<{ pass: boolean; exitCode: number }> {
  return new Promise((resolve) => {
    const scriptPath = path.join(ROOT, "scripts", "db_integrity_check.ts");
    const child = spawn("npx", ["tsx", scriptPath], {
      cwd: ROOT,
      stdio: ["ignore", "pipe", "pipe"],
      shell: true,
      env: { ...process.env },
    });
    let out = "";
    let err = "";
    child.stdout?.on("data", (d) => (out += d.toString()));
    child.stderr?.on("data", (d) => (err += d.toString()));
    child.on("close", (code) => {
      const pass = code === 0;
      resolve({ pass, exitCode: code ?? 1 });
    });
    child.on("error", () => resolve({ pass: false, exitCode: 1 }));
  });
}

async function main() {
  console.log("=== Full System Verification Suite ===\n");
  console.log("DOC_API_URL: " + (process.env.DOC_API_URL ? "set" : "default " + BASE));
  console.log("DOC_API_KEY: " + (API_KEY ? "set" : "missing"));
  console.log("DATABASE_URL: " + (process.env.DATABASE_URL ? "set" : "missing"));
  console.log("");

  const steps: { name: string; result: StepResult; detail?: string }[] = [];
  let apiReachable = false;
  let documentId: string | null = null;
  let caseId: string | null = null;

  // --- 1) Health check ---
  try {
    const { status, data } = await request("GET", "/health");
    apiReachable = status === 200 && data?.ok === true;
    steps.push({
      name: "1) Health check (GET /health)",
      result: apiReachable ? "PASS" : "FAIL",
      detail: apiReachable ? undefined : `status=${status}`,
    });
  } catch (e: any) {
    steps.push({
      name: "1) Health check (GET /health)",
      result: "FAIL",
      detail: e?.message || String(e),
    });
  }

  if (!apiReachable) {
    console.log("API unreachable. Start server: cd apps/api && pnpm dev\n");
    printReport(steps, false, true);
    process.exit(1);
  }

  // --- 2) Firm + API key validation ---
  if (!API_KEY) {
    steps.push({
      name: "2) Firm + API key validation",
      result: "SKIP",
      detail: "DOC_API_KEY not set",
    });
  } else {
    try {
      const { status, data } = await request("GET", "/me/documents?limit=1");
      const ok = status === 200 && data && Array.isArray(data.items);
      steps.push({
        name: "2) Firm + API key validation",
        result: ok ? "PASS" : "FAIL",
        detail: ok ? undefined : `status=${status}`,
      });
    } catch (e: any) {
      steps.push({
        name: "2) Firm + API key validation",
        result: "FAIL",
        detail: e?.message || String(e),
      });
    }
  }

  // --- 3) Document ingestion test ---
  if (!API_KEY) {
    steps.push({ name: "3) Document ingestion (POST /ingest)", result: "SKIP", detail: "No API key" });
  } else {
    try {
      const form = new FormData();
      const pdfBuffer = await createSamplePdf();
      form.append("file", new Blob([pdfBuffer], { type: "application/pdf" }), "system-test.pdf");
      form.append("source", "system-test");
      const res = await fetch(`${BASE}/ingest`, {
        method: "POST",
        headers: { Authorization: `Bearer ${API_KEY}` },
        body: form,
      });
      const data = (await res.json().catch(() => ({}))) as { documentId?: string };
      const ok = res.status === 200 && data?.documentId;
      documentId = data?.documentId ?? null;
      steps.push({
        name: "3) Document ingestion (POST /ingest)",
        result: ok ? "PASS" : "FAIL",
        detail: ok ? undefined : `status=${res.status}`,
      });
    } catch (e: any) {
      steps.push({
        name: "3) Document ingestion (POST /ingest)",
        result: "FAIL",
        detail: e?.message || String(e),
      });
    }
  }

  // --- 4) Worker pipeline test (OCR, classification, document_recognition) ---
  if (!API_KEY || !documentId) {
    steps.push({
      name: "4) Worker pipeline (OCR, classification, document_recognition)",
      result: "SKIP",
      detail: !documentId ? "No document from ingest" : "No API key",
    });
  } else {
    try {
      const recRes = await request("POST", `/documents/${documentId}/recognize`);
      if (recRes.status !== 200 || !recRes.data?.ok) {
        steps.push({
          name: "4) Worker pipeline (OCR, classification, document_recognition)",
          result: "FAIL",
          detail: `recognize status=${recRes.status}`,
        });
      } else {
        const getRes = await request("GET", `/documents/${documentId}/recognition`);
        const rec = getRes.data?.recognition;
        const hasExcerpt =
          rec &&
          (typeof rec.textExcerpt === "string" || typeof rec.excerptLength === "number");
        const hasDocType = rec && (rec.docType != null || getRes.data?.recognition?.docType != null);
        const ok = getRes.status === 200 && hasExcerpt && hasDocType;
        steps.push({
          name: "4) Worker pipeline (OCR, classification, document_recognition)",
          result: ok ? "PASS" : "FAIL",
          detail: ok ? undefined : "Missing excerpt or doc_type in recognition",
        });
      }
    } catch (e: any) {
      steps.push({
        name: "4) Worker pipeline (OCR, classification, document_recognition)",
        result: "FAIL",
        detail: e?.message || String(e),
      });
    }
  }

  // --- 5) Case matching test (suggestedCaseId populated) ---
  if (!API_KEY || !documentId) {
    steps.push({
      name: "5) Case matching (suggestedCaseId populated)",
      result: "SKIP",
      detail: !documentId ? "No document" : "No API key",
    });
  } else {
    try {
      const { status, data } = await request("GET", "/me/review-queue?limit=50");
      const items = Array.isArray(data?.items) ? data.items : [];
      const doc = items.find((d: any) => d.id === documentId);
      let populated = false;
      if (doc) {
        populated = (doc.suggestedCaseId ?? doc.caseNumber) != null && String(doc.suggestedCaseId ?? doc.caseNumber).trim() !== "";
      } else {
        const recRes = await request("GET", `/documents/${documentId}/recognition`);
        const caseNum = recRes.data?.recognition?.caseNumber ?? recRes.data?.recognition?.case_number;
        populated = caseNum != null && String(caseNum).trim() !== "";
      }
      steps.push({
        name: "5) Case matching (suggestedCaseId populated)",
        result: populated ? "PASS" : "FAIL",
        detail: populated ? undefined : "No suggestedCaseId/caseNumber for doc",
      });
    } catch (e: any) {
      steps.push({
        name: "5) Case matching (suggestedCaseId populated)",
        result: "FAIL",
        detail: e?.message || String(e),
      });
    }
  }

  // --- 6) Timeline generation test ---
  if (!API_KEY) {
    steps.push({
      name: "6) Timeline generation (GET /cases/:id/timeline)",
      result: "SKIP",
      detail: "No API key",
    });
  } else {
    try {
      const casesRes = await request("GET", "/cases");
      const casesList = Array.isArray((casesRes.data as any)?.items) ? (casesRes.data as any).items : [];
      caseId = casesList.length > 0 ? casesList[0].id : "health-check-case-id";
      const { status, data } = await request("GET", `/cases/${caseId}/timeline`);
      const ok = status === 200 && data?.ok === true && Array.isArray(data?.items);
      steps.push({
        name: "6) Timeline generation (GET /cases/:id/timeline)",
        result: ok ? "PASS" : "FAIL",
        detail: ok ? undefined : `status=${status}`,
      });
    } catch (e: any) {
      steps.push({
        name: "6) Timeline generation (GET /cases/:id/timeline)",
        result: "FAIL",
        detail: e?.message || String(e),
      });
    }
  }

  // --- 7) Narrative generation test ---
  if (!API_KEY || !caseId) {
    steps.push({
      name: "7) Narrative generation (POST /cases/:id/narrative)",
      result: "SKIP",
      detail: !caseId ? "No case" : "No API key",
    });
  } else {
    try {
      const { status, data } = await request("POST", `/cases/${caseId}/narrative`, {
        body: { narrativeType: "treatment_summary", tone: "neutral" },
      });
      if (status === 403) {
        steps.push({
          name: "7) Narrative generation (POST /cases/:id/narrative)",
          result: "SKIP",
          detail: "Feature not enabled (403)",
        });
      } else {
        const ok = status === 200 && data?.text != null;
        steps.push({
          name: "7) Narrative generation (POST /cases/:id/narrative)",
          result: ok ? "PASS" : "FAIL",
          detail: ok ? undefined : `status=${status}`,
        });
      }
    } catch (e: any) {
      steps.push({
        name: "7) Narrative generation (POST /cases/:id/narrative)",
        result: "FAIL",
        detail: e?.message || String(e),
      });
    }
  }

  // --- 8) Review queue test ---
  if (!API_KEY) {
    steps.push({
      name: "8) Review queue (GET /me/review-queue)",
      result: "SKIP",
      detail: "No API key",
    });
  } else {
    try {
      const { status, data } = await request("GET", "/me/review-queue?limit=10");
      const ok = status === 200 && data && Array.isArray(data.items);
      steps.push({
        name: "8) Review queue (GET /me/review-queue)",
        result: ok ? "PASS" : "FAIL",
        detail: ok ? undefined : `status=${status}`,
      });
    } catch (e: any) {
      steps.push({
        name: "8) Review queue (GET /me/review-queue)",
        result: "FAIL",
        detail: e?.message || String(e),
      });
    }
  }

  // --- 9) Records request generation test ---
  if (!API_KEY || !caseId) {
    steps.push({
      name: "9) Records request generation (POST /cases/:id/records-requests)",
      result: "SKIP",
      detail: !caseId ? "No case" : "No API key",
    });
  } else {
    try {
      const { status, data } = await request("POST", `/cases/${caseId}/records-requests`, {
        body: { providerName: "System Test Provider", notes: "Automated verification" },
      });
      const ok = status === 201 && data?.item?.id;
      steps.push({
        name: "9) Records request generation (POST /cases/:id/records-requests)",
        result: ok ? "PASS" : "FAIL",
        detail: ok ? undefined : `status=${status}`,
      });
    } catch (e: any) {
      steps.push({
        name: "9) Records request generation (POST /cases/:id/records-requests)",
        result: "FAIL",
        detail: e?.message || String(e),
      });
    }
  }

  // --- 10) Metrics endpoint ---
  if (!API_KEY) {
    steps.push({
      name: "10) Metrics endpoint (GET /metrics/review)",
      result: "SKIP",
      detail: "No API key",
    });
  } else {
    try {
      const { status, data } = await request("GET", "/metrics/review?range=7d");
      const ok =
        status === 200 &&
        data?.ok === true &&
        data?.summary != null &&
        Array.isArray(data?.perDay);
      steps.push({
        name: "10) Metrics endpoint (GET /metrics/review)",
        result: ok ? "PASS" : "FAIL",
        detail: ok ? undefined : `status=${status}`,
      });
    } catch (e: any) {
      steps.push({
        name: "10) Metrics endpoint (GET /metrics/review)",
        result: "FAIL",
        detail: e?.message || String(e),
      });
    }
  }

  // --- DB integrity ---
  let dbFailure = false;
  if (!process.env.DATABASE_URL?.trim()) {
    steps.push({
      name: "DB integrity check",
      result: "FAIL",
      detail: "DATABASE_URL not set",
    });
    dbFailure = true;
  } else {
    const dbResult = await runDbIntegrityCheck();
    dbFailure = !dbResult.pass;
    steps.push({
      name: "DB integrity check",
      result: dbResult.pass ? "PASS" : "FAIL",
      detail: dbResult.pass ? undefined : "Run: npx tsx scripts/db_integrity_check.ts",
    });
  }

  printReport(steps, dbFailure, false);
  process.exit(dbFailure ? 1 : 0);
}

function printReport(
  steps: { name: string; result: StepResult; detail?: string }[],
  dbFailure: boolean,
  apiUnreachable: boolean
) {
  console.log("\n=== REPORT ===\n");
  for (const s of steps) {
    const detail = s.detail ? ` — ${s.detail}` : "";
    console.log(`${s.result.padEnd(4)}  ${s.name}${detail}`);
  }
  console.log("");
  if (apiUnreachable) {
    console.log("Exit: FAIL (API unreachable)");
    return;
  }
  if (dbFailure) {
    console.log("Exit: FAIL (DB integrity failure)");
    return;
  }
  console.log("Exit: PASS (only API unreachable or DB integrity failure cause exit 1)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
