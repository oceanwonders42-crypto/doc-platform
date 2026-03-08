/**
 * Generate first-page PNG thumbnail from a PDF buffer.
 * Uses pdf-to-img (pdfjs-based). Returns null if conversion fails.
 */
import { putObject } from "./storage";

const THUMBNAIL_SCALE = 1.5;
const THUMBNAIL_CONTENT_TYPE = "image/png";

export async function generatePdfFirstPagePng(pdfBuffer: Buffer): Promise<Buffer | null> {
  try {
    const mod = await import("pdf-to-img");
    type PdfFn = (buf: Buffer, opts?: { scale?: number }) => Promise<{ getPage: (n: number) => Promise<Buffer> }>;
    const pdfFn = (mod.default ?? (mod as { pdf?: unknown }).pdf) as unknown as PdfFn | undefined;
    if (typeof pdfFn !== "function") return null;
    const doc = await pdfFn(pdfBuffer, { scale: THUMBNAIL_SCALE });
    const firstPage = await doc.getPage(1);
    if (!firstPage || !Buffer.isBuffer(firstPage)) return null;
    return firstPage as Buffer;
  } catch {
    return null;
  }
}

/**
 * Generate thumbnail for a document, upload to storage, return the storage key or null.
 */
export async function generateAndStoreDocumentThumbnail(
  documentId: string,
  firmId: string,
  pdfBuffer: Buffer
): Promise<string | null> {
  const png = await generatePdfFirstPagePng(pdfBuffer);
  if (!png || png.length === 0) return null;
  const key = `${firmId}/thumbnails/${documentId}.png`;
  await putObject(key, png, THUMBNAIL_CONTENT_TYPE);
  return key;
}
