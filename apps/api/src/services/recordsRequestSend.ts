/**
 * Send a records request via email or fax.
 * Used by POST /records-requests/:id/send and by the records_request.send job handler.
 */
import crypto from "crypto";
import { prisma } from "../db/prisma";
import { getObjectBuffer } from "./storage";
import { putObject } from "./storage";
import { buildRecordsRequestLetterPdf } from "./recordsLetterPdf";
import { buildDocumentStorageKey } from "./documentStorageKeys";
import { sendAdapter } from "../send/compositeAdapter";
import { createNotification } from "./notifications";
import {
  isSendableRecordsRequestStatus,
  normalizeRecordsRequestStatus,
} from "./recordsRequestStatus";

export type SendRecordsRequestInput = {
  recordsRequestId: string;
  firmId: string;
  channel: "email" | "fax";
  destination: string;
};

export type SendRecordsRequestResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

export async function sendRecordsRequest(
  input: SendRecordsRequestInput
): Promise<SendRecordsRequestResult> {
  const { recordsRequestId, firmId, channel, destination } = input;

  const reqRow = await prisma.recordsRequest.findFirst({
    where: { id: recordsRequestId, firmId },
  });
  if (!reqRow) return { ok: false, error: "RecordsRequest not found" };
  if (!isSendableRecordsRequestStatus(reqRow.status)) {
    return {
      ok: false,
      error: `Request must be in DRAFT, FAILED, or FOLLOW_UP_DUE status to send (current: ${normalizeRecordsRequestStatus(reqRow.status)})`,
    };
  }

  const letterBody = reqRow.letterBody ?? "";
  if (!letterBody.trim()) return { ok: false, error: "Letter body is empty; save the letter first" };

  let currentReqRow = reqRow;

  if (!currentReqRow.generatedDocumentId) {
    const [firm, caseRow, provider] = await Promise.all([
      prisma.firm.findUnique({ where: { id: firmId }, select: { name: true } }),
      prisma.legalCase.findFirst({
        where: { id: currentReqRow.caseId, firmId },
        select: { title: true, caseNumber: true, clientName: true },
      }),
      currentReqRow.providerId
        ? prisma.provider.findFirst({
            where: { id: currentReqRow.providerId, firmId },
            select: { name: true, address: true, city: true, state: true, phone: true, fax: true, email: true },
          })
        : Promise.resolve(null),
    ]);
    const fmtDate = (d: Date | null) => (d ? d.toLocaleDateString("en-US") : "");
    const providerAddress = provider
      ? [provider.address, [provider.city, provider.state].filter(Boolean).join(", ")].filter(Boolean).join("\n")
      : null;
    const pdfBufferNew = await buildRecordsRequestLetterPdf({
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
    const fileSha256 = crypto.createHash("sha256").update(pdfBufferNew).digest("hex");
    const documentId = crypto.randomUUID();
    const key = buildDocumentStorageKey({
      firmId,
      caseId: currentReqRow.caseId,
      documentId,
      originalName,
    });
    await putObject(key, pdfBufferNew, "application/pdf");
    const docNew = await prisma.document.create({
      data: {
        id: documentId,
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
    await prisma.recordsRequest.update({
      where: { id: recordsRequestId },
      data: { generatedDocumentId: docNew.id },
    });
    currentReqRow = (await prisma.recordsRequest.findFirst({ where: { id: recordsRequestId, firmId } }))!;
  }

  const doc = await prisma.document.findFirst({
    where: { id: currentReqRow!.generatedDocumentId!, firmId },
    select: { spacesKey: true },
  });
  if (!doc) return { ok: false, error: "Generated PDF document not found" };
  const pdfBuffer = await getObjectBuffer(doc.spacesKey);

  let result: { ok: boolean; error?: string; externalId?: string };
  if (channel === "email") {
    const safeName = currentReqRow!.providerName.replace(/[^a-zA-Z0-9\-_\s]/g, "").replace(/\s+/g, " ").trim().slice(0, 60) || "Records Request";
    const subject = `Medical Records Request - ${currentReqRow!.providerName}`;
    result = await sendAdapter.sendEmail(destination, subject, letterBody, [
      { filename: `records-request-${safeName}.pdf`, content: pdfBuffer, contentType: "application/pdf" },
    ]);
  } else {
    result = await sendAdapter.sendFax(destination, pdfBuffer);
  }

  await prisma.recordsRequestAttempt.create({
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
    await prisma.recordsRequest.update({
      where: { id: recordsRequestId },
      data: { status: "FAILED" },
    });
    await prisma.recordsRequestEvent.create({
      data: {
        firmId,
        recordsRequestId,
        eventType: "FAILED",
        status: "FAILED",
        message: result.error || "Send failed",
        metaJson: { channel, destination },
      },
    });
    createNotification(
      firmId,
      "records_request_send_failed",
      "Records request send failed",
      `Failed to send records request for ${currentReqRow!.providerName} via ${channel} to ${destination}: ${result.error || "Unknown error"}`,
      { caseId: currentReqRow!.caseId, recordsRequestId, channel, destination, error: result.error }
    ).catch(() => {});
    return { ok: false, error: result.error || "Send failed" };
  }

  const sentAt = new Date();
  await prisma.recordsRequest.update({
    where: { id: recordsRequestId },
    data: {
      status: "SENT",
      sentAt,
      requestDate: currentReqRow.requestDate ?? sentAt,
      destinationType: channel === "fax" ? "FAX" : "EMAIL",
      destinationValue: destination,
    },
  });
  await prisma.recordsRequestEvent.create({
    data: {
      firmId,
      recordsRequestId,
      eventType: "SENT",
      status: "SENT",
      message: `Sent via ${channel} to ${destination}`,
      metaJson: { channel, destination, sentAt: sentAt.toISOString() },
    },
  });

  createNotification(
    firmId,
    "records_request_sent",
    "Records request sent",
    `Records request for ${currentReqRow!.providerName} was sent via ${channel} to ${destination}.`,
    { caseId: currentReqRow!.caseId, recordsRequestId, channel, destination }
  ).catch(() => {});

  return { ok: true, message: `Sent via ${channel} to ${destination}` };
}
