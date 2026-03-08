/**
 * Records request delivery service.
 * Initial version: EMAIL only. Sends request to provider with optional attachments
 * (HIPAA authorization, request letter PDF, supporting docs). Creates FAILED event on send failure.
 */
import { prisma } from "../db/prisma";
import { getObjectBuffer } from "./storage";
import { sendAdapter } from "../send/compositeAdapter";
import { buildFirmWhere } from "../lib/tenant";
import type { SendAttachment } from "../send/types";

export type DeliverRecordsRequestInput = {
  recordsRequestId: string;
  firmId: string;
  /** Optional: pre-generated letter PDF buffer; if not provided, caller should ensure letter is generated or we skip letter attachment */
  letterPdfBuffer?: Buffer | null;
  letterFilename?: string;
};

export type DeliverRecordsRequestResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

export async function deliverRecordsRequestEmail(
  input: DeliverRecordsRequestInput
): Promise<DeliverRecordsRequestResult> {
  const { recordsRequestId, firmId, letterPdfBuffer, letterFilename } = input;

  const req = await prisma.recordsRequest.findFirst({
    where: buildFirmWhere(firmId, { id: recordsRequestId }),
    include: { attachments: true },
  });
  if (!req) return { ok: false, error: "Records request not found" };

  const destinationType = req.destinationType ?? "EMAIL";
  if (destinationType !== "EMAIL") {
    return { ok: false, error: "Only EMAIL delivery is supported in this version" };
  }
  const to = (req.destinationValue ?? "").trim();
  if (!to) return { ok: false, error: "Destination email is required" };

  const subject = (req.subject ?? "Medical Records Request").trim();
  const body = (req.messageBody ?? req.letterBody ?? "").trim();
  if (!body) return { ok: false, error: "Message body is required" };

  const attachments: SendAttachment[] = [];

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
    const doc = await prisma.document.findFirst({
      where: buildFirmWhere(firmId, { id: att.documentId }),
      select: { spacesKey: true, originalName: true, mimeType: true },
    });
    if (doc) {
      try {
        const buf = await getObjectBuffer(doc.spacesKey);
        const name = (doc.originalName ?? "attachment").replace(/[^a-zA-Z0-9._-]/g, "_");
        attachments.push({
          filename: name,
          content: buf,
          contentType: doc.mimeType ?? "application/octet-stream",
        });
      } catch {
        // skip failed attachment
      }
    }
  }

  const result = await sendAdapter.sendEmail(to, subject, body, attachments.length ? attachments : undefined);

  if (!result.ok) {
    await prisma.recordsRequestEvent.create({
      data: {
        firmId,
        recordsRequestId,
        eventType: "FAILED",
        status: req.status,
        message: result.error ?? "Send failed",
        metaJson: { channel: "email", destination: to },
      },
    });
    await prisma.recordsRequest.update({
      where: { id: recordsRequestId },
      data: { status: "FAILED" },
    });
    return { ok: false, error: result.error ?? "Send failed" };
  }

  return { ok: true, message: `Sent to ${to}` };
}
