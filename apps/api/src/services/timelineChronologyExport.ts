/**
 * Timeline export (medical chronology): PDF and DOCX.
 * Includes: event date, provider, diagnosis, procedure, document reference.
 */
import { PDFDocument, StandardFonts } from "pdf-lib";
import { prisma } from "../db/prisma";

const MARGIN = 50;
const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const FONT_SIZE = 10;
const TITLE_SIZE = 14;
const SECTION_SIZE = 12;
const MAX_LINE_WIDTH = PAGE_WIDTH - 2 * MARGIN;
const LINE_SPACE = 4;

export type TimelineEventRow = {
  eventDate: Date | null;
  eventType: string | null;
  track: string | null;
  provider: string | null;
  diagnosis: string | null;
  procedure: string | null;
  amount: string | null;
  documentId: string;
  documentName?: string | null;
};

export async function getTimelineChronologyData(
  caseId: string,
  firmId: string
): Promise<{ caseLabel: string; events: TimelineEventRow[] } | null> {
  const legalCase = await prisma.legalCase.findFirst({
    where: { id: caseId, firmId },
    select: { title: true, caseNumber: true, clientName: true },
  });
  if (!legalCase) return null;

  const events = await prisma.caseTimelineEvent.findMany({
    where: { caseId, firmId },
    orderBy: [{ eventDate: "asc" }, { createdAt: "asc" }],
    select: {
      eventDate: true,
      eventType: true,
      track: true,
      provider: true,
      diagnosis: true,
      procedure: true,
      amount: true,
      documentId: true,
    },
  });

  const docIds = [...new Set(events.map((e: { documentId: string }) => e.documentId))];
  const docs =
    docIds.length > 0
      ? await prisma.document.findMany({
          where: { id: { in: docIds }, firmId },
          select: { id: true, originalName: true },
        })
      : [];
  const docByName = new Map(docs.map((d: { id: string; originalName: string | null }) => [d.id, d.originalName]));

  const caseLabel = [legalCase.clientName, legalCase.caseNumber, legalCase.title]
    .filter(Boolean)
    .join(" · ") || "Case";

  const rows: TimelineEventRow[] = events.map((e: { documentId: string; eventDate: Date | null; eventType: string | null; track: string | null; provider: string | null; diagnosis: string | null; procedure: string | null; amount: string | null }) => ({
    ...e,
    documentName: docByName.get(e.documentId) ?? null,
  }));

  return { caseLabel, events: rows };
}

function formatDate(d: Date | null): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "—";
  }
}

