import { PDFDocument } from "pdf-lib";

export async function countPagesFromBuffer(buf: Buffer, mimeType: string, originalName: string) {
  const isPdf =
    mimeType === "application/pdf" ||
    originalName.toLowerCase().endsWith(".pdf");

  if (!isPdf) return 1;

  const pdf = await PDFDocument.load(buf, { ignoreEncryption: true });
  return pdf.getPageCount();
}
