"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.generatePdfFirstPagePng = generatePdfFirstPagePng;
exports.generateAndStoreDocumentThumbnail = generateAndStoreDocumentThumbnail;
/**
 * Generate first-page PNG thumbnail from a PDF buffer.
 * Uses pdf-to-img (pdfjs-based). Returns null if conversion fails.
 */
const storage_1 = require("./storage");
const THUMBNAIL_SCALE = 1.5;
const THUMBNAIL_CONTENT_TYPE = "image/png";
async function generatePdfFirstPagePng(pdfBuffer) {
    try {
        const mod = await Promise.resolve().then(() => __importStar(require("pdf-to-img")));
        const pdfFn = (mod.default ?? mod.pdf);
        if (typeof pdfFn !== "function")
            return null;
        const doc = await pdfFn(pdfBuffer, { scale: THUMBNAIL_SCALE });
        const firstPage = await doc.getPage(1);
        if (!firstPage || !Buffer.isBuffer(firstPage))
            return null;
        return firstPage;
    }
    catch {
        return null;
    }
}
/**
 * Generate thumbnail for a document, upload to storage, return the storage key or null.
 */
async function generateAndStoreDocumentThumbnail(documentId, firmId, pdfBuffer) {
    const png = await generatePdfFirstPagePng(pdfBuffer);
    if (!png || png.length === 0)
        return null;
    const key = `${firmId}/thumbnails/${documentId}.png`;
    await (0, storage_1.putObject)(key, png, THUMBNAIL_CONTENT_TYPE);
    return key;
}
