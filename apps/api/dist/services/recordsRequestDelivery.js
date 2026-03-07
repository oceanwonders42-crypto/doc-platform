"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deliverRecordsRequestEmail = deliverRecordsRequestEmail;
/**
 * Records request delivery service.
 * Initial version: EMAIL only. Sends request to provider with optional attachments
 * (HIPAA authorization, request letter PDF, supporting docs). Creates FAILED event on send failure.
 */
const prisma_1 = require("../db/prisma");
const storage_1 = require("./storage");
const compositeAdapter_1 = require("../send/compositeAdapter");
const tenant_1 = require("../lib/tenant");
async function deliverRecordsRequestEmail(input) {
    const { recordsRequestId, firmId, letterPdfBuffer, letterFilename } = input;
    const req = await prisma_1.prisma.recordsRequest.findFirst({
        where: (0, tenant_1.buildFirmWhere)(firmId, { id: recordsRequestId }),
        include: { attachments: true },
    });
    if (!req)
        return { ok: false, error: "Records request not found" };
    const destinationType = req.destinationType ?? "EMAIL";
    if (destinationType !== "EMAIL") {
        return { ok: false, error: "Only EMAIL delivery is supported in this version" };
    }
    const to = (req.destinationValue ?? "").trim();
    if (!to)
        return { ok: false, error: "Destination email is required" };
    const subject = (req.subject ?? "Medical Records Request").trim();
    const body = (req.messageBody ?? req.letterBody ?? "").trim();
    if (!body)
        return { ok: false, error: "Message body is required" };
    const attachments = [];
    if (letterPdfBuffer && letterPdfBuffer.length > 0) {
        attachments.push({
            filename: letterFilename ?? "records-request-letter.pdf",
            content: letterPdfBuffer,
            contentType: "application/pdf",
        });
    }
    const authDocs = req.attachments.filter((a) => a.kind === "AUTHORIZATION");
    const supportingDocs = req.attachments.filter((a) => a.kind === "SUPPORTING_DOC");
    const letterDocAttachments = req.attachments.filter((a) => a.kind === "LETTER");
    for (const att of [...authDocs, ...supportingDocs, ...letterDocAttachments]) {
        const doc = await prisma_1.prisma.document.findFirst({
            where: (0, tenant_1.buildFirmWhere)(firmId, { id: att.documentId }),
            select: { spacesKey: true, originalName: true, mimeType: true },
        });
        if (doc) {
            try {
                const buf = await (0, storage_1.getObjectBuffer)(doc.spacesKey);
                const name = (doc.originalName ?? "attachment").replace(/[^a-zA-Z0-9._-]/g, "_");
                attachments.push({
                    filename: name,
                    content: buf,
                    contentType: doc.mimeType ?? "application/octet-stream",
                });
            }
            catch {
                // skip failed attachment
            }
        }
    }
    const result = await compositeAdapter_1.sendAdapter.sendEmail(to, subject, body, attachments.length ? attachments : undefined);
    if (!result.ok) {
        await prisma_1.prisma.recordsRequestEvent.create({
            data: {
                firmId,
                recordsRequestId,
                eventType: "FAILED",
                status: req.status,
                message: result.error ?? "Send failed",
                metaJson: { channel: "email", destination: to },
            },
        });
        await prisma_1.prisma.recordsRequest.update({
            where: { id: recordsRequestId },
            data: { status: "FAILED" },
        });
        return { ok: false, error: result.error ?? "Send failed" };
    }
    return { ok: true, message: `Sent to ${to}` };
}
