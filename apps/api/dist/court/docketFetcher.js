"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchCourtDocket = fetchCourtDocket;
/**
 * Court docket ingestion: query docket, identify PDF filings, download, ingest into pipeline.
 * Real implementations can plug in PACER, state court APIs, etc.; default is a stub.
 */
const crypto_1 = __importDefault(require("crypto"));
const prisma_1 = require("../db/prisma");
const storage_1 = require("../services/storage");
const queue_1 = require("../services/queue");
/**
 * 1) Query court docket for the given case number.
 * Stub: returns empty list. Replace with PACER/state API when available.
 */
async function queryCourtDocket(caseNumber) {
    const driver = process.env.COURT_DOCKET_DRIVER || "stub";
    if (driver === "stub") {
        return [];
    }
    if (driver === "mock" && process.env.COURT_DOCKET_MOCK_URL) {
        try {
            const res = await fetch(process.env.COURT_DOCKET_MOCK_URL);
            if (!res.ok)
                return [];
            const buf = Buffer.from(await res.arrayBuffer());
            const name = `mock-filing-${caseNumber.replace(/\W/g, "-")}.pdf`;
            return [{ name, pdfBuffer: buf }];
        }
        catch {
            return [];
        }
    }
    return [];
}
/**
 * 2) Identify PDF filings (filter to entries that are or can be PDFs).
 */
function identifyPdfFilings(entries) {
    return entries.filter((e) => {
        if (e.pdfBuffer && e.pdfBuffer.length > 0)
            return true;
        const name = (e.name || "").toLowerCase();
        if (name.endsWith(".pdf"))
            return true;
        if (e.documentUrl && (e.documentUrl.toLowerCase().includes(".pdf") || e.documentUrl.includes("pdf")))
            return true;
        return false;
    });
}
/**
 * 3) Download PDFs: for entries with documentUrl but no pdfBuffer, fetch to buffer.
 */
async function downloadPdfs(entries) {
    const out = [];
    for (const e of entries) {
        let buf = e.pdfBuffer ?? null;
        if (!buf && e.documentUrl) {
            try {
                const res = await fetch(e.documentUrl);
                if (res.ok)
                    buf = Buffer.from(await res.arrayBuffer());
            }
            catch {
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
async function ingestIntoPipeline(firmId, caseId, filings) {
    let imported = 0;
    const errors = [];
    for (const { name, pdfBuffer } of filings) {
        try {
            const fileSha256 = crypto_1.default.createHash("sha256").update(pdfBuffer).digest("hex");
            const ext = name.toLowerCase().endsWith(".pdf") ? "pdf" : "pdf";
            const key = `${firmId}/court_docket/${Date.now()}_${crypto_1.default.randomBytes(6).toString("hex")}.${ext}`;
            await (0, storage_1.putObject)(key, pdfBuffer, "application/pdf");
            const doc = await prisma_1.prisma.document.create({
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
            await (0, queue_1.enqueueDocumentJob)({ documentId: doc.id, firmId });
            imported++;
        }
        catch (err) {
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
async function fetchCourtDocket(caseNumber, firmId, caseId) {
    const entries = await queryCourtDocket(caseNumber);
    const pdfEntries = identifyPdfFilings(entries);
    const filings = await downloadPdfs(pdfEntries);
    const { imported, errors } = await ingestIntoPipeline(firmId, caseId, filings);
    return {
        imported,
        ...(errors.length > 0 ? { errors } : {}),
    };
}
