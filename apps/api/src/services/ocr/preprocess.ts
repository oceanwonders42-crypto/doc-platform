/**
 * Image/PDF page preprocessing before OCR.
 * Track what was applied for diagnostics.
 * Full implementation could use sharp (images) or pdf-to-image + sharp for PDF pages.
 */
export type PreprocessStep =
  | "deskew"
  | "rotate"
  | "denoise"
  | "contrast"
  | "grayscale"
  | "binarize"
  | "border_cleanup"
  | "resolution_normalize";

export interface PreprocessResult {
  buffer: Buffer;
  applied: PreprocessStep[];
}

/**
 * Stub: return buffer unchanged and record that no preprocessing was run.
 * When sharp or similar is available, run deskew/denoise/contrast per page.
 */
export async function preprocessPageImage(
  buffer: Buffer,
  _mimeType?: string
): Promise<PreprocessResult> {
  return {
    buffer,
    applied: [],
  };
}

/**
 * For PDFs with no embedded text, we would:
 * 1. Render each page to image
 * 2. Run preprocessPageImage on each
 * 3. Run image OCR (e.g. Tesseract) on result
 * Current pipeline uses embedded text only; image path is placeholder.
 */
export async function preprocessPdfPage(_pdfBuffer: Buffer, _pageNum: number): Promise<PreprocessResult> {
  return { buffer: Buffer.from([]), applied: [] };
}
