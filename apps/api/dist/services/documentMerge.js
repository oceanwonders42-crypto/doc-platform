"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.mergeDocuments = mergeDocuments;
/**
 * Merge multiple PDF documents into one. Used by POST /documents/merge.
 */
const crypto_1 = __importDefault(require("crypto"));
const pdf_lib_1 = require("pdf-lib");
const prisma_1 = require("../db/prisma");
const storage_1 = require("./storage");
/**
 * Load documents (must be PDF, same firm), merge in order, upload merged PDF, create new Document with metaJson.mergedFromDocumentIds.
 */
async function mergeDocuments(input) {
    const { firmId, documentIds } = input;
    if (!documentIds || documentIds.length < 2) {
        throw new Error("At least 2 document IDs are required to merge");
    }
    const docs = await prisma_1.prisma.document.findMany({
        where: { id: { in: documentIds }, firmId },
        select: { id: true, spacesKey: true, originalName: true, mimeType: true },
        orderBy: { id: "asc" },
    });
    const idOrder = documentIds.filter((id) => docs.some((d) => d.id === id));
    const orderedDocs = idOrder
        .map((id) => docs.find((d) => d.id === id))
        .filter((d) => d != null);
    if (orderedDocs.length !== documentIds.length) {
        const found = new Set(orderedDocs.map((d) => d.id));
        const missing = documentIds.filter((id) => !found.has(id));
        throw new Error(`Documents not found or not in your firm: ${missing.join(", ")}`);
    }
    const pdfMime = "application/pdf";
    for (const d of orderedDocs) {
        const isPdf = d.mimeType === pdfMime || (d.originalName || "").toLowerCase().endsWith(".pdf");
        if (!isPdf) {
            throw new Error(`Document ${d.id} is not a PDF; only PDFs can be merged`);
        }
    }
    const buffers = [];
    for (const d of orderedDocs) {
        const buf = await (0, storage_1.getObjectBuffer)(d.spacesKey);
        buffers.push(buf);
    }
    const mergedPdf = await pdf_lib_1.PDFDocument.create();
    let totalPages = 0;
    for (let i = 0; i < buffers.length; i++) {
        const srcDoc = await pdf_lib_1.PDFDocument.load(buffers[i], { ignoreEncryption: true });
        const pages = await mergedPdf.copyPages(srcDoc, srcDoc.getPageIndices());
        for (const page of pages) {
            mergedPdf.addPage(page);
            totalPages++;
        }
    }
    const mergedBuffer = Buffer.from(await mergedPdf.save());
    const key = `${firmId}/merged/${Date.now()}_${crypto_1.default.randomUUID().replace(/-/g, "")}.pdf`;
    await (0, storage_1.putObject)(key, mergedBuffer, pdfMime);
    const baseName = orderedDocs[0]?.originalName || "document";
    const ext = (baseName || "").split(".").pop()?.toLowerCase();
    const mergedName = (ext === "pdf" ? baseName.replace(/\.pdf$/i, "") : baseName) + `-merged-${orderedDocs.length}.pdf`;
    const fileSha256 = crypto_1.default.createHash("sha256").update(mergedBuffer).digest("hex");
    const doc = await prisma_1.prisma.document.create({
        data: {
            firmId,
            source: "merge",
            spacesKey: key,
            originalName: mergedName,
            mimeType: pdfMime,
            pageCount: totalPages,
            status: "UPLOADED",
            processingStage: "complete",
            file_sha256: fileSha256,
            fileSizeBytes: mergedBuffer.length,
            processedAt: new Date(),
            metaJson: { mergedFromDocumentIds: documentIds },
        },
    });
    return {
        documentId: doc.id,
        spacesKey: doc.spacesKey,
        originalName: doc.originalName,
        pageCount: doc.pageCount,
    };
}
