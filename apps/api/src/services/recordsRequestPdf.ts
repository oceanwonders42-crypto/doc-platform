/**
 * Records request letter PDF generation.
 * Builds a printable request letter (firm, case, provider, request type, date range, legal language, signature).
 * Stores the PDF using existing storage conventions with tenant-safe path.
 */
import crypto from "crypto";
import { prisma } from "../db/prisma";
import { putObject } from "./storage";
import { buildRecordsRequestLetterPdf } from "./recordsLetterPdf";
import { buildFirmWhere } from "../lib/tenant";
import { buildDocumentStorageKey } from "./documentStorageKeys";

export type GenerateRecordsRequestLetterInput = {
  recordsRequestId: string;
  firmId: string;
};

export type GenerateRecordsRequestLetterResult =
  | { ok: true; documentId: string; storageKey: string }
  | { ok: false; error: string };

export async function generateAndStoreRecordsRequestLetter(
  input: GenerateRecordsRequestLetterInput
): Promise<GenerateRecordsRequestLetterResult> {
  const { recordsRequestId, firmId } = input;

  const req = await prisma.recordsRequest.findFirst({
    where: buildFirmWhere(firmId, { id: recordsRequestId }),
  });
  if (!req) return { ok: false, error: "Records request not found" };

  const [firm, caseRow, provider] = await Promise.all([
    prisma.firm.findUnique({ where: { id: firmId }, select: { name: true } }),
    prisma.legalCase.findFirst({
      where: buildFirmWhere(firmId, { id: req.caseId }),
      select: { title: true, caseNumber: true, clientName: true },
    }),
    req.providerId
      ? prisma.provider.findFirst({
          where: buildFirmWhere(firmId, { id: req.providerId }),
          select: { address: true, city: true, state: true },
        })
      : Promise.resolve(null),
  ]);

  const fmtDate = (d: Date | null) => (d ? d.toLocaleDateString("en-US") : "");
  const providerAddress = provider
    ? [provider.address, [provider.city, provider.state].filter(Boolean).join(", ")].filter(Boolean).join("\n")
    : null;

  const letterBody = (req.messageBody ?? req.letterBody ?? "").trim() || "Please provide the requested records and/or billing information for the patient and date range indicated.";

  const pdfBuffer = await buildRecordsRequestLetterPdf({
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
  const fileSha256 = crypto.createHash("sha256").update(pdfBuffer).digest("hex");
  const documentId = crypto.randomUUID();
  const storageKey = buildDocumentStorageKey({
    firmId,
    caseId: req.caseId,
    documentId,
    originalName,
  });

  await putObject(storageKey, pdfBuffer, "application/pdf");

  const doc = await prisma.document.create({
    data: {
      id: documentId,
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

  await prisma.recordsRequest.update({
    where: { id: recordsRequestId },
    data: { generatedDocumentId: doc.id },
  });

  const letterKind = "LETTER";
  const existingLetter = await prisma.recordsRequestAttachment.findFirst({
    where: buildFirmWhere(firmId, { recordsRequestId, kind: letterKind }),
  });
  if (!existingLetter) {
    await prisma.recordsRequestAttachment.create({
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
