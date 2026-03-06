/**
 * Builds a case intelligence report PDF: timeline, insurance findings, document summaries, case insights.
 */
import { PDFDocument, StandardFonts } from "pdf-lib";
import { prisma } from "../db/prisma";
import { pgPool } from "../db/pg";
import { getCaseInsights } from "./caseInsights";

const MARGIN = 50;
const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const FONT_SIZE = 10;
const TITLE_SIZE = 16;
const SECTION_SIZE = 12;
const MAX_LINE_WIDTH = PAGE_WIDTH - 2 * MARGIN;
const LINE_SPACE = 4;
const SECTION_GAP = 12;

type TimelineEvent = {
  eventDate: Date | null;
  eventType: string | null;
  track: string | null;
  provider: string | null;
  diagnosis: string | null;
  procedure: string | null;
  amount: string | null;
  documentId: string;
};

type DocRecognition = {
  document_id: string;
  original_name: string;
  doc_type: string | null;
  summary: { summary?: string; keyFacts?: string[] } | null;
  insurance_fields: unknown;
};

export type CaseReportData = {
  caseTitle: string | null;
  caseNumber: string | null;
  clientName: string | null;
  timelineEvents: TimelineEvent[];
  documents: DocRecognition[];
  insights: { type: string; severity: string; summary: string; detail?: string | null }[];
};

