import "dotenv/config";

import { Role } from "@prisma/client";

process.env.ENABLE_INLINE_DOCUMENT_WORKER = "false";

import { prisma } from "../../db/prisma";
import { pgPool } from "../../db/pg";
import { signToken } from "../../lib/jwt";
import { app } from "../server";
import { assert, startTestServer, stopTestServer } from "./cases.batchClioRouteTestUtils";

async function main() {
  const originalOpenAiKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;

  const suffix = Date.now();
  const firmId = `demand-preview-firm-${suffix}`;
  const caseId = `demand-preview-case-${suffix}`;
  const requesterUserId = `demand-preview-requester-${suffix}`;
  const reviewerUserId = `demand-preview-reviewer-${suffix}`;
  const approvedDemandId = `demand-preview-approved-${suffix}`;
  const blockedDemandId = `demand-preview-blocked-${suffix}`;
  const approvedSectionId = `demand-preview-approved-section-${suffix}`;
  const blockedSectionId = `demand-preview-blocked-section-${suffix}`;

  await prisma.firm.create({
    data: {
      id: firmId,
      name: "Demand Preview Test Firm",
      features: ["demand_narratives"],
    },
  });

  await prisma.user.createMany({
    data: [
      {
        id: requesterUserId,
        firmId,
        email: "preview-requester@example.com",
        role: Role.PARALEGAL,
      },
      {
        id: reviewerUserId,
        firmId,
        email: "preview-reviewer@example.com",
        role: Role.PLATFORM_ADMIN,
      },
    ],
  });

  await prisma.legalCase.create({
    data: {
      id: caseId,
      firmId,
      title: "Demand Preview Matter",
      caseNumber: `DP-${suffix}`,
      clientName: "Parker Preview",
      status: "open",
      assignedUserId: requesterUserId,
      notes: "Florida rear-end collision with cervical pain, MRI, and injection treatment.",
    },
  });

  await prisma.caseSummary.create({
    data: {
      id: `demand-preview-summary-${suffix}`,
      firmId,
      caseId,
      body: "Florida rear-end auto accident. Cervical strain with neck pain. MRI confirmed disc injury and pain management injection treatment. Settlement demand remains pre-suit.",
    },
  });

  await prisma.caseFinancial.create({
    data: {
      id: `demand-preview-financial-${suffix}`,
      firmId,
      caseId,
      medicalBillsTotal: 22500,
    },
  });

  await prisma.demandBankDocument.create({
    data: {
      id: approvedDemandId,
      firmId,
      matterId: null,
      sourceDocumentId: null,
      title: "Approved cervical collision demand",
      fileName: "approved-demand.txt",
      originalText: "SETTLEMENT DEMAND\nTREATMENT CHRONOLOGY\nFlorida rear-end collision with cervical MRI findings and injection treatment.",
      redactedText: "SETTLEMENT DEMAND\nTREATMENT CHRONOLOGY\nFlorida rear-end collision with cervical MRI findings and injection treatment.",
      summary: "Approved Florida cervical demand.",
      jurisdiction: "Florida",
      caseType: "auto_collision",
      liabilityType: "rear_end_collision",
      injuryTags: ["strain/sprain", "disc injury"],
      treatmentTags: ["imaging", "injection", "pain management"],
      bodyPartTags: ["neck"],
      mriPresent: true,
      injectionsPresent: true,
      surgeryPresent: false,
      totalBillsAmount: 24000,
      demandAmount: 125000,
      templateFamily: "pre_suit_demand",
      toneStyle: "assertive",
      qualityScore: 8,
      approvedForReuse: true,
      blockedForReuse: false,
      reviewStatus: "approved",
    },
  });

  await prisma.demandBankSection.create({
    data: {
      id: approvedSectionId,
      demandBankDocumentId: approvedDemandId,
      sectionType: "treatment_chronology",
      heading: "TREATMENT CHRONOLOGY",
      originalText: "The client treated with MRI-confirmed cervical findings followed by pain management injections.",
      redactedText: "The client treated with MRI-confirmed cervical findings followed by pain management injections.",
      qualityScore: 7,
      approvedForReuse: true,
    },
  });

  await prisma.demandBankDocument.create({
    data: {
      id: blockedDemandId,
      firmId,
      matterId: null,
      sourceDocumentId: null,
      title: "Blocked cervical collision demand",
      fileName: "blocked-demand.txt",
      originalText: "Blocked demand content",
      redactedText: "Blocked demand content",
      summary: "Blocked Florida cervical demand.",
      jurisdiction: "Florida",
      caseType: "auto_collision",
      liabilityType: "rear_end_collision",
      injuryTags: ["strain/sprain", "disc injury"],
      treatmentTags: ["imaging", "injection", "pain management"],
      bodyPartTags: ["neck"],
      mriPresent: true,
      injectionsPresent: true,
      surgeryPresent: false,
      totalBillsAmount: 21000,
      demandAmount: 110000,
      templateFamily: "pre_suit_demand",
      toneStyle: "assertive",
      qualityScore: 9,
      approvedForReuse: false,
      blockedForReuse: true,
      reviewStatus: "blocked",
    },
  });

  await prisma.demandBankSection.create({
    data: {
      id: blockedSectionId,
      demandBankDocumentId: blockedDemandId,
      sectionType: "treatment_chronology",
      heading: "BLOCKED TREATMENT CHRONOLOGY",
      originalText: "Blocked section content",
      redactedText: "Blocked section content",
      qualityScore: 9,
      approvedForReuse: true,
    },
  });

  const requesterToken = signToken({
    userId: requesterUserId,
    firmId,
    role: Role.PARALEGAL,
    email: "preview-requester@example.com",
  });
  const reviewerToken = signToken({
    userId: reviewerUserId,
    firmId,
    role: Role.PLATFORM_ADMIN,
    email: "preview-reviewer@example.com",
  });

  const { baseUrl, server } = await startTestServer(app);

  try {
    const generateResponse = await fetch(`${baseUrl}/cases/${caseId}/narrative`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${requesterToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: "demand_rationale",
        tone: "assertive",
      }),
    });
    assert(generateResponse.status === 200, `Expected generate route to return 200, got ${generateResponse.status}`);

    const storedDraft = await prisma.demandNarrativeDraft.findFirst({
      where: { firmId, caseId },
      orderBy: { createdAt: "desc" },
    });
    assert(storedDraft != null, "Expected demand narrative draft to exist.");
    assert(storedDraft!.demandBankRunId != null, "Expected demand narrative draft to store a retrieval run id.");

    const requesterPreviewResponse = await fetch(
      `${baseUrl}/cases/${caseId}/demand-narratives/${storedDraft!.id}/retrieval-preview`,
      {
        headers: {
          Authorization: `Bearer ${requesterToken}`,
        },
      }
    );
    assert(requesterPreviewResponse.status === 404, `Expected requester preview before release to return 404, got ${requesterPreviewResponse.status}`);

    const reviewerPreviewResponse = await fetch(
      `${baseUrl}/cases/${caseId}/demand-narratives/${storedDraft!.id}/retrieval-preview`,
      {
        headers: {
          Authorization: `Bearer ${reviewerToken}`,
        },
      }
    );
    assert(reviewerPreviewResponse.status === 200, `Expected reviewer preview route to return 200, got ${reviewerPreviewResponse.status}`);
    const reviewerPreviewJson = (await reviewerPreviewResponse.json()) as {
      ok?: boolean;
      preview?: {
        available?: boolean;
        runId?: string | null;
        retrievedExamples?: Array<{ id: string; matchSignals?: Array<{ label?: string }> }>;
        retrievedSections?: Array<{ id: string; feedback?: { removed?: boolean } }>;
      };
    };
    assert(reviewerPreviewJson.ok === true, "Expected reviewer preview route to succeed.");
    assert(reviewerPreviewJson.preview?.available === true, "Expected retrieval preview to be available.");
    assert(reviewerPreviewJson.preview?.runId === storedDraft!.demandBankRunId, "Expected preview to use the stored retrieval run.");
    assert(
      Boolean(reviewerPreviewJson.preview?.retrievedExamples?.some((item) => item.id === approvedDemandId)),
      "Expected approved demand example to appear in retrieval preview."
    );
    assert(
      !reviewerPreviewJson.preview?.retrievedExamples?.some((item) => item.id === blockedDemandId),
      "Blocked demand example should never appear in retrieval preview."
    );
    assert(
      Boolean(
        reviewerPreviewJson.preview?.retrievedExamples
          ?.find((item) => item.id === approvedDemandId)
          ?.matchSignals?.some((signal) => signal.label === "MRI")
      ),
      "Expected retrieval preview to expose structured match signals."
    );
    assert(
      Boolean(reviewerPreviewJson.preview?.retrievedSections?.some((item) => item.id === approvedSectionId)),
      "Expected approved retrieved section to appear in preview."
    );
    assert(
      !reviewerPreviewJson.preview?.retrievedSections?.some((item) => item.id === blockedSectionId),
      "Blocked retrieved section should never appear in preview."
    );

    const usefulFeedbackResponse = await fetch(
      `${baseUrl}/cases/${caseId}/demand-narratives/${storedDraft!.id}/retrieval-feedback`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${reviewerToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          itemType: "document",
          itemId: approvedDemandId,
          usefulness: "useful",
        }),
      }
    );
    assert(usefulFeedbackResponse.status === 200, `Expected useful feedback route to return 200, got ${usefulFeedbackResponse.status}`);

    const removeSectionResponse = await fetch(
      `${baseUrl}/cases/${caseId}/demand-narratives/${storedDraft!.id}/retrieval-feedback`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${reviewerToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          itemType: "section",
          itemId: approvedSectionId,
          removed: true,
        }),
      }
    );
    assert(removeSectionResponse.status === 200, `Expected remove section route to return 200, got ${removeSectionResponse.status}`);
    const removeSectionJson = (await removeSectionResponse.json()) as {
      preview?: {
        retrievedExamples?: Array<{ id: string; feedback?: { usefulness?: string | null } }>;
        retrievedSections?: Array<{ id: string; feedback?: { removed?: boolean } }>;
      };
    };
    assert(
      removeSectionJson.preview?.retrievedExamples?.find((item) => item.id === approvedDemandId)?.feedback?.usefulness === "useful",
      "Expected demand example usefulness feedback to persist in preview response."
    );
    assert(
      removeSectionJson.preview?.retrievedSections?.find((item) => item.id === approvedSectionId)?.feedback?.removed === true,
      "Expected section removal feedback to persist in preview response."
    );

    const storedRun = await prisma.demandBankRun.findUnique({
      where: { id: storedDraft!.demandBankRunId! },
      select: { retrievalReasoning: true },
    });
    const storedReasoning = storedRun?.retrievalReasoning as
      | {
          reviewerFeedback?: {
            documents?: Record<string, { usefulness?: string | null }>;
            sections?: Record<string, { removed?: boolean }>;
          };
        }
      | null;
    assert(
      storedReasoning?.reviewerFeedback?.documents?.[approvedDemandId]?.usefulness === "useful",
      "Expected document usefulness feedback to persist in demand bank run reasoning."
    );
    assert(
      storedReasoning?.reviewerFeedback?.sections?.[approvedSectionId]?.removed === true,
      "Expected section removal feedback to persist in demand bank run reasoning."
    );

    console.log("Demand narrative retrieval preview tests passed");
  } finally {
    if (originalOpenAiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalOpenAiKey;
    }

    await stopTestServer(server);
    await prisma.demandNarrativeDraft.deleteMany({ where: { firmId, caseId } }).catch(() => {});
    await prisma.demandBankRun.deleteMany({ where: { firmId, matterId: caseId } }).catch(() => {});
    await prisma.caseFinancial.deleteMany({ where: { firmId, caseId } }).catch(() => {});
    await prisma.caseSummary.deleteMany({ where: { firmId, caseId } }).catch(() => {});
    await prisma.demandBankSection.deleteMany({ where: { demandBankDocumentId: { in: [approvedDemandId, blockedDemandId] } } }).catch(() => {});
    await prisma.demandBankDocument.deleteMany({ where: { firmId, id: { in: [approvedDemandId, blockedDemandId] } } }).catch(() => {});
    await prisma.notification.deleteMany({ where: { firmId } }).catch(() => {});
    await prisma.legalCase.deleteMany({ where: { id: caseId } }).catch(() => {});
    await prisma.user.deleteMany({ where: { firmId, id: { in: [requesterUserId, reviewerUserId] } } }).catch(() => {});
    await prisma.firm.deleteMany({ where: { id: firmId } }).catch(() => {});
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    const exitCode = process.exitCode ?? 0;
    await Promise.race([
      Promise.allSettled([prisma.$disconnect(), pgPool.end()]),
      new Promise((resolve) => setTimeout(resolve, 1000)),
    ]);
    process.exit(exitCode);
  });
