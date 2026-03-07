"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.preprocessPageImage = preprocessPageImage;
exports.preprocessPdfPage = preprocessPdfPage;
/**
 * Stub: return buffer unchanged and record that no preprocessing was run.
 * When sharp or similar is available, run deskew/denoise/contrast per page.
 */
async function preprocessPageImage(buffer, _mimeType) {
    return {
        buffer,
        applied: [],
    };
}
/**
 * For PDFs with no embedded text, we would:
 * 1. Render each page to image
 * 2. Run preprocessPageImage on each
 * 3. Run image OCR (e.g. Tesseract) on result
 * Current pipeline uses embedded text only; image path is placeholder.
 */
async function preprocessPdfPage(_pdfBuffer, _pageNum) {
    return { buffer: Buffer.from([]), applied: [] };
}
