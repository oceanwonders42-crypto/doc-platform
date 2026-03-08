"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.countPagesFromBuffer = countPagesFromBuffer;
const pdf_lib_1 = require("pdf-lib");
async function countPagesFromBuffer(buf, mimeType, originalName) {
    const isPdf = mimeType === "application/pdf" ||
        originalName.toLowerCase().endsWith(".pdf");
    if (!isPdf)
        return 1;
    const pdf = await pdf_lib_1.PDFDocument.load(buf, { ignoreEncryption: true });
    return pdf.getPageCount();
}
