"use strict";
/**
 * OCR scaffold for AWS Textract.
 * When extracted text length is below threshold, this runs to get text from scanned PDFs.
 * Requires: AWS credentials (or S3_ENDPOINT for MinIO), document stored in S3.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.OCR_TEXT_THRESHOLD = void 0;
exports.isOcrNeeded = isOcrNeeded;
exports.runTextract = runTextract;
const storage_1 = require("../services/storage");
const OCR_TEXT_THRESHOLD = 200;
exports.OCR_TEXT_THRESHOLD = OCR_TEXT_THRESHOLD;
function isOcrNeeded(extractedTextLength) {
    return extractedTextLength < OCR_TEXT_THRESHOLD;
}
/**
 * Run OCR on a document buffer (e.g. PDF or image).
 * Scaffold: real implementation would call AWS Textract DetectDocumentText or StartDocumentAnalysis.
 * Env: AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY for Textract; or use same S3 config for storing results.
 */
async function runTextract(buffer, documentId, mimeType) {
    const region = process.env.AWS_REGION || process.env.S3_REGION || "us-east-1";
    const hasAws = !!(process.env.AWS_ACCESS_KEY_ID || process.env.S3_ACCESS_KEY);
    if (!hasAws) {
        console.warn("[ocr] Textract scaffold: no AWS/S3 credentials, skipping OCR");
        return { text: "", confidence: 0, rawJsonKey: null, provider: "textract" };
    }
    // TODO: Call @aws-sdk/client-textract DetectDocumentText or StartDocumentAnalysis.
    // For PDFs, Textract accepts raw bytes or S3 reference. Then merge Block.Text to full text.
    // Store raw response JSON in S3: firmId/ocr/documentId.json
    const stubResponse = {
        Blocks: [],
        DocumentMetadata: {},
    };
    const text = ""; // TODO: merge Block.Text from response
    const confidence = 0;
    const rawJsonKey = `ocr/${documentId}.json`;
    try {
        await (0, storage_1.putObject)(rawJsonKey, Buffer.from(JSON.stringify(stubResponse), "utf8"), "application/json");
    }
    catch (e) {
        console.error("[ocr] Failed to store OCR JSON:", e);
    }
    return {
        text,
        confidence,
        rawJsonKey,
        provider: "textract",
    };
}
