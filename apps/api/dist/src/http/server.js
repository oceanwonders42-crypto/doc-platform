"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const docRecognition_1 = require("../ai/docRecognition");
const storage_1 = require("../services/storage");
const pg_1 = require("../db/pg");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const crypto_1 = __importDefault(require("crypto"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const multer_1 = __importDefault(require("multer"));
const prisma_1 = require("../db/prisma");
const authApiKey_1 = require("./middleware/authApiKey");
const storage_2 = require("../services/storage");
const queue_1 = require("../services/queue");
const crmAdapter_1 = require("../integrations/crmAdapter");
function formatSuggestedCase(clientName, caseNumber) {
    const client = (clientName || "Unknown").trim();
    const caseRef = (caseNumber || "Unknown").trim();
    if (client === "Unknown" && caseRef === "Unknown")
        return "No suggested case";
    return `${client} v ${caseRef}`;
}
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json({ limit: "25mb" }));
app.get("/health", (_req, res) => res.json({ ok: true }));
// TEMP dev route: create a firm
app.post("/dev/create-firm", async (req, res) => {
    const { name } = req.body ?? {};
    if (!name)
        return res.status(400).json({ error: "name is required" });
    const firm = await prisma_1.prisma.firm.create({ data: { name } });
    res.json(firm);
});
// TEMP dev route: create an API key for a firm (shows secret once)
app.post("/dev/create-api-key/:firmId", async (req, res) => {
    const { firmId } = req.params;
    const { name } = req.body ?? {};
    if (!name)
        return res.status(400).json({ error: "name is required" });
    const rawKey = "sk_live_" + crypto_1.default.randomBytes(24).toString("hex");
    const keyHash = await bcryptjs_1.default.hash(rawKey, 10);
    await prisma_1.prisma.apiKey.create({
        data: {
            firmId,
            name,
            keyPrefix: rawKey.slice(0, 12),
            keyHash,
        },
    });
    res.json({
        message: "SAVE THIS KEY NOW. It will not be shown again.",
        apiKey: rawKey,
    });
});
// Ingest (API key protected)
const upload = (0, multer_1.default)({ storage: multer_1.default.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });
app.post("/ingest", authApiKey_1.authApiKey, upload.single("file"), async (req, res) => {
    const firmId = req.firmId;
    const file = req.file;
    const source = req.body?.source || "upload";
    if (!file)
        return res.status(400).json({ error: "Missing file (multipart field name must be 'file')" });
    const ext = (file.originalname.split(".").pop() || "bin").toLowerCase();
    const key = `${firmId}/${Date.now()}_${crypto_1.default.randomBytes(6).toString("hex")}.${ext}`;
    // Upload to MinIO
    await (0, storage_2.putObject)(key, file.buffer, file.mimetype || "application/octet-stream");
    // Create document row
    const doc = await prisma_1.prisma.document.create({
        data: {
            firmId,
            source,
            spacesKey: key,
            originalName: file.originalname,
            mimeType: file.mimetype || "application/octet-stream",
            pageCount: 0, // we'll add true PDF page counting next
            status: "RECEIVED",
        },
    });
    // Enqueue job
    await (0, queue_1.enqueueDocumentJob)({ documentId: doc.id, firmId });
    res.json({ ok: true, documentId: doc.id, spacesKey: key });
});
const port = process.env.PORT ? Number(process.env.PORT) : 4000;
// === Firm-scoped endpoints ===
// Current month usage + firm plan info
app.get("/me/usage", authApiKey_1.authApiKey, async (req, res) => {
    const firmId = req.firmId;
    const now = new Date();
    const ym = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    const firm = await prisma_1.prisma.firm.findUnique({
        where: { id: firmId },
        select: { id: true, name: true, plan: true, pageLimitMonthly: true, status: true },
    });
    if (!firm)
        return res.status(404).json({ error: "Firm not found" });
    const usage = await prisma_1.prisma.usageMonthly.findUnique({
        where: { firmId_yearMonth: { firmId, yearMonth: ym } },
        select: { yearMonth: true, pagesProcessed: true, docsProcessed: true, updatedAt: true },
    });
    res.json({
        firm,
        usage: usage ?? { yearMonth: ym, pagesProcessed: 0, docsProcessed: 0 },
    });
});
// List documents for intake dashboard (with optional status filter, recognition data)
app.get("/documents", authApiKey_1.authApiKey, async (req, res) => {
    try {
        const firmId = req.firmId;
        const status = typeof req.query.status === "string" ? req.query.status.trim() || null : null;
        const limitRaw = typeof req.query.limit === "string" ? req.query.limit : Array.isArray(req.query.limit) ? req.query.limit[0] : null;
        const limit = Math.min(Math.max(parseInt(String(limitRaw ?? "100"), 10) || 100, 1), 500);
        const { rows } = await pg_1.pgPool.query(`
      select
        d.id,
        d."originalName" as "fileName",
        d.status,
        d."suggestedCaseId" as "suggestedCaseId",
        d."routingStatus" as "routingStatus",
        d."routedCaseId" as "routedCaseId",
        d."createdAt" as "createdAt",
        r.doc_type as "docType",
        r.confidence as "confidence",
        r.client_name as "clientName",
        r.case_number as "caseNumber",
        r.match_confidence as "matchConfidence",
        r.match_reason as "matchReason",
        r.ocr_provider as "ocrProvider"
      from "Document" d
      left join document_recognition r on r.document_id = d.id
      where d."firmId" = $1
      ${status ? "and d.status = $2" : ""}
      order by d."createdAt" desc
      limit ${status ? "$3" : "$2"}
      `, status ? [firmId, status, limit] : [firmId, limit]);
        const documents = rows.map((r) => ({
            id: r.id,
            fileName: r.fileName,
            status: r.status,
            docType: r.docType ?? null,
            confidence: r.confidence != null ? Number(r.confidence) : null,
            clientName: r.clientName ?? null,
            caseNumber: r.caseNumber ?? null,
            matchConfidence: r.matchConfidence != null ? Number(r.matchConfidence) : null,
            matchReason: r.matchReason ?? null,
            ocrProvider: r.ocrProvider ?? null,
            suggestedCaseId: r.suggestedCaseId,
            routingStatus: r.routingStatus,
            routedCaseId: r.routedCaseId,
            createdAt: r.createdAt,
        }));
        res.json({ documents });
    }
    catch (e) {
        res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
});
// All cases for the firm (for dropdowns / intake)
app.get("/cases", authApiKey_1.authApiKey, async (req, res) => {
    try {
        const firmId = req.firmId;
        const cases = await prisma_1.prisma.case.findMany({
            where: { firmId },
            orderBy: { caseNumber: "asc" },
            select: {
                id: true,
                caseNumber: true,
                title: true,
                client: { select: { name: true } },
            },
        });
        res.json({
            cases: cases.map((c) => ({
                id: c.id,
                caseNumber: c.caseNumber,
                title: c.title,
                clientName: c.client.name,
            })),
        });
    }
    catch (e) {
        res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
});
// Latest documents (cursor pagination)
app.get("/me/documents", authApiKey_1.authApiKey, async (req, res) => {
    const firmId = req.firmId;
    const limitRaw = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit;
    const cursorRaw = Array.isArray(req.query.cursor) ? req.query.cursor[0] : req.query.cursor;
    const limit = Math.min(Math.max(parseInt(String(limitRaw ?? "25"), 10) || 25, 1), 100);
    const cursor = cursorRaw ? String(cursorRaw) : null;
    const docs = await prisma_1.prisma.document.findMany({
        where: { firmId },
        orderBy: { createdAt: "desc" },
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: {
            id: true,
            source: true,
            originalName: true,
            mimeType: true,
            pageCount: true,
            status: true,
            spacesKey: true,
            createdAt: true,
            processedAt: true,
        },
    });
    const hasMore = docs.length > limit;
    const items = hasMore ? docs.slice(0, limit) : docs;
    const nextCursor = hasMore ? items[items.length - 1].id : null;
    res.json({ items, nextCursor });
});
app.post("/documents/:id/recognize", authApiKey_1.authApiKey, async (req, res) => {
    try {
        const firmId = req.firmId;
        const documentId = String(req.params.id ?? "");
        // Fetch document storage key from Document table (firm-scoped to prevent IDOR)
        const { rows } = await pg_1.pgPool.query(`
      select "spacesKey" as key, "mimeType" as mime_type
      from "Document"
      where id = $1 and "firmId" = $2
      limit 1
      `, [documentId, firmId]);
        if (!rows.length) {
            return res.status(404).json({ ok: false, error: "document not found / no key" });
        }
        const key = rows[0].key;
        const mimeType = rows[0].mime_type || "";
        const isPdf = mimeType === "application/pdf" ||
            (key.toLowerCase().endsWith(".pdf"));
        if (!isPdf) {
            return res.status(400).json({
                ok: false,
                error: "Document is not a PDF; recognition is only supported for PDFs",
            });
        }
        const bytes = await (0, storage_1.getObjectBuffer)(key);
        const text = await (0, docRecognition_1.extractTextFromPdf)(bytes);
        console.log("[recognize]", {
            documentId,
            spacesKey: key,
            extractedTextLength: text.length,
        });
        const result = (0, docRecognition_1.classifyAndExtract)(text);
        await pg_1.pgPool.query(`
      insert into document_recognition
      (document_id,text_excerpt,doc_type,client_name,case_number,incident_date,confidence)
      values ($1,$2,$3,$4,$5,$6,$7)
      on conflict (document_id) do update
      set
        text_excerpt=excluded.text_excerpt,
        doc_type=excluded.doc_type,
        client_name=excluded.client_name,
        case_number=excluded.case_number,
        incident_date=excluded.incident_date,
        confidence=excluded.confidence,
        updated_at=now()
      `, [
            documentId,
            result.excerpt,
            result.docType,
            result.clientName,
            result.caseNumber,
            result.incidentDate,
            result.confidence,
        ]);
        res.json({
            ok: true,
            documentId,
            docType: result.docType,
            confidence: result.confidence,
            caseNumber: result.caseNumber,
            clientName: result.clientName,
            incidentDate: result.incidentDate,
            excerptLength: (result.excerpt || "").length,
            excerpt: result.excerpt,
        });
    }
    catch (e) {
        res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
});
// Route document to CRM (Clio, Litify, generic webhook)
app.post("/documents/:id/route", authApiKey_1.authApiKey, async (req, res) => {
    try {
        const firmId = req.firmId;
        const documentId = String(req.params.id ?? "");
        const { system, caseId, config } = req.body ?? {};
        if (!system || !caseId) {
            return res.status(400).json({ ok: false, error: "system and caseId are required" });
        }
        const doc = await prisma_1.prisma.document.findFirst({
            where: { id: documentId, firmId },
            select: { id: true },
        });
        if (!doc) {
            return res.status(404).json({ ok: false, error: "document not found" });
        }
        const result = await (0, crmAdapter_1.routeDocumentToCrm)(documentId, system, caseId, config);
        if (result.ok) {
            return res.json({ ok: true, message: "routed", externalId: result.externalId });
        }
        return res.status(400).json({ ok: false, error: result.error });
    }
    catch (e) {
        res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
});
// Approve suggested case (route to CRM and clear needs-review)
app.post("/documents/:id/approve", authApiKey_1.authApiKey, async (req, res) => {
    try {
        const firmId = req.firmId;
        const documentId = String(req.params.id ?? "");
        const { caseId, system = "generic" } = req.body ?? {};
        const doc = await prisma_1.prisma.document.findFirst({
            where: { id: documentId, firmId },
            select: { id: true },
        });
        if (!doc)
            return res.status(404).json({ ok: false, error: "document not found" });
        const caseIdToUse = caseId || null;
        if (!caseIdToUse) {
            return res.status(400).json({ ok: false, error: "caseId is required for approve" });
        }
        const result = await (0, crmAdapter_1.routeDocumentToCrm)(documentId, system, caseIdToUse);
        if (result.ok) {
            await prisma_1.prisma.document.update({
                where: { id: documentId },
                data: { status: "UPLOADED", routingStatus: "sent" },
            });
            return res.json({ ok: true, message: "approved and routed" });
        }
        return res.status(400).json({ ok: false, error: result.error });
    }
    catch (e) {
        res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
});
// Reject suggested case (mark as rejected, no routing)
app.post("/documents/:id/reject", authApiKey_1.authApiKey, async (req, res) => {
    try {
        const firmId = req.firmId;
        const documentId = String(req.params.id ?? "");
        const doc = await prisma_1.prisma.document.findFirst({
            where: { id: documentId, firmId },
            select: { id: true },
        });
        if (!doc)
            return res.status(404).json({ ok: false, error: "document not found" });
        await prisma_1.prisma.document.update({
            where: { id: documentId },
            data: { routingStatus: "rejected" },
        });
        return res.json({ ok: true, message: "rejected" });
    }
    catch (e) {
        res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
});
// Get recognition result for a document (firm-scoped)
app.get("/documents/:id/recognition", authApiKey_1.authApiKey, async (req, res) => {
    try {
        const firmId = req.firmId;
        const documentId = String(req.params.id ?? "");
        const doc = await prisma_1.prisma.document.findFirst({
            where: { id: documentId, firmId },
            select: { id: true, originalName: true, status: true, confidence: true, extractedFields: true, routedCaseId: true, routingStatus: true, suggestedCaseId: true },
        });
        if (!doc) {
            return res.status(404).json({ ok: false, error: "document not found" });
        }
        const { rows } = await pg_1.pgPool.query(`select document_id, text_excerpt, doc_type, client_name, case_number, incident_date, confidence, ocr_provider, ocr_confidence, ocr_json_key, match_confidence, match_reason, updated_at
       from document_recognition where document_id = $1`, [documentId]);
        const rec = rows[0] || null;
        let suggestedCaseDisplay = rec ? formatSuggestedCase(rec.client_name, rec.case_number) : "";
        if (doc.suggestedCaseId) {
            const suggestedCaseRecord = await prisma_1.prisma.case.findFirst({
                where: { id: doc.suggestedCaseId, firmId },
                select: { title: true, caseNumber: true },
            });
            if (suggestedCaseRecord) {
                suggestedCaseDisplay = `${suggestedCaseRecord.title} (${suggestedCaseRecord.caseNumber})`;
            }
        }
        res.json({
            ok: true,
            document: { id: doc.id, originalName: doc.originalName, status: doc.status, confidence: doc.confidence, extractedFields: doc.extractedFields, routedCaseId: doc.routedCaseId, routingStatus: doc.routingStatus, suggestedCaseId: doc.suggestedCaseId },
            recognition: rec
                ? {
                    docType: rec.doc_type,
                    clientName: rec.client_name,
                    caseNumber: rec.case_number,
                    incidentDate: rec.incident_date,
                    confidence: rec.confidence,
                    textExcerpt: rec.text_excerpt,
                    excerptLength: (rec.text_excerpt || "").length,
                    ocrProvider: rec.ocr_provider ?? undefined,
                    ocrConfidence: rec.ocr_confidence ?? undefined,
                    ocrJsonKey: rec.ocr_json_key ?? undefined,
                    matchConfidence: rec.match_confidence != null ? Number(rec.match_confidence) : undefined,
                    matchReason: rec.match_reason ?? undefined,
                    updatedAt: rec.updated_at,
                    suggestedCase: suggestedCaseDisplay,
                    suggestedCaseId: doc.suggestedCaseId ?? rec.case_number ?? undefined,
                }
                : null,
        });
    }
    catch (e) {
        res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
});
// Search cases for autocomplete (e.g. Change Case input)
app.get("/cases/search", authApiKey_1.authApiKey, async (req, res) => {
    try {
        const firmId = req.firmId;
        const q = String(req.query.q ?? "").trim();
        if (!q) {
            return res.json({ ok: true, cases: [] });
        }
        const cases = await prisma_1.prisma.case.findMany({
            where: {
                firmId,
                OR: [
                    { caseNumber: { contains: q, mode: "insensitive" } },
                    { title: { contains: q, mode: "insensitive" } },
                    { client: { name: { contains: q, mode: "insensitive" } } },
                ],
            },
            take: 20,
            select: {
                id: true,
                caseNumber: true,
                title: true,
                client: { select: { name: true } },
            },
        });
        res.json({
            ok: true,
            cases: cases.map((c) => ({
                id: c.id,
                caseNumber: c.caseNumber,
                title: c.title,
                clientName: c.client.name,
            })),
        });
    }
    catch (e) {
        res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
});
// Medical timeline for a case (firm-scoped) — must be after /cases/search
app.get("/cases/:caseId/timeline", authApiKey_1.authApiKey, async (req, res) => {
    try {
        const firmId = req.firmId;
        const caseId = String(req.params.caseId ?? "");
        const c = await prisma_1.prisma.case.findFirst({
            where: { id: caseId, firmId },
            select: { id: true },
        });
        if (!c) {
            return res.status(404).json({ ok: false, error: "Case not found" });
        }
        const events = await prisma_1.prisma.medicalEvent.findMany({
            where: { caseId, firmId },
            orderBy: { eventDate: "asc" },
            select: {
                eventDate: true,
                eventType: true,
                facilityName: true,
                providerName: true,
                diagnosis: true,
                procedure: true,
                documentId: true,
            },
        });
        res.json({
            events: events.map((e) => ({
                eventDate: e.eventDate,
                eventType: e.eventType,
                facilityName: e.facilityName,
                providerName: e.providerName,
                diagnosis: e.diagnosis,
                procedure: e.procedure,
                documentId: e.documentId,
            })),
        });
    }
    catch (e) {
        res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
});
app.get("/mailboxes/:id/recent-ingests", async (req, res) => {
    try {
        const mailboxId = req.params.id;
        const { rows } = await pg_1.pgPool.query(`
      select
        ea.id,
        ea.filename,
        ea.sha256,
        ea.ingest_document_id,
        em.subject,
        em.from_email,
        em.received_at,
        ea.created_at
      from email_attachments ea
      join email_messages em on em.id = ea.email_message_id
      where em.mailbox_connection_id = $1
      order by ea.created_at desc
      limit 20
      `, [mailboxId]);
        res.json({ ok: true, items: rows });
    }
    catch (e) {
        res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
});
app.get("/mailboxes", async (_req, res) => {
    try {
        const { rows } = await pg_1.pgPool.query(`
      select
        id,
        firm_id,
        provider,
        imap_username,
        imap_host,
        folder,
        status,
        last_uid,
        last_sync_at,
        last_error,
        updated_at
      from mailbox_connections
      order by updated_at desc
      limit 50
      `);
        res.json({ ok: true, items: rows });
    }
    catch (e) {
        res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
});
app.listen(port, () => console.log(`API listening on :${port}`));