export async function getCaseReportData(caseId: string, firmId: string): Promise<CaseReportData | null> {
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

  const docs = await prisma.document.findMany({
    where: { routedCaseId: caseId, firmId },
    select: { id: true, originalName: true },
  });
  const docIds = docs.map((d) => d.id);
  const docByName = new Map(docs.map((d) => [d.id, d.originalName]));

  let recRows: { document_id: string; doc_type: string | null; summary: unknown; insurance_fields: unknown }[] = [];
  if (docIds.length > 0) {
    const { rows } = await pgPool.query<{
      document_id: string;
      doc_type: string | null;
      summary: unknown;
      insurance_fields: unknown;
    }>(
      `select document_id, doc_type, summary, insurance_fields from document_recognition where document_id = any($1)`,
      [docIds]
    );
    recRows = rows;
  }
  const recByDoc = new Map(recRows.map((r) => [r.document_id, r]));

  const documents: DocRecognition[] = docIds.map((id) => {
    const rec = recByDoc.get(id);
    let summaryPayload: { summary?: string; keyFacts?: string[] } | null = null;
    if (rec?.summary != null) {
      if (typeof rec.summary === "object" && rec.summary !== null && "summary" in (rec.summary as object)) {
        summaryPayload = rec.summary as { summary?: string; keyFacts?: string[] };
      } else if (typeof rec.summary === "string") {
        try {
          summaryPayload = JSON.parse(rec.summary) as { summary?: string; keyFacts?: string[] };
        } catch {
          summaryPayload = { summary: rec.summary };
        }
      }
    }
    return {
      document_id: id,
      original_name: docByName.get(id) ?? "Document",
      doc_type: rec?.doc_type ?? null,
      summary: summaryPayload,
      insurance_fields: rec?.insurance_fields ?? null,
    };
  });

  const { insights } = await getCaseInsights(caseId, firmId);

  return {
    caseTitle: legalCase.title ?? null,
    caseNumber: legalCase.caseNumber ?? null,
    clientName: legalCase.clientName ?? null,
    timelineEvents: events as TimelineEvent[],
    documents,
    insights: insights.map((i) => ({
      type: i.type,
      severity: i.severity,
      summary: i.summary,
      detail: i.detail ?? null,
    })),
  };
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

function stringifyInsuranceFields(ins: unknown): string {
  if (ins == null) return "";
  if (typeof ins === "string") return ins;
  if (typeof ins !== "object") return String(ins);
  const o = ins as Record<string, unknown>;
  const parts: string[] = [];
  if (o.insuranceCompany != null) parts.push(`Carrier: ${String(o.insuranceCompany)}`);
  if (o.settlementOffer != null) parts.push(`Settlement offer: $${Number(o.settlementOffer).toLocaleString()}`);
  if (o.policyLimits != null) parts.push(`Policy limits: ${JSON.stringify(o.policyLimits)}`);
  if (o.letterDate != null) parts.push(`Letter date: ${String(o.letterDate)}`);
  const rest = Object.entries(o).filter(
    ([k]) => !["insuranceCompany", "settlementOffer", "policyLimits", "letterDate"].includes(k)
  );
  for (const [k, v] of rest) {
    if (v != null && typeof v !== "object") parts.push(`${k}: ${String(v)}`);
  }
  return parts.join(" · ") || JSON.stringify(ins);
}

export async function buildCaseReportPdf(caseId: string, firmId: string): Promise<Buffer> {
  const data = await getCaseReportData(caseId, firmId);
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
    const lines = wrapLines(text, size);
    for (const line of lines) {
      drawLine(line, { fontSize: size });
    }
  };

  // Title
  drawLine("Case Intelligence Report", { fontSize: TITLE_SIZE, bold: true });
  y -= SECTION_GAP;
  const caseLabel = [data.clientName, data.caseNumber, data.caseTitle].filter(Boolean).join(" · ") || "Case";
  drawLine(caseLabel, { fontSize: SECTION_SIZE });
  y -= SECTION_GAP * 2;

  // Timeline
  drawLine("Timeline", { fontSize: SECTION_SIZE, bold: true });
  y -= LINE_SPACE;
  if (data.timelineEvents.length === 0) {
    drawLine("No timeline events.");
  } else {
    for (const e of data.timelineEvents) {
      ensureSpace(FONT_SIZE * 3 + LINE_SPACE * 2);
      drawLine(`${formatDate(e.eventDate)}  ${e.eventType ?? e.track ?? "Event"}${e.provider ? ` — ${e.provider}` : ""}`);
      if (e.diagnosis || e.procedure) drawLine(`   ${[e.diagnosis, e.procedure].filter(Boolean).join(" · ")}`, { fontSize: FONT_SIZE - 1 });
      if (e.amount) drawLine(`   Amount: ${e.amount}`, { fontSize: FONT_SIZE - 1 });
    }
  }
  y -= SECTION_GAP;

  // Insurance findings
  drawLine("Insurance findings", { fontSize: SECTION_SIZE, bold: true });
  y -= LINE_SPACE;
  const insuranceDocs = data.documents.filter((d) => d.doc_type?.startsWith("insurance_") && (d.insurance_fields != null || (d.summary && (d.summary.summary || (d.summary.keyFacts?.length ?? 0) > 0))));
  if (insuranceDocs.length === 0) {
    drawLine("No insurance documents or findings.");
  } else {
    for (const d of insuranceDocs) {
      ensureSpace(FONT_SIZE * 4);
      drawLine(`${d.original_name} (${d.doc_type ?? "insurance"})`, { bold: true });
      if (d.insurance_fields != null) {
        const str = stringifyInsuranceFields(d.insurance_fields);
        if (str) drawBlock(str, { fontSize: FONT_SIZE - 1 });
      }
      if (d.summary?.summary) drawBlock(d.summary.summary, { fontSize: FONT_SIZE - 1 });
      if (d.summary?.keyFacts?.length) {
        for (const k of d.summary.keyFacts) drawLine(`  • ${k}`, { fontSize: FONT_SIZE - 1 });
      }
      y -= LINE_SPACE;
    }
  }
  y -= SECTION_GAP;

  // Document summaries
  drawLine("Document summaries", { fontSize: SECTION_SIZE, bold: true });
  y -= LINE_SPACE;
  if (data.documents.length === 0) {
    drawLine("No documents linked to this case.");
  } else {
    for (const d of data.documents) {
      ensureSpace(FONT_SIZE * 3);
      drawLine(`${d.original_name} (${d.doc_type ?? "document"})`, { bold: true });
      if (d.summary?.summary) drawBlock(d.summary.summary, { fontSize: FONT_SIZE - 1 });
      if (d.summary?.keyFacts?.length) {
        for (const k of d.summary.keyFacts) drawLine(`  • ${k}`, { fontSize: FONT_SIZE - 1 });
      }
      if (!d.summary?.summary && (!d.summary?.keyFacts?.length)) drawLine("No summary available.");
      y -= LINE_SPACE;
    }
  }
  y -= SECTION_GAP;

  // Case insights
  drawLine("Case insights", { fontSize: SECTION_SIZE, bold: true });
  y -= LINE_SPACE;
  if (data.insights.length === 0) {
    drawLine("No automated insights for this case.");
  } else {
    for (const i of data.insights) {
      ensureSpace(FONT_SIZE * 3);
      drawLine(`[${i.severity}] ${i.summary}`, { bold: true });
      if (i.detail) drawBlock(i.detail, { fontSize: FONT_SIZE - 1 });
    }
  }

  const pdfBytes = await doc.save();
  return Buffer.from(pdfBytes);
}
