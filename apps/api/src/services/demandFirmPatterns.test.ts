import "dotenv/config";

import assert from "node:assert/strict";

import { prisma } from "../db/prisma";
import {
  buildFirmDemandPatternsPromptBlock,
  getFirmDemandPatterns,
} from "./demandFirmPatterns";

async function main() {
  const suffix = Date.now();
  const firmId = `demand-pattern-firm-${suffix}`;
  const preferredDocumentId = `demand-pattern-doc-preferred-${suffix}`;
  const fallbackDocumentId = `demand-pattern-doc-fallback-${suffix}`;

  await prisma.firm.create({
    data: {
      id: firmId,
      name: "Demand Pattern Test Firm",
    },
  });

  try {
    await prisma.demandBankDocument.create({
      data: {
        id: preferredDocumentId,
        firmId,
        title: "Preferred Demand Example",
        originalText: "Preferred example text",
        redactedText: "Preferred example text",
        approvedForReuse: true,
        reviewStatus: "approved",
      },
    });
    await prisma.demandBankSection.create({
      data: {
        demandBankDocumentId: preferredDocumentId,
        sectionType: "treatment_summary",
        heading: "Treatment Course",
        originalText: "Ms. Client treated consistently with physical therapy and injections.",
        redactedText: "[CLIENT] treated consistently with physical therapy and injections.",
        approvedForReuse: true,
        qualityScore: 92,
      },
    });

    await prisma.demandBankDocument.create({
      data: {
        id: fallbackDocumentId,
        firmId,
        title: "Fallback Liability Example",
        originalText: "Fallback example text",
        redactedText: "Fallback example text",
        approvedForReuse: true,
        reviewStatus: "approved",
      },
    });
    await prisma.demandBankSection.create({
      data: {
        demandBankDocumentId: fallbackDocumentId,
        sectionType: "liability",
        heading: "Liability",
        originalText: "Liability section text",
        redactedText: "Defendant created the collision by failing to yield.",
        approvedForReuse: true,
        qualityScore: 88,
      },
    });

    const preferred = await getFirmDemandPatterns({
      firmId,
      narrativeType: "treatment_summary",
      limit: 2,
    });
    assert.equal(preferred.length, 1, "Expected only the preferred treatment pattern to be returned.");
    assert.equal(preferred[0]?.sourceDocumentId, preferredDocumentId);
    assert.equal(preferred[0]?.sectionType, "treatment_summary");

    const promptBlock = buildFirmDemandPatternsPromptBlock(preferred);
    assert(promptBlock.includes("Same-firm approved drafting patterns"));
    assert(promptBlock.includes("Preferred Demand Example"));
    assert(promptBlock.includes("physical therapy and injections"));

    const fallback = await getFirmDemandPatterns({
      firmId,
      narrativeType: "response_to_offer",
      limit: 1,
    });
    assert.equal(fallback.length, 1, "Expected one fallback approved pattern when no exact section type exists.");
    assert.equal(
      fallback[0]?.sourceDocumentId,
      preferredDocumentId,
      "Expected fallback selection to use the highest-quality approved same-firm pattern."
    );

    console.log("demandFirmPatterns.test.ts passed");
  } finally {
    await prisma.demandBankSection.deleteMany({
      where: {
        demandBankDocumentId: { in: [preferredDocumentId, fallbackDocumentId] },
      },
    }).catch(() => undefined);
    await prisma.demandBankDocument.deleteMany({
      where: {
        id: { in: [preferredDocumentId, fallbackDocumentId] },
      },
    }).catch(() => undefined);
    await prisma.firm.deleteMany({ where: { id: firmId } }).catch(() => undefined);
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
