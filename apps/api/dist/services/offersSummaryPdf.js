"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildOffersSummaryPdf = buildOffersSummaryPdf;
/**
 * Builds a PDF summary of settlement offers for a case.
 */
const pdf_lib_1 = require("pdf-lib");
const MARGIN = 72;
const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const LINE_HEIGHT = 16;
const FONT_SIZE = 12;
const TITLE_SIZE = 18;
async function buildOffersSummaryPdf(input) {
    const doc = await pdf_lib_1.PDFDocument.create();
    const font = await doc.embedFont(pdf_lib_1.StandardFonts.Helvetica);
    const boldFont = await doc.embedFont(pdf_lib_1.StandardFonts.HelveticaBold);
    const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    let y = PAGE_HEIGHT - MARGIN;
    const drawText = (text, opts) => {
        const f = opts?.font ?? font;
        const size = opts?.fontSize ?? FONT_SIZE;
        if (y < MARGIN + LINE_HEIGHT)
            return;
        page.drawText(text, { x: MARGIN, y, size, font: f });
        y -= size + 4;
    };
    drawText("Settlement Offers Summary", { font: boldFont, fontSize: TITLE_SIZE });
    y -= 8;
    if (input.clientName || input.caseNumber) {
        if (input.clientName)
            drawText(`Client: ${input.clientName}`);
        if (input.caseNumber)
            drawText(`Case: ${input.caseNumber}`);
        y -= 8;
    }
    drawText(`Generated: ${new Date().toLocaleDateString()}`, { fontSize: 10 });
    y -= 16;
    if (input.offers.length === 0) {
        drawText("No settlement offers recorded for this case.");
    }
    else {
        const fmtUsd = (n) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
        for (const o of input.offers) {
            const dateStr = new Date(o.date).toLocaleDateString();
            drawText(`${dateStr} — ${fmtUsd(o.amount)}`, { font: boldFont });
            drawText(`  Document: ${o.originalName || o.documentId}`);
            y -= 4;
        }
    }
    const pdfBytes = await doc.save();
    return Buffer.from(pdfBytes);
}
