/**
 * Merge multiple PDF documents into one. Used by POST /documents/merge.
 */
import crypto from "crypto";
import { PDFDocument } from "pdf-lib";
import { prisma } from "../db/prisma";
import { getObjectBuffer, putObject } from "./storage";
import { buildDocumentStorageKey } from "./documentStorageKeys";

export type MergeDocumentsInput = {
  firmId: string;
  documentIds: string[];
};

export type MergeDocumentsResult = {
  documentId: string;
  spacesKey: string;
  originalName: string;
  pageCount: number;
};

/**
 * Load documents (must be PDF, same firm), merge in order, upload merged PDF, create new Document with metaJson.mergedFromDocumentIds.
 */
export async function mergeDocuments(input: MergeDocumentsInput): Promise<MergeDocumentsResult> {
  const { firmId, documentIds } = input;
  if (!documentIds || documentIds.length < 2) {
    throw new Error("At least 2 document IDs are required to merge");
  }

  const docs = await prisma.document.findMany({
    where: { id: { in: documentIds }, firmId },
    select: { id: true, spacesKey: true, originalName: true, mimeType: true, routedCaseId: true },
    orderBy: { id: "asc" },
  });

  const idOrder = documentIds.filter((id) => docs.some((d) => d.id === id));
  const orderedDocs = idOrder
    .map((id) => docs.find((d) => d.id === id))
    .filter((d): d is NonNullable<typeof d> => d != null);

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

  const buffers: Buffer[] = [];
  for (const d of orderedDocs) {
    const buf = await getObjectBuffer(d.spacesKey);
    buffers.push(buf);
  }

  const mergedPdf = await PDFDocument.create();
  let totalPages = 0;
  for (let i = 0; i < buffers.length; i++) {
    const srcDoc = await PDFDocument.load(buffers[i], { ignoreEncryption: true });
    const pages = await mergedPdf.copyPages(srcDoc, srcDoc.getPageIndices());
    for (const page of pages) {
      mergedPdf.addPage(page);
      totalPages++;
    }
  }

  const mergedBuffer = Buffer.from(await mergedPdf.save());
  const documentId = crypto.randomUUID();

  const baseName = orderedDocs[0]?.originalName || "document";
  const ext = (baseName || "").split(".").pop()?.toLowerCase();
  const mergedName =
    (ext === "pdf" ? baseName.replace(/\.pdf$/i, "") : baseName) + `-merged-${orderedDocs.length}.pdf`;
  const sharedCaseId =
    orderedDocs.length > 0 && orderedDocs.every((doc) => doc.routedCaseId === orderedDocs[0]?.routedCaseId)
      ? orderedDocs[0]?.routedCaseId ?? null
      : null;
  const key = buildDocumentStorageKey({
    firmId,
    caseId: sharedCaseId,
    documentId,
    originalName: mergedName,
  });
  await putObject(key, mergedBuffer, pdfMime);

  const fileSha256 = crypto.createHash("sha256").update(mergedBuffer).digest("hex");
  const doc = await prisma.document.create({
    data: {
      id: documentId,
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
      metaJson: { mergedFromDocumentIds: documentIds } as object,
    },
  });

  return {
    documentId: doc.id,
    spacesKey: doc.spacesKey,
    originalName: doc.originalName,
    pageCount: doc.pageCount,
  };
}
