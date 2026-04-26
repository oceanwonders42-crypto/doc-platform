/**
 * Build demand package PDF from package text sections.
 * Used by generate and regenerate-pdf.
 */
import { PDFDocument, PDFFont, StandardFonts } from "pdf-lib";

const MARGIN = 50;
const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const FONT_SIZE = 10;
const TITLE_SIZE = 16;
const SECTION_TITLE_SIZE = 12;
const MAX_LINE_WIDTH = PAGE_WIDTH - 2 * MARGIN;
const LINE_SPACE = 4;

export type DemandPackagePdfInput = {
  title: string;
  caseLabel: string;
  generatedDate: Date;
  summaryText?: string | null;
  liabilityText?: string | null;
  treatmentText?: string | null;
  damagesText?: string | null;
  futureCareText?: string | null;
  settlementText?: string | null;
  appendixDocuments?: { name: string }[];
  templateName?: string | null;
  templateVersion?: number | null;
  requiredSections?: string[];
};

function wrapLines(
  font: PDFFont,
  text: string,
  fontSize: number,
  maxWidth: number
): string[] {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const lines: string[] = [];
  let current = "";
  for (const w of words) {
    const next = current ? `${current} ${w}` : w;
    const width = font.widthOfTextAtSize(next, fontSize);
    if (width > maxWidth && current) {
      lines.push(current);
      current = w;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export async function buildDemandPackagePdf(input: DemandPackagePdfInput): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;
  const totalPagesRef = { count: 1 };

  const ensureSpace = (needed: number) => {
    if (y - needed < MARGIN) {
      page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
      totalPagesRef.count++;
    }
  };

  const drawLine = (text: string, opts?: { fontSize?: number; bold?: boolean }) => {
    const size = opts?.fontSize ?? FONT_SIZE;
    ensureSpace(size + LINE_SPACE);
    const f = opts?.bold ? fontBold : font;
    page.drawText(text, { x: MARGIN, y, size, font: f });
    y -= size + LINE_SPACE;
  };

  const drawBlock = (text: string, opts?: { fontSize?: number }) => {
    const size = opts?.fontSize ?? FONT_SIZE;
    const lines = wrapLines(font, text, size, MAX_LINE_WIDTH);
    for (const line of lines) {
      drawLine(line, { fontSize: size });
    }
  };

  const addPageNumber = (pageIndex: number) => {
    const label = `${pageIndex + 1} / ${totalPagesRef.count}`;
    const w = font.widthOfTextAtSize(label, FONT_SIZE - 2);
    page.drawText(label, {
      x: PAGE_WIDTH - MARGIN - w,
      y: MARGIN - 10,
      size: FONT_SIZE - 2,
      font,
    });
  };

  // Title page
  drawLine(input.title, { fontSize: TITLE_SIZE, bold: true });
  y -= 24;
  drawLine(input.caseLabel, { fontSize: SECTION_TITLE_SIZE });
  y -= 12;
  const dateStr = input.generatedDate.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  drawLine(`Generated: ${dateStr}`, { fontSize: FONT_SIZE });
  if (input.templateName) {
    drawLine(
      `Template: ${input.templateName}${input.templateVersion ? ` v${input.templateVersion}` : ""}`,
      { fontSize: FONT_SIZE }
    );
  }
  if (input.requiredSections && input.requiredSections.length > 0) {
    drawLine(`Required sections: ${input.requiredSections.join(", ")}`, { fontSize: FONT_SIZE });
  }
  y -= 40;
  drawLine("Demand Package", { fontSize: SECTION_TITLE_SIZE });
  drawLine("Confidential — Attorney Work Product");

  // Sections
  const sections: { heading: string; text: string | null | undefined }[] = [
    { heading: "1. Case Summary", text: input.summaryText },
    { heading: "2. Liability", text: input.liabilityText },
    { heading: "3. Treatment Chronology", text: input.treatmentText },
    { heading: "4. Damages", text: input.damagesText },
    { heading: "5. Future Care", text: input.futureCareText },
    { heading: "6. Settlement Demand", text: input.settlementText },
  ];

  for (const sec of sections) {
    if (!sec.text || !String(sec.text).trim()) continue;
    ensureSpace(SECTION_TITLE_SIZE + LINE_SPACE * 2);
    drawLine(sec.heading, { fontSize: SECTION_TITLE_SIZE, bold: true });
    y -= LINE_SPACE;
    drawBlock(sec.text);
    y -= LINE_SPACE * 2;
  }

  // Appendix: supporting documents
  if (input.appendixDocuments && input.appendixDocuments.length > 0) {
    ensureSpace(SECTION_TITLE_SIZE + LINE_SPACE * 3 + FONT_SIZE * (input.appendixDocuments.length + 2));
    drawLine("Appendix — Supporting Documents", { fontSize: SECTION_TITLE_SIZE, bold: true });
    y -= LINE_SPACE * 2;
    input.appendixDocuments.forEach((d, i) => {
      drawLine(`${i + 1}. ${d.name || "Document"}`, { fontSize: FONT_SIZE });
    });
  }

  // Add page numbers to all pages
  const pages = doc.getPages();
  totalPagesRef.count = pages.length;
  for (let i = 0; i < pages.length; i++) {
    addPageNumber(i);
  }

  const pdfBytes = await doc.save();
  return Buffer.from(pdfBytes);
}
