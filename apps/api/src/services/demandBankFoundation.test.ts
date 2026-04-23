import "dotenv/config";

import assert from "node:assert/strict";

import { prisma } from "../db/prisma";
import { buildDemandDraftContext, buildDemandDraftExamplesPromptBlock } from "./demandDraftContext";
import { retrieveDemandBankMatches } from "./demandBankRetrieval";

async function main() {
  const suffix = Date.now();
  const firmId = `demand-bank-firm-${suffix}`;
  const caseId = `demand-bank-case-${suffix}`;
  const approvedDemandId = `demand-bank-approved-${suffix}`;
  const blockedDemandId = `demand-bank-blocked-${suffix}`;
  const pendingDemandId = `demand-bank-pending-${suffix}`;

  await prisma.firm.create({
    data: {
      id: firmId,
      name: "Demand Bank Test Firm",
      features: ["demand_narratives"],
    },
  });

  await prisma.legalCase.create({
    data: {
      id: caseId,
      firmId,
      title: "Rear-end collision matter",
      caseNumber: `DB-${suffix}`,
      clientName: "Test Client",
      status: "open",
      notes: "Rear-end crash with lumbar disc injury, MRI, and pain management injections.",
    },
  });

  await prisma.caseSummary.create({
    data: {
      firmId,
      caseId,
      body: "Client sustained cervical and lumbar injuries after a rear-end collision. Treatment included MRI imaging and pain management injections.",
    },
  });

  await prisma.caseFinancial.create({
    data: {
      firmId,
      caseId,
      medicalBillsTotal: 18450,
      liensTotal: 0,
      settlementOffer: 25000,
    },
  });

  await prisma.caseTimelineEvent.createMany({
    data: [
      {
        id: `timeline-one-${suffix}`,
        firmId,
        caseId,
        eventType: "initial_visit",
        track: "medical",
        provider: "Urgent Care",
        diagnosis: "Lumbar disc herniation",
        procedure: "Evaluation",
        documentId: `timeline-doc-one-${suffix}`,
      },
      {
        id: `timeline-two-${suffix}`,
        firmId,
        caseId,
        eventType: "pain_management",
        track: "medical",
        provider: "Pain Management",
        diagnosis: "Radiculopathy",
        procedure: "Epidural injection",
        documentId: `timeline-doc-two-${suffix}`,
      },
    ],
  });

  await prisma.demandBankDocument.create({
    data: {
      id: approvedDemandId,
      firmId,
      title: "Approved rear-end demand",
      summary: "Rear-end collision demand with MRI and injection treatment.",
      originalText: "Original approved demand text.",
      redactedText: "Approved reusable rear-end example with [AMOUNT] and [DATE].",
      jurisdiction: "Florida",
      caseType: "auto_collision",
      liabilityType: "rear_end_collision",
      injuryTags: ["disc injury", "pain syndrome"],
      treatmentTags: ["imaging", "injection", "pain management"],
      bodyPartTags: ["back", "neck"],
      mriPresent: true,
      injectionsPresent: true,
      surgeryPresent: false,
      totalBillsAmount: 18000,
      templateFamily: "pre_suit_demand",
      toneStyle: "assertive",
      qualityScore: 5,
      approvedForReuse: true,
      blockedForReuse: false,
      reviewStatus: "approved",
      reviewedAt: new Date(),
      sections: {
        create: [
          {
            sectionType: "liability",
            heading: "LIABILITY",
            originalText: "Original liability section.",
            redactedText: "Reusable liability section.",
            qualityScore: 5,
            approvedForReuse: true,
          },
          {
            sectionType: "treatment_chronology",
            heading: "TREATMENT CHRONOLOGY",
            originalText: "Original treatment chronology.",
            redactedText: "Reusable treatment chronology with MRI and injections.",
            qualityScore: 4,
            approvedForReuse: true,
          },
        ],
      },
    },
  });

  await prisma.demandBankDocument.create({
    data: {
      id: blockedDemandId,
      firmId,
      title: "Blocked matching demand",
      summary: "Should never be returned.",
      originalText: "Blocked original text.",
      redactedText: "Blocked reusable text.",
      jurisdiction: "Florida",
      caseType: "auto_collision",
      liabilityType: "rear_end_collision",
      injuryTags: ["disc injury"],
      treatmentTags: ["imaging"],
      bodyPartTags: ["back"],
      mriPresent: true,
      totalBillsAmount: 22000,
      templateFamily: "pre_suit_demand",
      approvedForReuse: false,
      blockedForReuse: true,
      reviewStatus: "blocked",
    },
  });

  await prisma.demandBankDocument.create({
    data: {
      id: pendingDemandId,
      firmId,
      title: "Pending matching demand",
      summary: "Also should never be returned.",
      originalText: "Pending original text.",
      redactedText: "Pending reusable text.",
      jurisdiction: "Florida",
      caseType: "auto_collision",
      liabilityType: "rear_end_collision",
      injuryTags: ["disc injury"],
      treatmentTags: ["imaging"],
      bodyPartTags: ["back"],
      mriPresent: true,
      totalBillsAmount: 19000,
      templateFamily: "pre_suit_demand",
      approvedForReuse: false,
      blockedForReuse: false,
      reviewStatus: "pending",
    },
  });

  const retrieval = await retrieveDemandBankMatches({
    firmId,
    matterId: caseId,
    runType: "manual_retrieval_test",
    profile: {
      jurisdiction: "Florida",
      caseType: "auto_collision",
      liabilityType: "rear_end_collision",
      injuryTags: ["disc injury"],
      treatmentTags: ["imaging", "injection"],
      bodyPartTags: ["back"],
      mriPresent: true,
      injectionsPresent: true,
      billsBand: "medium",
      templateFamily: "pre_suit_demand",
      freeText: "Rear-end demand with MRI and injections",
    },
    createdBy: "test-suite",
  });

  assert.ok(retrieval.documents.some((item) => item.id === approvedDemandId));
  assert.ok(!retrieval.documents.some((item) => item.id === blockedDemandId));
  assert.ok(!retrieval.documents.some((item) => item.id === pendingDemandId));
  assert.ok(retrieval.sections.every((section) => section.demandBankDocumentId !== blockedDemandId));

  const context = await buildDemandDraftContext({
    caseId,
    firmId,
    template: {
      narrativeType: "demand_rationale",
      tone: "assertive",
      templateFamilyPreference: "pre_suit_demand",
    },
    createdBy: "test-suite",
    model: "gpt-4o-mini",
    promptVersion: "test-context-v1",
  });

  assert.equal(context.currentCase.caseId, caseId);
  assert.equal(context.rules.currentCaseFactsAreSourceOfTruth, true);
  assert.equal(context.rules.priorDemandsAreExamplesOnly, true);
  assert.ok(context.retrievedExamples.every((item) => item.exampleOnly === true));
  assert.ok(context.retrievedSections.every((item) => item.exampleOnly === true));
  assert.ok(context.retrievedExamples.some((item) => item.id === approvedDemandId));
  assert.ok(!context.retrievedExamples.some((item) => item.id === blockedDemandId));

  const promptBlock = buildDemandDraftExamplesPromptBlock(context);
  assert.ok(promptBlock.includes("style and structure only"));
  assert.ok(promptBlock.includes("must never be treated as facts"));

  console.log("demandBankFoundation tests passed");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    const suffixPrefix = "demand-bank-";
    await prisma.demandBankRun.deleteMany({
      where: { firmId: { startsWith: suffixPrefix } },
    }).catch(() => {});
    await prisma.demandBankDocument.deleteMany({
      where: { firmId: { startsWith: suffixPrefix } },
    }).catch(() => {});
    await prisma.caseTimelineEvent.deleteMany({
      where: { firmId: { startsWith: suffixPrefix } },
    }).catch(() => {});
    await prisma.caseFinancial.deleteMany({
      where: { firmId: { startsWith: suffixPrefix } },
    }).catch(() => {});
    await prisma.caseSummary.deleteMany({
      where: { firmId: { startsWith: suffixPrefix } },
    }).catch(() => {});
    await prisma.legalCase.deleteMany({
      where: { firmId: { startsWith: suffixPrefix } },
    }).catch(() => {});
    await prisma.firm.deleteMany({
      where: { id: { startsWith: suffixPrefix } },
    }).catch(() => {});
    await prisma.$disconnect().catch(() => {});
  });
