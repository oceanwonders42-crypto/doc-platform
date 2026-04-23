import assert from "node:assert/strict";

import { PDFDocument, StandardFonts } from "pdf-lib";

import { extractTextFromPdf, extractTextFromPdfPerPage } from "./docRecognition";

async function createPdf(lines: string[]): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([612, 792]);
  page.drawText(lines.join("\n"), {
    x: 40,
    y: 720,
    size: 12,
    font,
    lineHeight: 16,
  });
  return Buffer.from(await doc.save());
}

async function main() {
  const lines = [
    "Medical Record",
    "Patient: Riley Carter",
    "Case Number: SMOKE-2026-001",
    "Diagnosis: Cervical strain and lumbar strain.",
  ];
  const pdf = await createPdf(lines);

  const fullText = await extractTextFromPdf(pdf);
  assert.match(fullText, /Medical Record/);
  assert.match(fullText, /Riley Carter/);
  assert.match(fullText, /SMOKE-2026-001/);

  const perPage = await extractTextFromPdfPerPage(pdf);
  assert.equal(perPage.pageTexts.length, 1);
  assert.match(perPage.pageTexts[0]?.text ?? "", /Cervical strain/);
  assert.match(perPage.fullText, /lumbar strain/);

  console.log("docRecognition tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
