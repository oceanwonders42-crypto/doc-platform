#!/usr/bin/env node
/**
 * Worker pipeline verification: upload sample PDF, trigger recognition, verify output.
 * Requires: DOC_API_URL, DOC_API_KEY. API must be running.
 */
import "dotenv/config";
import { PDFDocument, StandardFonts } from "pdf-lib";

const BASE = process.env.DOC_API_URL || "http://localhost:4000";
const API_KEY = process.env.DOC_API_KEY || "";

async function createSamplePdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
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

async function request(
  method: string,
  path: string,
  opts: { body?: object | Buffer; contentType?: string } = {}
): Promise<{ status: number; data: any }> {
  const url = path.startsWith("http") ? path : `${BASE}${path}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${API_KEY}`,
  };
  let body: string | Buffer | undefined;
  if (opts.body) {
    if (Buffer.isBuffer(opts.body)) {
      body = opts.body;
      headers["Content-Type"] = opts.contentType || "application/pdf";
    } else {
      body = JSON.stringify(opts.body);
      headers["Content-Type"] = "application/json";
    }
  }

  const res = await fetch(url, { method, headers, body });
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

async function ingestPdf(pdfBuffer: Buffer): Promise<string> {
  const form = new FormData();
  form.append("file", new Blob([pdfBuffer], { type: "application/pdf" }), "sample.pdf");
  const res = await fetch(`${BASE}/ingest`, {
    method: "POST",
    headers: { Authorization: `Bearer ${API_KEY}` },
    body: form,
  });
  const data = (await res.json()) as any;
  if (!res.ok || !data.documentId) throw new Error(data.error || "Ingest failed");
  return data.documentId;
}

async function run(): Promise<{ pass: boolean; documentId?: string; timings: Record<string, number> }> {
  const timings: Record<string, number> = {};
  let documentId: string | undefined;

  if (!API_KEY) {
    console.log("FAIL  DOC_API_KEY not set");
    process.exit(1);
  }

  // 1) Create and upload PDF
  const t0 = Date.now();
  const pdfBuffer = await createSamplePdf();
  documentId = await ingestPdf(pdfBuffer);
  timings.ingest_ms = Date.now() - t0;
  console.log(`  Ingest: ${timings.ingest_ms}ms (documentId=${documentId})`);

  // 2) Trigger recognition
  const t1 = Date.now();
  const recRes = await request("POST", `/documents/${documentId}/recognize`);
  timings.recognize_ms = Date.now() - t1;
  if (recRes.status !== 200 || !(recRes.data as any)?.ok) {
    console.log("FAIL  POST /documents/:id/recognize —", recRes.status, recRes.data);
    return { pass: false, documentId, timings };
  }
  console.log(`  Recognize: ${timings.recognize_ms}ms`);

  // 3) Fetch recognition result
  const t2 = Date.now();
  const getRes = await request("GET", `/documents/${documentId}/recognition`);
  timings.recognition_fetch_ms = Date.now() - t2;
  if (getRes.status !== 200 || !(getRes.data as any)?.ok) {
    console.log("FAIL  GET /documents/:id/recognition —", getRes.status, getRes.data);
    return { pass: false, documentId, timings };
  }

  const doc = (getRes.data as any).document;
  const recognition = (getRes.data as any).recognition;

  // 4) Verify: extracted text exists, suggested case exists, match confidence exists
  const hasExcerpt =
    recognition &&
    (typeof (recognition as any).textExcerpt === "string" || typeof (recognition as any).excerptLength === "number");
  const suggestedCase = (recognition as any)?.caseNumber ?? (doc as any)?.extractedFields?.case_number ?? null;
  const confidence = (recognition as any)?.confidence ?? (doc as any)?.confidence ?? null;

  const ok = hasExcerpt && (suggestedCase != null || (doc as any)?.extractedFields != null) && confidence != null;

  if (!hasExcerpt) console.log("  WARN  No extracted text / excerpt in recognition");
  if (suggestedCase == null && !(doc as any)?.extractedFields) console.log("  WARN  No suggested case / case number");
  if (confidence == null) console.log("  WARN  No match confidence");

  console.log("  Pipeline timing:", JSON.stringify(timings, null, 2));
  console.log(ok ? "PASS  Worker pipeline (extracted text, suggested case, confidence present)" : "FAIL  Worker pipeline verification");
  return { pass: ok, documentId, timings };
}

run()
  .then(({ pass }) => process.exit(pass ? 0 : 1))
  .catch((err) => {
    console.error("Worker pipeline error:", err);
    process.exit(1);
  });
