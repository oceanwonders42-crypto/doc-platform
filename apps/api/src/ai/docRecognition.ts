// /src/ai/docRecognition.ts
// Uses pdfjs-dist (must be installed in apps/api). Node/CommonJS: use legacy build.

function clean(s: string) {
  return s.replace(/\s+/g, " ").trim();
}

function getPdfjs() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pdfjs = require("pdfjs-dist/legacy/build/pdf.js");
    if (pdfjs && typeof pdfjs.getDocument === "function") return pdfjs;
    console.error("[docRecognition] pdfjs-dist/legacy/build/pdf.js loaded but getDocument missing; keys:", Object.keys(pdfjs || {}));
  } catch (e: unknown) {
    const err = e instanceof Error ? e : new Error(String(e));
    console.error("[docRecognition] require pdfjs-dist/legacy/build/pdf.js failed:", err.message);
  }
  throw new Error(
    "PDF text extraction unavailable: pdfjs-dist not installed or wrong build. Run: pnpm -C apps/api add pdfjs-dist@^3"
  );
}

export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  const pdfjs = getPdfjs();

  if (typeof (pdfjs as any).GlobalWorkerOptions !== "undefined") {
    (pdfjs as any).GlobalWorkerOptions.workerSrc = "";
  }

  const data = buffer instanceof Buffer ? new Uint8Array(buffer) : buffer;
  let loadingTask: any;
  try {
    loadingTask = (pdfjs as any).getDocument({ data });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[docRecognition] getDocument failed:", msg);
    throw new Error(`PDF parse failed: ${msg}`);
  }
  const pdf = await loadingTask.promise;

  let fullText = "";
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const pageText = (content.items as any[])
      .map((it: any) => (typeof it.str === "string" ? it.str : ""))
      .join(" ");
    fullText += pageText + "\n";
  }

  return fullText.trim();
}

export type PdfPageText = { page: number; text: string };

/** Extract text per page; returns full concatenated text and per-page array. */
export async function extractTextFromPdfPerPage(buffer: Buffer): Promise<{ fullText: string; pageTexts: PdfPageText[] }> {
  const pdfjs = getPdfjs();

  if (typeof (pdfjs as any).GlobalWorkerOptions !== "undefined") {
    (pdfjs as any).GlobalWorkerOptions.workerSrc = "";
  }

  const data = buffer instanceof Buffer ? new Uint8Array(buffer) : buffer;
  let loadingTask: any;
  try {
    loadingTask = (pdfjs as any).getDocument({ data });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`PDF parse failed: ${msg}`);
  }
  const pdf = await loadingTask.promise;
  const pageTexts: PdfPageText[] = [];
  let fullText = "";

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const pageText = (content.items as any[])
      .map((it: any) => (typeof it.str === "string" ? it.str : ""))
      .join(" ");
    pageTexts.push({ page: pageNum, text: pageText });
    fullText += pageText + "\n";
  }

  return { fullText: fullText.trim(), pageTexts };
}

// KEEP your existing classify logic, but make sure it's inside this function
export function classifyAndExtract(textRaw: string) {
  const text = clean(textRaw);
  const lower = text.toLowerCase();

  let docType = "unknown";
  if (lower.includes("medical record") || lower.includes("patient") || lower.includes("diagnosis")) docType = "medical_record";
  else if (lower.includes("police") || lower.includes("incident report") || lower.includes("offense")) docType = "police_report";
  else if (lower.includes("invoice") || lower.includes("amount due") || lower.includes("balance")) docType = "invoice";
  else if (lower.includes("demand") && lower.includes("settlement")) docType = "demand_letter";
  else if (lower.includes("intake") || lower.includes("new client") || lower.includes("questionnaire")) docType = "client_intake";

  const caseNumber =
    text.match(/\b(case\s*(no|#|number)\s*[:\-]?\s*)([A-Z0-9\-\/]{4,})/i)?.[3] || null;

  const clientName =
    text.match(/\b(client|patient|claimant)\s*[:\-]\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\b/)?.[2] || null;

  const incidentDate =
    text.match(/\b(date of loss|incident date|loss date)\s*[:\-]?\s*([0-9]{1,2}\/[0-9]{1,2}\/[0-9]{2,4})/i)?.[2] || null;

  let confidence = 0.4;
  if (docType !== "unknown") confidence += 0.2;
  if (caseNumber) confidence += 0.2;
  if (clientName) confidence += 0.1;
  if (incidentDate) confidence += 0.1;
  if (confidence > 0.95) confidence = 0.95;

  return {
    docType,
    caseNumber,
    clientName,
    incidentDate,
    confidence,
    excerpt: text.slice(0, 1200),
  };
}
