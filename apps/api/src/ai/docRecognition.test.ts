import assert from "node:assert/strict";

import { PDFDocument, StandardFonts } from "pdf-lib";

import {
  classifyAndExtract,
  extractTextFromPdf,
  extractTextFromPdfPerPage,
} from "./docRecognition";

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

  const syntheticEr = classifyAndExtract(
    [
      "SYNTHETIC TEST DOCUMENT - NOT REAL DATA",
      "Emergency Department Report - Metro General Hospital",
      "Client   Jordan Alvarez",
      "DOB   1991-08-14",
      "Claim Number   CLM-QA-240424",
      "Policy Number   POL-QA-7788",
      "Incident Date   2026-03-18",
    ].join(" ")
  );
  assert.equal(syntheticEr.docType, "medical_record");
  assert.equal(syntheticEr.clientName, "Jordan Alvarez");
  assert.equal(syntheticEr.incidentDate, "2026-03-18");

  const syntheticBilling = classifyAndExtract(
    "SYNTHETIC TEST DOCUMENT - NOT REAL DATA Billing Ledger Client Jordan Alvarez Balance Due 8200.00"
  );
  assert.equal(syntheticBilling.docType, "billing_statement");

  const syntheticInsurance = classifyAndExtract(
    "SYNTHETIC TEST DOCUMENT - NOT REAL DATA Insurance Letter Claim Number CLM-QA-240424 Policy Number POL-QA-7788 Carrier Atlas Mutual Insurance Adjuster Melissa Grant"
  );
  assert.equal(syntheticInsurance.docType, "insurance_letter");

  console.log("docRecognition tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
