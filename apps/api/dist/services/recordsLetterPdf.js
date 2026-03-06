"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildRecordsRequestLetterPdf = buildRecordsRequestLetterPdf;
/**
 * Builds a fax/email-ready PDF letter from records request content.
 */
const pdf_lib_1 = require("pdf-lib");
const MARGIN = 72;
const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const LINE_HEIGHT = 14;
const FONT_SIZE = 11;
const MAX_LINE_WIDTH = PAGE_WIDTH - 2 * MARGIN;
/**
 * Renders letter body (and optional provider block) into a single-page PDF.
 * Returns buffer suitable for download or fax.
 */
async function buildRecordsRequestLetterPdf(input) {
    const doc = await pdf_lib_1.PDFDocument.create();
    const font = await doc.embedFont(pdf_lib_1.StandardFonts.Helvetica);
    const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    let y = PAGE_HEIGHT - MARGIN;
    const drawLine = (text, opts) => {
        const size = opts?.fontSize ?? FONT_SIZE;
        if (y < MARGIN + LINE_HEIGHT)
            return; // would overflow page
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
    // Use letter body: preserve line breaks, wrap long lines
    const bodyLines = input.letterBody.split(/\n/);
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
    const pdfBytes = await doc.save();
    return Buffer.from(pdfBytes);
}
