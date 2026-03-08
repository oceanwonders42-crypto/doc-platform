"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendRecordsRequest = sendRecordsRequest;
/**
 * Send a records request via email or fax.
 * Used by POST /records-requests/:id/send and by the records_request.send job handler.
 */
const crypto_1 = __importDefault(require("crypto"));
const prisma_1 = require("../db/prisma");
const storage_1 = require("./storage");
const storage_2 = require("./storage");
const recordsLetterPdf_1 = require("./recordsLetterPdf");
const compositeAdapter_1 = require("../send/compositeAdapter");
const notifications_1 = require("./notifications");
async function sendRecordsRequest(input) {
    const { recordsRequestId, firmId, channel, destination } = input;
    const reqRow = await prisma_1.prisma.recordsRequest.findFirst({
        where: { id: recordsRequestId, firmId },
    });
    if (!reqRow)
        return { ok: false, error: "RecordsRequest not found" };
    const letterBody = reqRow.letterBody ?? "";
    if (!letterBody.trim())
        return { ok: false, error: "Letter body is empty; save the letter first" };
    let currentReqRow = reqRow;
    if (!currentReqRow.generatedDocumentId) {
        const [firm, caseRow, provider] = await Promise.all([
            prisma_1.prisma.firm.findUnique({ where: { id: firmId }, select: { name: true } }),
            prisma_1.prisma.legalCase.findUnique({
                where: { id: currentReqRow.caseId },
                select: { title: true, caseNumber: true, clientName: true },
            }),
            currentReqRow.providerId
                ? prisma_1.prisma.provider.findFirst({
                    where: { id: currentReqRow.providerId, firmId },
                    select: { name: true, address: true, city: true, state: true, phone: true, fax: true, email: true },
                })
                : Promise.resolve(null),
        ]);
        const fmtDate = (d) => (d ? d.toLocaleDateString("en-US") : "");
        const providerAddress = provider
            ? [provider.address, [provider.city, provider.state].filter(Boolean).join(", ")].filter(Boolean).join("\n")
            : null;
        const pdfBufferNew = await (0, recordsLetterPdf_1.buildRecordsRequestLetterPdf)({
            letterBody,
            providerName: currentReqRow.providerName,
            providerContact: currentReqRow.providerContact,
            firmName: firm?.name ?? null,
            providerAddress: providerAddress || null,
            caseTitle: caseRow?.title ?? null,
            caseNumber: caseRow?.caseNumber ?? null,
            clientName: caseRow?.clientName ?? null,
            dateFrom: fmtDate(currentReqRow.dateFrom),
            dateTo: fmtDate(currentReqRow.dateTo),
            notes: currentReqRow.notes ?? null,
        });
        const safeName = currentReqRow.providerName.replace(/[^a-zA-Z0-9\-_\s]/g, "").replace(/\s+/g, " ").trim().slice(0, 60) || "Records Request";
        const originalName = `Records Request - ${safeName}.pdf`;
        const fileSha256 = crypto_1.default.createHash("sha256").update(pdfBufferNew).digest("hex");
        const key = `${firmId}/records_request/${Date.now()}_${crypto_1.default.randomBytes(6).toString("hex")}.pdf`;
        await (0, storage_2.putObject)(key, pdfBufferNew, "application/pdf");
        const docNew = await prisma_1.prisma.document.create({
            data: {
                firmId,
                source: "records_request",
                spacesKey: key,
                originalName,
                mimeType: "application/pdf",
                pageCount: 0,
                status: "UPLOADED",
                processingStage: "complete",
                file_sha256: fileSha256,
                fileSizeBytes: pdfBufferNew.length,
                ingestedAt: new Date(),
                processedAt: new Date(),
                routedCaseId: currentReqRow.caseId,
            },
        });
        await prisma_1.prisma.recordsRequest.update({
            where: { id: recordsRequestId },
            data: { generatedDocumentId: docNew.id },
        });
        currentReqRow = (await prisma_1.prisma.recordsRequest.findFirst({ where: { id: recordsRequestId, firmId } }));
    }
    const doc = await prisma_1.prisma.document.findFirst({
        where: { id: currentReqRow.generatedDocumentId, firmId },
        select: { spacesKey: true },
    });
    if (!doc)
        return { ok: false, error: "Generated PDF document not found" };
    const pdfBuffer = await (0, storage_1.getObjectBuffer)(doc.spacesKey);
    let result;
    if (channel === "email") {
        const safeName = currentReqRow.providerName.replace(/[^a-zA-Z0-9\-_\s]/g, "").replace(/\s+/g, " ").trim().slice(0, 60) || "Records Request";
        const subject = `Medical Records Request - ${currentReqRow.providerName}`;
        result = await compositeAdapter_1.sendAdapter.sendEmail(destination, subject, letterBody, [
            { filename: `records-request-${safeName}.pdf`, content: pdfBuffer, contentType: "application/pdf" },
        ]);
    }
    else {
        result = await compositeAdapter_1.sendAdapter.sendFax(destination, pdfBuffer);
    }
    await prisma_1.prisma.recordsRequestAttempt.create({
        data: {
            firmId,
            recordsRequestId,
            channel,
            destination,
            ok: result.ok,
            error: result.error ?? null,
            externalId: result.externalId ?? null,
        },
    });
    if (!result.ok) {
        (0, notifications_1.createNotification)(firmId, "records_request_send_failed", "Records request send failed", `Failed to send records request for ${currentReqRow.providerName} via ${channel} to ${destination}: ${result.error || "Unknown error"}`, { caseId: currentReqRow.caseId, recordsRequestId, channel, destination, error: result.error }).catch(() => { });
        return { ok: false, error: result.error || "Send failed" };
    }
    await prisma_1.prisma.recordsRequest.update({
        where: { id: recordsRequestId },
        data: { status: "Sent" },
    });
    (0, notifications_1.createNotification)(firmId, "records_request_sent", "Records request sent", `Records request for ${currentReqRow.providerName} was sent via ${channel} to ${destination}.`, { caseId: currentReqRow.caseId, recordsRequestId, channel, destination }).catch(() => { });
    return { ok: true, message: `Sent via ${channel} to ${destination}` };
}
