"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTimelineChronologyData = getTimelineChronologyData;
exports.buildTimelineChronologyPdf = buildTimelineChronologyPdf;
exports.buildTimelineChronologyDocx = buildTimelineChronologyDocx;
/**
 * Timeline export (medical chronology): PDF and DOCX.
 * Includes: event date, provider, diagnosis, procedure, document reference.
 */
const pdf_lib_1 = require("pdf-lib");
const prisma_1 = require("../db/prisma");
const MARGIN = 50;
const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const FONT_SIZE = 10;
const TITLE_SIZE = 14;
const SECTION_SIZE = 12;
const MAX_LINE_WIDTH = PAGE_WIDTH - 2 * MARGIN;
const LINE_SPACE = 4;
async function getTimelineChronologyData(caseId, firmId) {
    const legalCase = await prisma_1.prisma.legalCase.findFirst({
        where: { id: caseId, firmId },
        select: { title: true, caseNumber: true, clientName: true },
    });
    if (!legalCase)
        return null;
    const events = await prisma_1.prisma.caseTimelineEvent.findMany({
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
    const docIds = [...new Set(events.map((e) => e.documentId))];
    const docs = docIds.length > 0
        ? await prisma_1.prisma.document.findMany({
            where: { id: { in: docIds }, firmId },
            select: { id: true, originalName: true },
        })
        : [];
    const docByName = new Map(docs.map((d) => [d.id, d.originalName]));
    const caseLabel = [legalCase.clientName, legalCase.caseNumber, legalCase.title]
        .filter(Boolean)
        .join(" · ") || "Case";
    const rows = events.map((e) => ({
        ...e,
        documentName: docByName.get(e.documentId) ?? null,
    }));
    return { caseLabel, events: rows };
}
function formatDate(d) {
    if (!d)
        return "—";
    try {
        return new Date(d).toLocaleDateString("en-US", {
            year: "numeric",
            month: "short",
            day: "numeric",
        });
    }
    catch {
        return "—";
    }
}
async function buildTimelineChronologyPdf(caseId, firmId) {
    const data = await getTimelineChronologyData(caseId, firmId);
    if (!data)
        throw new Error("Case not found");
    const doc = await pdf_lib_1.PDFDocument.create();
    const font = await doc.embedFont(pdf_lib_1.StandardFonts.Helvetica);
    const fontBold = await doc.embedFont(pdf_lib_1.StandardFonts.HelveticaBold);
    let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    let y = PAGE_HEIGHT - MARGIN;
    const ensureSpace = (needed) => {
        if (y - needed < MARGIN) {
            page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
            y = PAGE_HEIGHT - MARGIN;
        }
    };
    const drawLine = (text, opts) => {
        const size = opts?.fontSize ?? FONT_SIZE;
        ensureSpace(size + LINE_SPACE);
        const f = opts?.bold ? fontBold : font;
        page.drawText(text, { x: MARGIN, y, size, font: f });
        y -= size + LINE_SPACE;
    };
    const wrapLines = (text, fontSize = FONT_SIZE) => {
        const words = String(text).split(/\s+/);
        const lines = [];
        let current = "";
        for (const w of words) {
            const next = current ? `${current} ${w}` : w;
            const width = font.widthOfTextAtSize(next, fontSize);
            if (width > MAX_LINE_WIDTH && current) {
                lines.push(current);
                current = w;
            }
            else {
                current = next;
            }
        }
        if (current)
            lines.push(current);
        return lines;
    };
    const drawBlock = (text, opts) => {
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
    }
    else {
        for (const e of data.events) {
            ensureSpace(FONT_SIZE * 4 + LINE_SPACE * 2);
            const dateStr = formatDate(e.eventDate);
            const typeLabel = e.eventType ?? e.track ?? "Event";
            drawLine(`${dateStr}  ${typeLabel}${e.provider ? ` — ${e.provider}` : ""}`);
            const details = [];
            if (e.diagnosis)
                details.push(`Diagnosis: ${e.diagnosis}`);
            if (e.procedure)
                details.push(`Procedure: ${e.procedure}`);
            if (details.length)
                drawBlock(`   ${details.join(" · ")}`, { fontSize: FONT_SIZE - 1 });
            if (e.amount)
                drawLine(`   Amount: ${e.amount}`, { fontSize: FONT_SIZE - 1 });
            const docRef = e.documentName ? `Document: ${e.documentName}` : "Document reference";
            drawLine(`   ${docRef}`, { fontSize: FONT_SIZE - 1 });
            y -= LINE_SPACE;
        }
    }
    const pdfBytes = await doc.save();
    return Buffer.from(pdfBytes);
}
/** Build DOCX buffer for medical chronology. Uses "docx" package when available. */
async function buildTimelineChronologyDocx(caseId, firmId) {
    const data = await getTimelineChronologyData(caseId, firmId);
    if (!data)
        throw new Error("Case not found");
    try {
        const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, BorderStyle, } = await Promise.resolve().then(() => __importStar(require("docx")));
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
        const dataRows = data.events.map((e) => new TableRow({
            children: [
                new TableCell({ children: [new Paragraph({ children: [new TextRun(formatDate(e.eventDate))] })] }),
                new TableCell({ children: [new Paragraph({ children: [new TextRun(e.provider ?? "—")] })] }),
                new TableCell({ children: [new Paragraph({ children: [new TextRun(e.diagnosis ?? "—")] })] }),
                new TableCell({ children: [new Paragraph({ children: [new TextRun(e.procedure ?? "—")] })] }),
                new TableCell({ children: [new Paragraph({ children: [new TextRun(e.documentName ?? e.documentId)] })] }),
            ],
        }));
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
    }
    catch {
        const lines = [
            "Medical Chronology",
            "",
            data.caseLabel,
            "",
            "Date\tProvider\tDiagnosis\tProcedure\tDocument reference",
            ...data.events.map((e) => [
                formatDate(e.eventDate),
                e.provider ?? "",
                e.diagnosis ?? "",
                e.procedure ?? "",
                e.documentName ?? e.documentId,
            ].join("\t")),
        ];
        return Buffer.from(lines.join("\r\n"), "utf-8");
    }
}
