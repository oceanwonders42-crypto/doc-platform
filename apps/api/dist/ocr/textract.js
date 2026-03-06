"use strict";
/**
 * AWS Textract OCR integration.
 * When extracted text length is below threshold (or for images), this runs to get text.
 * Requires: AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY.
 * DetectDocumentText supports images and single-page PDFs (sync, up to 10 MB).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.OCR_TEXT_THRESHOLD = void 0;
exports.isOcrNeeded = isOcrNeeded;
exports.runTextract = runTextract;
const client_textract_1 = require("@aws-sdk/client-textract");
const storage_1 = require("../services/storage");
const OCR_TEXT_THRESHOLD = 200;
exports.OCR_TEXT_THRESHOLD = OCR_TEXT_THRESHOLD;
/** Max bytes for sync DetectDocumentText (AWS limit). */
const TEXTRACT_SYNC_BYTES_LIMIT = 10 * 1024 * 1024;
function isOcrNeeded(extractedTextLength) {
    return extractedTextLength < OCR_TEXT_THRESHOLD;
}
function averageConfidence(blocks) {
    const scores = blocks
        ?.filter((b) => b.Confidence != null)
        .map((b) => b.Confidence) ?? [];
    if (scores.length === 0)
        return 0;
    return scores.reduce((a, b) => a + b, 0) / scores.length;
}
/**
 * Run OCR on a document buffer (PDF or image) using AWS Textract DetectDocumentText.
 * For multi-page PDFs, only the first page is processed (sync API limit).
 */
async function runTextract(buffer, documentId, _mimeType) {
    const region = process.env.AWS_REGION || process.env.S3_REGION || "us-east-1";
    const hasAws = !!(process.env.AWS_ACCESS_KEY_ID || process.env.S3_ACCESS_KEY) &&
        !!(process.env.AWS_SECRET_ACCESS_KEY || process.env.S3_SECRET_KEY);
    if (!hasAws) {
        console.warn("[ocr] AWS Textract: no AWS credentials, skipping OCR");
        return { text: "", confidence: 0, rawJsonKey: null, provider: "aws_textract" };
    }
    if (buffer.length > TEXTRACT_SYNC_BYTES_LIMIT) {
        console.warn(`[ocr] AWS Textract: document too large (${buffer.length} bytes > ${TEXTRACT_SYNC_BYTES_LIMIT}), skipping sync OCR`);
        return { text: "", confidence: 0, rawJsonKey: null, provider: "aws_textract" };
    }
    const textract = new client_textract_1.TextractClient({ region });
    try {
        const command = new client_textract_1.DetectDocumentTextCommand({
            Document: { Bytes: new Uint8Array(buffer) },
        });
        const result = await textract.send(command);
        const textLines = result.Blocks?.filter((b) => b.BlockType === "LINE")
            .map((b) => b.Text)
            .filter(Boolean) ?? [];
        const text = textLines.join("\n");
        const confidence = averageConfidence(result.Blocks);
        let rawJsonKey = null;
        const rawJsonKeyPath = `ocr/${documentId}.json`;
        try {
            await (0, storage_1.putObject)(rawJsonKeyPath, Buffer.from(JSON.stringify({
                Blocks: result.Blocks,
                DocumentMetadata: result.DocumentMetadata,
            }), "utf8"), "application/json");
            rawJsonKey = rawJsonKeyPath;
        }
        catch (e) {
            console.error("[ocr] Failed to store OCR JSON:", e);
        }
        console.log(`[ocr] OCR via AWS Textract: ${documentId} (${textLines.length} lines, confidence ${(confidence * 100).toFixed(0)}%)`);
        return {
            text,
            confidence: confidence / 100,
            rawJsonKey,
            provider: "aws_textract",
        };
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[ocr] AWS Textract error:", msg);
        return { text: "", confidence: 0, rawJsonKey: null, provider: "aws_textract" };
    }
}
