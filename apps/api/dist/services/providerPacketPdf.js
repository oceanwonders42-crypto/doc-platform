"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildProviderPacketPdf = buildProviderPacketPdf;
/**
 * Builds a medical provider intake packet PDF: cover sheet, client info, case info, selected document summaries.
 */
const pdf_lib_1 = require("pdf-lib");
const prisma_1 = require("../db/prisma");
const pg_1 = require("../db/pg");
const MARGIN = 50;
const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const FONT_SIZE = 10;
const TITLE_SIZE = 16;
const SECTION_SIZE = 12;
const MAX_LINE_WIDTH = PAGE_WIDTH - 2 * MARGIN;
const LINE_SPACE = 4;
const SECTION_GAP = 12;
async function buildProviderPacketPdf(input) {
    const { caseId, firmId, providerId, includeDocuments = [] } = input;
    const [legalCase, provider, firm] = await Promise.all([
        prisma_1.prisma.legalCase.findFirst({
            where: { id: caseId, firmId },
            select: { id: true, title: true, caseNumber: true, clientName: true, createdAt: true },
        }),
        prisma_1.prisma.provider.findFirst({
            where: { id: providerId, firmId },
            select: { id: true, name: true, address: true, city: true, state: true, phone: true, email: true, specialty: true },
        }),
        prisma_1.prisma.firm.findUnique({
            where: { id: firmId },
            select: { name: true },
        }),
    ]);
    if (!legalCase)
        throw new Error("Case not found");
    if (!provider)
        throw new Error("Provider not found");
    const docIds = includeDocuments.length > 0
        ? await prisma_1.prisma.document
            .findMany({
            where: { id: { in: includeDocuments }, firmId, routedCaseId: caseId },
            select: { id: true, originalName: true },
        })
            .then((docs) => docs.map((d) => d.id))
        : [];
    let recRows = [];
    const docByName = new Map();
    if (docIds.length > 0) {
        const docs = await prisma_1.prisma.document.findMany({
            where: { id: { in: docIds }, firmId },
            select: { id: true, originalName: true },
        });
        docs.forEach((d) => docByName.set(d.id, d.originalName));
        const { rows } = await pg_1.pgPool.query(`select document_id, doc_type, summary from document_recognition where document_id = any($1)`, [docIds]);
        recRows = rows;
    }
    const recByDoc = new Map(recRows.map((r) => [r.document_id, r]));
    const docSummaries = docIds.map((id) => {
        const rec = recByDoc.get(id);
        let summaryPayload = null;
        if (rec?.summary != null) {
            if (typeof rec.summary === "object" && rec.summary !== null && "summary" in rec.summary) {
                summaryPayload = rec.summary;
            }
            else if (typeof rec.summary === "string") {
                try {
                    summaryPayload = JSON.parse(rec.summary);
                }
                catch {
                    summaryPayload = { summary: rec.summary };
                }
            }
        }
        return {
            document_id: id,
            original_name: docByName.get(id) ?? "Document",
            doc_type: rec?.doc_type ?? null,
            summary: summaryPayload,
        };
    });
    const doc = await pdf_lib_1.PDFDocument.create();
    const font = await doc.embedFont(pdf_lib_1.StandardFonts.Helvetica);
    const fontBold = await doc.embedFont(pdf_lib_1.StandardFonts.HelveticaBold);
    let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    let y = PAGE_HEIGHT - MARGIN;
    const ensureSpace = (needed) => {
        if (y - needed < MARGIN) {
            page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
            y = PAGE_HEIGHT - MARGIN;
        }
    };
    const drawLine = (text, opts) => {
        const size = opts?.fontSize ?? FONT_SIZE;
        ensureSpace(size + LINE_SPACE);
        const f = opts?.bold ? fontBold : font;
        page.drawText(text, { x: MARGIN, y, size, font: f });
        y -= size + LINE_SPACE;
    };
    const wrapLines = (text, fontSize = FONT_SIZE) => {
        const words = String(text).split(/\s+/);
        const lines = [];
        let current = "";
        for (const w of words) {
            const next = current ? `${current} ${w}` : w;
            const width = font.widthOfTextAtSize(next, fontSize);
            if (width > MAX_LINE_WIDTH && current) {
                lines.push(current);
                current = w;
            }
            else {
                current = next;
            }
        }
        if (current)
            lines.push(current);
        return lines;
    };
    const drawBlock = (text, opts) => {
        const size = opts?.fontSize ?? FONT_SIZE;
        const lines = wrapLines(text, size);
        for (const line of lines) {
            drawLine(line, { fontSize: size });
        }
    };
    const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
    // --- Cover sheet ---
    drawLine("Medical Provider Intake Packet", { fontSize: TITLE_SIZE, bold: true });
    y -= SECTION_GAP;
    drawLine(today, { fontSize: FONT_SIZE });
    y -= SECTION_GAP * 2;
    drawLine("Provider", { fontSize: SECTION_SIZE, bold: true });
    y -= LINE_SPACE;
    drawLine(provider.name);
    if (provider.address)
        drawLine(provider.address);
    const cityState = [provider.city, provider.state].filter(Boolean).join(", ");
    if (cityState)
        drawLine(cityState);
    if (provider.phone)
        drawLine(`Phone: ${provider.phone}`);
    if (provider.email)
        drawLine(`Email: ${provider.email}`);
    if (provider.specialty)
        drawLine(`Specialty: ${provider.specialty}`);
    y -= SECTION_GAP;
    drawLine("Prepared by", { fontSize: SECTION_SIZE, bold: true });
    y -= LINE_SPACE;
    drawLine(firm?.name ?? "Law Firm");
    y -= SECTION_GAP * 2;
    // --- Client info ---
    drawLine("Client information", { fontSize: SECTION_SIZE, bold: true });
    y -= LINE_SPACE;
    drawLine(`Client: ${legalCase.clientName ?? "—"}`);
    y -= SECTION_GAP;
    // --- Case info ---
    drawLine("Case information", { fontSize: SECTION_SIZE, bold: true });
    y -= LINE_SPACE;
    drawLine(`Case number: ${legalCase.caseNumber ?? "—"}`);
    drawLine(`Title: ${legalCase.title ?? "—"}`);
    if (legalCase.createdAt) {
        drawLine(`Opened: ${new Date(legalCase.createdAt).toLocaleDateString("en-US")}`);
    }
    y -= SECTION_GAP;
    // --- Supporting documents summary ---
    if (docSummaries.length > 0) {
        drawLine("Supporting documents summary", { fontSize: SECTION_SIZE, bold: true });
        y -= LINE_SPACE;
        for (const d of docSummaries) {
            ensureSpace(FONT_SIZE * 3);
            drawLine(`${d.original_name}${d.doc_type ? ` (${d.doc_type})` : ""}`, { bold: true });
            if (d.summary?.summary)
                drawBlock(d.summary.summary, { fontSize: FONT_SIZE - 1 });
            if (d.summary?.keyFacts?.length) {
                for (const k of d.summary.keyFacts)
                    drawLine(`  • ${k}`, { fontSize: FONT_SIZE - 1 });
            }
            if (!d.summary?.summary && !d.summary?.keyFacts?.length)
                drawLine("No summary available.", { fontSize: FONT_SIZE - 1 });
            y -= LINE_SPACE;
        }
    }
    const pdfBytes = await doc.save();
    return Buffer.from(pdfBytes);
}
