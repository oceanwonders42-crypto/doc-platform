import "dotenv/config";

import assert from "node:assert/strict";

import { prisma } from "../db/prisma";
import { matchDocumentToCase } from "./caseMatching";

async function main() {
  const suffix = Date.now();
  const firmId = `email-match-firm-${suffix}`;
  const caseId = `email-match-case-${suffix}`;
  const documentId = `email-match-document-${suffix}`;

  await prisma.firm.create({
    data: {
      id: firmId,
      name: "Email Match Test Firm",
    },
  });

  await prisma.legalCase.create({
    data: {
      id: caseId,
      firmId,
      title: "Jane Doe PI Matter",
      caseNumber: "CLM-445566",
      clientName: "Jane Doe",
    },
  });

  await prisma.document.create({
    data: {
      id: documentId,
      firmId,
      source: "email",
      spacesKey: `tests/${documentId}.pdf`,
      originalName: "claim-letter.pdf",
      mimeType: "application/pdf",
      pageCount: 1,
      status: "RECEIVED",
      processingStage: "uploaded",
      ingestedAt: new Date(),
      metaJson: {
        emailAutomation: {
          version: "email_automation_v1",
          extractedAt: new Date().toISOString(),
          source: {
            fromEmail: "adjuster@carrier.test",
            subject: "Claim letter",
            attachmentFileName: "claim-letter.pdf",
            attachmentNames: ["claim-letter.pdf"],
          },
          fields: {
            clientName: { value: "Jane Doe", confidence: 0.82, sources: ["subject"] },
            dateOfLoss: null,
            claimNumber: { value: "CLM-445566", confidence: 0.91, sources: ["body"] },
            policyNumber: null,
            insuranceCarrier: null,
          },
          matchSignals: {
            caseNumberCandidates: ["CLM-445566"],
            clientNameCandidates: ["Jane Doe"],
            supportingSignals: ["claim number (91%)", "client name (82%)"],
          },
        },
      },
    },
  });

  try {
    const match = await matchDocumentToCase(
      firmId,
      {
        documentId,
        caseNumber: null,
        clientName: null,
      },
      null
    );

    assert.equal(match.caseId, caseId);
    assert(
      match.matchConfidence >= 0.9,
      `Expected high-confidence match from email claim number, got ${match.matchConfidence}`
    );
    assert(
      /case number/i.test(match.matchReason),
      `Expected match reason to mention a case-number-style signal, got ${match.matchReason}`
    );

    console.log("caseMatching email signal tests passed");
  } finally {
    await prisma.document.deleteMany({ where: { id: documentId } });
    await prisma.legalCase.deleteMany({ where: { id: caseId } });
    await prisma.firm.deleteMany({ where: { id: firmId } });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
