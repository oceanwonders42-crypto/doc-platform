/**
 * Court docket ingestion: query docket, identify PDF filings, download, ingest into pipeline.
 * Real implementations can plug in PACER, state court APIs, etc.; default is a stub.
 */
import crypto from "crypto";
import { prisma } from "../db/prisma";
import { putObject } from "../services/storage";
import { enqueueDocumentJob } from "../services/queue";

export type DocketEntry = {
  id?: string;
  name: string;
  documentUrl?: string | null;
  pdfBuffer?: Buffer | null;
  filedAt?: string | null;
};

export type FetchCourtDocketResult = {
  imported: number;
  errors?: string[];
};

/**
 * 1) Query court docket for the given case number.
 * Stub: returns empty list. Replace with PACER/state API when available.
 */
async function queryCourtDocket(caseNumber: string): Promise<DocketEntry[]> {
  const driver = process.env.COURT_DOCKET_DRIVER || "stub";
  if (driver === "stub") {
    return [];
  }
  if (driver === "mock" && process.env.COURT_DOCKET_MOCK_URL) {
    try {
      const res = await fetch(process.env.COURT_DOCKET_MOCK_URL);
      if (!res.ok) return [];
      const buf = Buffer.from(await res.arrayBuffer());
      const name = `mock-filing-${caseNumber.replace(/\W/g, "-")}.pdf`;
      return [{ name, pdfBuffer: buf }];
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * 2) Identify PDF filings (filter to entries that are or can be PDFs).
 */
function identifyPdfFilings(entries: DocketEntry[]): DocketEntry[] {
  return entries.filter((e) => {
    if (e.pdfBuffer && e.pdfBuffer.length > 0) return true;
    const name = (e.name || "").toLowerCase();
    if (name.endsWith(".pdf")) return true;
    if (e.documentUrl && (e.documentUrl.toLowerCase().includes(".pdf") || e.documentUrl.includes("pdf")))
      return true;
    return false;
  });
}

/**
 * 3) Download PDFs: for entries with documentUrl but no pdfBuffer, fetch to buffer.
 */
async function downloadPdfs(entries: DocketEntry[]): Promise<{ name: string; pdfBuffer: Buffer }[]> {
  const out: { name: string; pdfBuffer: Buffer }[] = [];
  for (const e of entries) {
    let buf: Buffer | null = e.pdfBuffer ?? null;
    if (!buf && e.documentUrl) {
      try {
        const res = await fetch(e.documentUrl);
        if (res.ok) buf = Buffer.from(await res.arrayBuffer());
      } catch {
        // skip this entry
        continue;
      }
    }
    if (buf && buf.length > 0) {
      const name = e.name && e.name.toLowerCase().endsWith(".pdf") ? e.name : `${e.name.replace(/\.[^.]+$/, "")}.pdf`;
      out.push({ name, pdfBuffer: buf });
    }
  }
  return out;
}

/**
 * 4) Ingest PDFs into pipeline: store, create Document, enqueue job. Optionally link to case.
 */
async function ingestIntoPipeline(
  firmId: string,
  caseId: string | null,
  filings: { name: string; pdfBuffer: Buffer }[]
): Promise<{ imported: number; errors: string[] }> {
  let imported = 0;
  const errors: string[] = [];
  for (const { name, pdfBuffer } of filings) {
    try {
      const fileSha256 = crypto.createHash("sha256").update(pdfBuffer).digest("hex");
      const ext = name.toLowerCase().endsWith(".pdf") ? "pdf" : "pdf";
      const key = `${firmId}/court_docket/${Date.now()}_${crypto.randomBytes(6).toString("hex")}.${ext}`;
      await putObject(key, pdfBuffer, "application/pdf");
      const doc = await prisma.document.create({
        data: {
          firmId,
          source: "court_docket",
          spacesKey: key,
          originalName: name,
          mimeType: "application/pdf",
          pageCount: 0,
          status: "RECEIVED",
          external_id: null,
          file_sha256: fileSha256,
          fileSizeBytes: pdfBuffer.length,
          ingestedAt: new Date(),
          ...(caseId ? { routedCaseId: caseId } : {}),
        },
      });
      await enqueueDocumentJob({ documentId: doc.id, firmId });
      imported++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${name}: ${msg}`);
    }
  }
  return { imported, errors };
}

/**
 * Full pipeline: query docket → identify PDFs → download → ingest.
 * Returns number of documents imported into the pipeline.
 */
export async function fetchCourtDocket(
  caseNumber: string,
  firmId: string,
  caseId: string | null
): Promise<FetchCourtDocketResult> {
  const entries = await queryCourtDocket(caseNumber);
  const pdfEntries = identifyPdfFilings(entries);
  const filings = await downloadPdfs(pdfEntries);
  const { imported, errors } = await ingestIntoPipeline(firmId, caseId, filings);
  return {
    imported,
    ...(errors.length > 0 ? { errors } : {}),
  };
}