export async function buildTimelineChronologyPdf(
  caseId: string,
  firmId: string
): Promise<Buffer> {
  const data = await getTimelineChronologyData(caseId, firmId);
  if (!data) throw new Error("Case not found");

  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  const ensureSpace = (needed: number) => {
    if (y - needed < MARGIN) {
      page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
    }
  };

  const drawLine = (text: string, opts?: { fontSize?: number; bold?: boolean }) => {
    const size = opts?.fontSize ?? FONT_SIZE;
    ensureSpace(size + LINE_SPACE);
    const f = opts?.bold ? fontBold : font;
    page.drawText(text, { x: MARGIN, y, size, font: f });
    y -= size + LINE_SPACE;
  };

  const wrapLines = (text: string, fontSize: number = FONT_SIZE): string[] => {
    const words = String(text).split(/\s+/);
    const lines: string[] = [];
    let current = "";
    for (const w of words) {
      const next = current ? `${current} ${w}` : w;
      const width = font.widthOfTextAtSize(next, fontSize);
      if (width > MAX_LINE_WIDTH && current) {
        lines.push(current);
        current = w;
      } else {
        current = next;
      }
    }
    if (current) lines.push(current);
    return lines;
  };

  const drawBlock = (text: string, opts?: { fontSize?: number }) => {
    const size = opts?.fontSize ?? FONT_SIZE;
    for (const line of wrapLines(text, size)) {
      drawLine(line, { fontSize: size });
    }
  };

  drawLine("Medical Chronology", { fontSize: TITLE_SIZE, bold: true });
  y -= 8;
  drawLine(data.caseLabel, { fontSize: SECTION_SIZE });
  y -= 16;

  if (data.events.length === 0) {
    drawLine("No timeline events.");
  } else {
    for (const e of data.events) {
      ensureSpace(FONT_SIZE * 4 + LINE_SPACE * 2);
      const dateStr = formatDate(e.eventDate);
      const typeLabel = e.eventType ?? e.track ?? "Event";
      drawLine(`${dateStr}  ${typeLabel}${e.provider ? ` — ${e.provider}` : ""}`);
      const details: string[] = [];
      if (e.diagnosis) details.push(`Diagnosis: ${e.diagnosis}`);
      if (e.procedure) details.push(`Procedure: ${e.procedure}`);
      if (details.length) drawBlock(`   ${details.join(" · ")}`, { fontSize: FONT_SIZE - 1 });
      if (e.amount) drawLine(`   Amount: ${e.amount}`, { fontSize: FONT_SIZE - 1 });
      const docRef = e.documentName ? `Document: ${e.documentName}` : "Document reference";
      drawLine(`   ${docRef}`, { fontSize: FONT_SIZE - 1 });
      y -= LINE_SPACE;
    }
  }

  const pdfBytes = await doc.save();
  return Buffer.from(pdfBytes);
}

/** Build DOCX buffer for medical chronology. Uses "docx" package when available. */
export async function buildTimelineChronologyDocx(
  caseId: string,
  firmId: string
): Promise<Buffer> {
  const data = await getTimelineChronologyData(caseId, firmId);
  if (!data) throw new Error("Case not found");

  try {
    const {
      Document,
      Packer,
      Paragraph,
      TextRun,
      Table,
      TableRow,
      TableCell,
      WidthType,
      BorderStyle,
    } = await import("docx");

    const border = { style: BorderStyle.SINGLE, size: 1 };
    const headerRow = new TableRow({
      children: [
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Date", bold: true })] })] }),
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Provider", bold: true })] })] }),
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Diagnosis", bold: true })] })] }),
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Procedure", bold: true })] })] }),
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Document reference", bold: true })] })] }),
      ],
    });

    const dataRows = data.events.map(
      (e) =>
        new TableRow({
          children: [
            new TableCell({ children: [new Paragraph({ children: [new TextRun(formatDate(e.eventDate))] })] }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun(e.provider ?? "—")] })] }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun(e.diagnosis ?? "—")] })] }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun(e.procedure ?? "—")] })] }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun(e.documentName ?? e.documentId)] })] }),
          ],
        })
    );

    const doc = new Document({
      sections: [
        {
          children: [
            new Paragraph({
              children: [new TextRun({ text: "Medical Chronology", bold: true })],
              spacing: { after: 200 },
            }),
            new Paragraph({
              children: [new TextRun(data.caseLabel)],
              spacing: { after: 400 },
            }),
            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              borders: {
                top: border,
                bottom: border,
                left: border,
                right: border,
              },
              rows: [headerRow, ...dataRows],
            }),
          ],
        },
      ],
    });

    const buf = await Packer.toBuffer(doc);
    return Buffer.from(buf);
  } catch {
    const lines: string[] = [
      "Medical Chronology",
      "",
      data.caseLabel,
      "",
      "Date\tProvider\tDiagnosis\tProcedure\tDocument reference",
      ...data.events.map((e) =>
        [
          formatDate(e.eventDate),
          e.provider ?? "",
          e.diagnosis ?? "",
          e.procedure ?? "",
          e.documentName ?? e.documentId,
        ].join("\t")
      ),
    ];
    return Buffer.from(lines.join("\r\n"), "utf-8");
  }
}
