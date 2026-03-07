"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildRecordsRequestLetterPdf = buildRecordsRequestLetterPdf;
/**
 * Builds a fax/email-ready PDF letter from records request content.
 * Includes firm name, provider name/address, case/client info, date range, notes, and signature line.
 */
const pdf_lib_1 = require("pdf-lib");
const MARGIN = 72;
const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const LINE_HEIGHT = 14;
const FONT_SIZE = 11;
const FONT_SIZE_HEADER = 12;
const MAX_LINE_WIDTH = PAGE_WIDTH - 2 * MARGIN;
/**
 * Renders a full records request letter PDF with letterhead, provider/case info, body, and signature line.
 * Returns buffer suitable for upload or download.
 */
async function buildRecordsRequestLetterPdf(input) {
    const doc = await pdf_lib_1.PDFDocument.create();
    const font = await doc.embedFont(pdf_lib_1.StandardFonts.Helvetica);
    const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    let y = PAGE_HEIGHT - MARGIN;
    const drawLine = (text, opts) => {
        const size = opts?.fontSize ?? FONT_SIZE;
        if (y < MARGIN + size)
            return;
        page.drawText(text, { x: MARGIN, y, size, font });
        y -= size + 4;
    };
    const wrapLines = (text, maxWidth = MAX_LINE_WIDTH) => {
        const words = text.split(/\s+/);
        const lines = [];
        let current = "";
        for (const w of words) {
            const next = current ? `${current} ${w}` : w;
            const width = font.widthOfTextAtSize(next, FONT_SIZE);
            if (width > maxWidth && current) {
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
    const spacer = (n = 1) => {
        y -= LINE_HEIGHT * n;
    };
    // --- Firm name (letterhead) ---
    if (input.firmName && input.firmName.trim()) {
        drawLine(input.firmName.trim(), { fontSize: FONT_SIZE_HEADER });
        spacer(2);
    }
    // --- Provider name / address / contact ---
    drawLine("To:", { fontSize: FONT_SIZE });
    drawLine(input.providerName);
    if (input.providerAddress && input.providerAddress.trim()) {
        const addrLines = input.providerAddress.trim().split(/\n/);
        for (const line of addrLines) {
            if (line.trim())
                drawLine(line.trim());
        }
    }
    if (input.providerContact && input.providerContact.trim()) {
        drawLine(input.providerContact.trim());
    }
    spacer(2);
    // --- Case / client info ---
    const caseParts = [];
    if (input.caseNumber && input.caseNumber.trim())
        caseParts.push(`Case: ${input.caseNumber.trim()}`);
    if (input.clientName && input.clientName.trim())
        caseParts.push(`Client: ${input.clientName.trim()}`);
    if (input.caseTitle && input.caseTitle.trim())
        caseParts.push(input.caseTitle.trim());
    if (caseParts.length > 0) {
        drawLine(caseParts.join("  |  "));
        spacer(1);
    }
    // --- Date range ---
    if (input.dateFrom || input.dateTo) {
        const from = input.dateFrom && input.dateFrom.trim() ? input.dateFrom.trim() : "";
        const to = input.dateTo && input.dateTo.trim() ? input.dateTo.trim() : "";
        const range = from && to ? `Date range: ${from} – ${to}` : from ? `From: ${from}` : to ? `To: ${to}` : "";
        if (range) {
            drawLine(range);
            spacer(2);
        }
    }
    // --- Notes (if present) ---
    if (input.notes && input.notes.trim()) {
        drawLine("Notes:");
        const noteLines = input.notes.trim().split(/\n/);
        for (const line of noteLines) {
            const trimmed = line.trim();
            if (!trimmed) {
                spacer(0.5);
                continue;
            }
            const wrapped = wrapLines(trimmed);
            for (const w of wrapped)
                drawLine(w);
        }
        spacer(2);
    }
    // --- Letter body ---
    const bodyLines = (input.letterBody || "").split(/\n/);
    for (const line of bodyLines) {
        const trimmed = line.trim();
        if (!trimmed) {
            y -= LINE_HEIGHT * 0.5;
            continue;
        }
        const wrapped = wrapLines(trimmed);
        for (const w of wrapped) {
            drawLine(w);
        }
    }
    // --- Signature line placeholder ---
    spacer(3);
    if (y > MARGIN + LINE_HEIGHT * 4) {
        const sigY = y - LINE_HEIGHT;
        page.drawLine({
            start: { x: MARGIN, y: sigY },
            end: { x: MARGIN + 200, y: sigY },
            thickness: 0.5,
        });
        drawLine("Signature");
        y -= LINE_HEIGHT;
    }
    const pdfBytes = await doc.save();
    return Buffer.from(pdfBytes);
}
