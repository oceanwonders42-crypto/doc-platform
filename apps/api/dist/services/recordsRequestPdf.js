"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateAndStoreRecordsRequestLetter = generateAndStoreRecordsRequestLetter;
/**
 * Records request letter PDF generation.
 * Builds a printable request letter (firm, case, provider, request type, date range, legal language, signature).
 * Stores the PDF using existing storage conventions with tenant-safe path.
 */
const crypto_1 = __importDefault(require("crypto"));
const prisma_1 = require("../db/prisma");
const storage_1 = require("./storage");
const recordsLetterPdf_1 = require("./recordsLetterPdf");
const tenant_1 = require("../lib/tenant");
async function generateAndStoreRecordsRequestLetter(input) {
    const { recordsRequestId, firmId } = input;
    const req = await prisma_1.prisma.recordsRequest.findFirst({
        where: (0, tenant_1.buildFirmWhere)(firmId, { id: recordsRequestId }),
    });
    if (!req)
        return { ok: false, error: "Records request not found" };
    const [firm, caseRow, provider] = await Promise.all([
        prisma_1.prisma.firm.findUnique({ where: { id: firmId }, select: { name: true } }),
        prisma_1.prisma.legalCase.findFirst({
            where: (0, tenant_1.buildFirmWhere)(firmId, { id: req.caseId }),
            select: { title: true, caseNumber: true, clientName: true },
        }),
        req.providerId
            ? prisma_1.prisma.provider.findFirst({
                where: (0, tenant_1.buildFirmWhere)(firmId, { id: req.providerId }),
                select: { address: true, city: true, state: true },
            })
            : Promise.resolve(null),
    ]);
    const fmtDate = (d) => (d ? d.toLocaleDateString("en-US") : "");
    const providerAddress = provider
        ? [provider.address, [provider.city, provider.state].filter(Boolean).join(", ")].filter(Boolean).join("\n")
        : null;
    const letterBody = (req.messageBody ?? req.letterBody ?? "").trim() || "Please provide the requested records and/or billing information for the patient and date range indicated.";
    const pdfBuffer = await (0, recordsLetterPdf_1.buildRecordsRequestLetterPdf)({
        letterBody,
        providerName: req.providerName,
        providerContact: req.providerContact,
        firmName: firm?.name ?? null,
        providerAddress: providerAddress || null,
        caseTitle: caseRow?.title ?? null,
        caseNumber: caseRow?.caseNumber ?? null,
        clientName: caseRow?.clientName ?? req.patientName ?? null,
        dateFrom: fmtDate(req.requestedDateFrom ?? req.dateFrom),
        dateTo: fmtDate(req.requestedDateTo ?? req.dateTo),
        notes: req.notes ?? null,
    });
    const safeName = req.providerName.replace(/[^a-zA-Z0-9\-_\s]/g, "").replace(/\s+/g, " ").trim().slice(0, 60) || "Records Request";
    const originalName = `Records Request - ${safeName}.pdf`;
    const fileSha256 = crypto_1.default.createHash("sha256").update(pdfBuffer).digest("hex");
    const storageKey = `${firmId}/records_request/${Date.now()}_${crypto_1.default.randomBytes(6).toString("hex")}.pdf`;
    await (0, storage_1.putObject)(storageKey, pdfBuffer, "application/pdf");
    const doc = await prisma_1.prisma.document.create({
        data: {
            firmId,
            source: "records_request",
            spacesKey: storageKey,
            originalName,
            mimeType: "application/pdf",
            pageCount: 0,
            status: "UPLOADED",
            processingStage: "complete",
            file_sha256: fileSha256,
            fileSizeBytes: pdfBuffer.length,
            ingestedAt: new Date(),
            processedAt: new Date(),
            routedCaseId: req.caseId,
        },
    });
    await prisma_1.prisma.recordsRequest.update({
        where: { id: recordsRequestId },
        data: { generatedDocumentId: doc.id },
    });
    const letterKind = "LETTER";
    const existingLetter = await prisma_1.prisma.recordsRequestAttachment.findFirst({
        where: (0, tenant_1.buildFirmWhere)(firmId, { recordsRequestId, kind: letterKind }),
    });
    if (!existingLetter) {
        await prisma_1.prisma.recordsRequestAttachment.create({
            data: {
                firmId,
                recordsRequestId,
                documentId: doc.id,
                kind: letterKind,
            },
        });
    }
    return { ok: true, documentId: doc.id, storageKey };
}
