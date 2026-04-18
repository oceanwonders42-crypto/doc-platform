/**
 * Image/PDF page preprocessing before OCR.
 * Track what was applied for diagnostics.
 */
import sharp from "sharp";

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

const TARGET_MIN_WIDTH = 1800;
const PDF_PAGE_SCALE = 2;

function dedupeSteps(steps: PreprocessStep[]): PreprocessStep[] {
  return [...new Set(steps)];
}

/**
 * Apply a small, repeatable cleanup pass that improves OCR odds without inventing content.
 * If preprocessing fails, we keep the original image so OCR still gets an honest attempt.
 */
export async function preprocessPageImage(
  buffer: Buffer,
  _mimeType?: string
): Promise<PreprocessResult> {
  const applied: PreprocessStep[] = [];

  try {
    const metadata = await sharp(buffer, { failOn: "none", limitInputPixels: false }).metadata();
    let pipeline = sharp(buffer, { failOn: "none", limitInputPixels: false }).rotate();

    if ((metadata.orientation ?? 1) > 1) {
      applied.push("rotate");
    }

    const width = metadata.width ?? 0;
    if (width > 0 && width < TARGET_MIN_WIDTH) {
      pipeline = pipeline.resize({
        width: TARGET_MIN_WIDTH,
        fit: "inside",
        withoutEnlargement: false,
      });
      applied.push("resolution_normalize");
    }

    pipeline = pipeline.grayscale();
    applied.push("grayscale");

    pipeline = pipeline.normalize();
    applied.push("contrast");

    pipeline = pipeline.threshold(180);
    applied.push("binarize");

    return {
      buffer: await pipeline.png().toBuffer(),
      applied: dedupeSteps(applied),
    };
  } catch {
    return {
      buffer,
      applied: [],
    };
  }
}

type PdfToImgModule = {
  default?: (buffer: Buffer, opts?: { scale?: number }) => Promise<{ getPage: (n: number) => Promise<Buffer> }>;
  pdf?: (buffer: Buffer, opts?: { scale?: number }) => Promise<{ getPage: (n: number) => Promise<Buffer> }>;
};

async function renderPdfPage(pdfBuffer: Buffer, pageNum: number): Promise<Buffer | null> {
  try {
    const mod = (await import("pdf-to-img")) as unknown as PdfToImgModule;
    const pdfFn = (mod.default ?? mod.pdf) as PdfToImgModule["default"];
    if (typeof pdfFn !== "function") return null;
    const doc = await pdfFn(pdfBuffer, { scale: PDF_PAGE_SCALE });
    let pageIndex = 1;
    for await (const pageBuffer of doc) {
      if (pageIndex === pageNum) {
        return Buffer.isBuffer(pageBuffer) && pageBuffer.length > 0 ? pageBuffer : null;
      }
      pageIndex += 1;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Render a PDF page to an image, then run the same cleanup used for image uploads.
 */
export async function preprocessPdfPage(pdfBuffer: Buffer, pageNum: number): Promise<PreprocessResult> {
  const renderedPage = await renderPdfPage(pdfBuffer, pageNum);
  if (!renderedPage) {
    return { buffer: Buffer.from([]), applied: [] };
  }
  return preprocessPageImage(renderedPage, "image/png");
}
