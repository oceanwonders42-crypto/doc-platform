/**
 * Generate demand package: assemble section drafts from case data, build PDF, upload, create Document.
 */
import crypto from "crypto";

import { generateNarrative, type NarrativeResult } from "../ai/narrativeAssistant";
import { prisma } from "../db/prisma";
import { logActivity } from "./activityFeed";
import { buildDocumentStorageKey } from "./documentStorageKeys";
import { buildDemandPackagePdf } from "./demandPackagePdf";
import { logSystemError } from "./errorLog";
import { createNotification } from "./notifications";
import { getDemandMonthlyCap } from "./planPolicy";
import { putObject } from "./storage";
import { getMonthlyDemandUsage, recordGeneratedDemandOutput } from "./usageMetering";

type DemandPackageGenerationResult =
  | { ok: true; documentId: string }
  | { ok: false; error: string; message?: string };

class DemandCapExceededError extends Error {
  readonly payload: { error: "DEMAND_CAP_EXCEEDED"; message: string };

  constructor(message = "Monthly demand limit reached for this plan") {
    super(message);
    this.name = "DemandCapExceededError";
    this.payload = {
      error: "DEMAND_CAP_EXCEEDED",
      message,
    };
  }
}

function formatDate(value: Date | null): string {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "-";
  }
}

function isUsableGeneratedNarrative(text: string | null | undefined): boolean {
  if (typeof text !== "string") return false;
  const trimmed = text.trim();
  return trimmed.length > 0 && !trimmed.startsWith("[Error");
}

async function buildAiDemandSections(input: {
  caseId: string;
  firmId: string;
}): Promise<{
  summary: NarrativeResult | null;
  liability: NarrativeResult | null;
  treatment: NarrativeResult | null;
  settlement: NarrativeResult | null;
}> {
  if (!process.env.OPENAI_API_KEY) {
    return {
      summary: null,
      liability: null,
      treatment: null,
      settlement: null,
    };
  }

  const [summary, liability, treatment, settlement] = await Promise.all([
    generateNarrative({
      caseId: input.caseId,
      firmId: input.firmId,
      type: "injury_summary",
      tone: "neutral",
    }),
    generateNarrative({
      caseId: input.caseId,
      firmId: input.firmId,
      type: "liability",
      tone: "assertive",
    }),
    generateNarrative({
      caseId: input.caseId,
      firmId: input.firmId,
      type: "treatment_summary",
      tone: "neutral",
    }),
    generateNarrative({
      caseId: input.caseId,
      firmId: input.firmId,
      type: "demand_rationale",
      tone: "assertive",
    }),
  ]);

  return {
    summary,
    liability,
    treatment,
    settlement,
  };
}

function collectAiWarnings(sectionResults: Array<NarrativeResult | null>): string[] {
  return sectionResults
    .flatMap((result) => result?.warnings ?? [])
    .filter((warning, index, list) => Boolean(warning) && list.indexOf(warning) === index);
}

export async function generateDemandPackage(
  packageId: string,
  firmId: string
): Promise<DemandPackageGenerationResult> {
  const pkg = await prisma.demandPackage.findFirst({
    where: { id: packageId, firmId },
    include: { case: true },
  });
  if (!pkg) return { ok: false, error: "Demand package not found" };

  try {
    if (pkg.generatedAt == null) {
      const firm = await prisma.firm.findUnique({
        where: { id: firmId },
        select: { plan: true },
      });
      if (!firm) {
        return { ok: false, error: "Firm not found" };
      }

      const cap = getDemandMonthlyCap(firm.plan);
      if (cap != null) {
        const usage = await getMonthlyDemandUsage(firmId);
        if (usage.demandCount >= cap) {
          throw new DemandCapExceededError();
        }
      }
    }

    await prisma.demandPackage.update({
      where: { id: packageId, firmId },
      data: { status: "generating" },
    });

    const caseId = pkg.caseId;
    const [legalCase, timelineEvents, financial, summary, caseDocs, aiSections] =
      await Promise.all([
        prisma.legalCase.findFirst({
          where: { id: caseId, firmId },
          select: { clientName: true, caseNumber: true, title: true },
        }),
        prisma.caseTimelineEvent.findMany({
          where: { caseId, firmId },
          orderBy: [{ eventDate: "asc" }, { createdAt: "asc" }],
          select: {
            id: true,
            eventDate: true,
            eventType: true,
            provider: true,
            diagnosis: true,
            procedure: true,
            amount: true,
          },
        }),
        prisma.caseFinancial.findFirst({ where: { caseId, firmId } }),
        prisma.caseSummary.findFirst({
          where: { firmId, caseId },
          select: { body: true },
        }),
        prisma.document.findMany({
          where: { firmId, routedCaseId: caseId },
          select: { id: true, originalName: true },
        }),
        buildAiDemandSections({ caseId, firmId }),
      ]);

    const aiWarnings = collectAiWarnings([
      aiSections.summary,
      aiSections.liability,
      aiSections.treatment,
      aiSections.settlement,
    ]);
    const caseLabel =
      [legalCase?.clientName, legalCase?.caseNumber, legalCase?.title]
        .filter(Boolean)
        .join(" | ") || "Case";

    const summaryDraft =
      pkg.summaryText?.trim() ||
      (isUsableGeneratedNarrative(aiSections.summary?.text)
        ? aiSections.summary?.text.trim()
        : null) ||
      summary?.body?.trim() ||
      `Case summary for ${caseLabel}.`;
    const liabilityDraft =
      pkg.liabilityText?.trim() ||
      (isUsableGeneratedNarrative(aiSections.liability?.text)
        ? aiSections.liability?.text.trim()
        : null) ||
      "Liability analysis to be completed.";
    const treatmentDraft =
      pkg.treatmentText?.trim() ||
      (isUsableGeneratedNarrative(aiSections.treatment?.text)
        ? aiSections.treatment?.text.trim()
        : null) ||
      (timelineEvents.length > 0
        ? timelineEvents
            .map((event) => {
              return [
                formatDate(event.eventDate),
                event.eventType || "Treatment",
                event.provider ? `(${event.provider})` : null,
                event.diagnosis ? `Dx: ${event.diagnosis}` : null,
                event.procedure ? `Procedure: ${event.procedure}` : null,
                event.amount ? `$${event.amount}` : null,
              ]
                .filter(Boolean)
                .join(" ");
            })
            .join("\n\n")
        : "Treatment chronology to be completed.");
    const damagesParts = financial
      ? [
          financial.medicalBillsTotal != null && financial.medicalBillsTotal > 0
            ? `Medical bills: $${financial.medicalBillsTotal.toLocaleString()}`
            : null,
          financial.liensTotal != null && financial.liensTotal > 0
            ? `Liens: $${financial.liensTotal.toLocaleString()}`
            : null,
          financial.settlementOffer != null
            ? `Settlement offer: $${financial.settlementOffer.toLocaleString()}`
            : null,
        ].filter(Boolean)
      : [];
    const damagesDraft =
      pkg.damagesText?.trim() ||
      (damagesParts.length > 0
        ? damagesParts.join("\n")
        : "Damages to be itemized.");
    const futureCareDraft =
      pkg.futureCareText?.trim() ||
      "Future care and treatment needs to be outlined.";
    const settlementDraft =
      pkg.settlementText?.trim() ||
      (isUsableGeneratedNarrative(aiSections.settlement?.text)
        ? aiSections.settlement?.text.trim()
        : null) ||
      (financial?.settlementOffer != null
        ? `Settlement demand to be stated. Current offer: $${financial.settlementOffer.toLocaleString()}.`
        : "Settlement demand to be stated.");

    await prisma.demandPackage.update({
      where: { id: packageId, firmId },
      data: {
        summaryText: summaryDraft,
        liabilityText: liabilityDraft,
        treatmentText: treatmentDraft,
        damagesText: damagesDraft,
        futureCareText: futureCareDraft,
        settlementText: settlementDraft,
      },
    });

    await prisma.demandPackageSectionSource.deleteMany({
      where: { demandPackageId: packageId },
    });
    if (summary?.body) {
      await prisma.demandPackageSectionSource.create({
        data: {
          firmId,
          demandPackageId: packageId,
          sectionKey: "summary",
          sourceType: "summary",
          sourceMeta: {},
        },
      });
    }
    for (const event of timelineEvents.slice(0, 50)) {
      await prisma.demandPackageSectionSource.create({
        data: {
          firmId,
          demandPackageId: packageId,
          sectionKey: "treatment",
          timelineEventId: event.id,
          sourceType: "timeline",
          sourceMeta: {},
        },
      });
    }
    if (financial) {
      await prisma.demandPackageSectionSource.create({
        data: {
          firmId,
          demandPackageId: packageId,
          sectionKey: "damages",
          sourceType: "financial",
          sourceMeta: {},
        },
      });
    }
    for (const doc of caseDocs.slice(0, 30)) {
      await prisma.demandPackageSectionSource.create({
        data: {
          firmId,
          demandPackageId: packageId,
          sectionKey: "summary",
          documentId: doc.id,
          sourceType: "document",
          sourceMeta: { name: doc.originalName },
        },
      });
    }

    const aiSectionSourceEntries = [
      {
        key: "summary",
        result: aiSections.summary,
        narrativeType: "injury_summary",
      },
      {
        key: "liability",
        result: aiSections.liability,
        narrativeType: "liability",
      },
      {
        key: "treatment",
        result: aiSections.treatment,
        narrativeType: "treatment_summary",
      },
      {
        key: "settlement",
        result: aiSections.settlement,
        narrativeType: "demand_rationale",
      },
    ];
    for (const entry of aiSectionSourceEntries) {
      if (!entry.result || !isUsableGeneratedNarrative(entry.result.text)) continue;
      await prisma.demandPackageSectionSource.create({
        data: {
          firmId,
          demandPackageId: packageId,
          sectionKey: entry.key,
          sourceType: "narrative_generation",
          sourceMeta: {
            narrativeType: entry.narrativeType,
            retrievalRunId: entry.result.retrievalRunId ?? null,
            warnings: entry.result.warnings ?? [],
          },
        },
      });
    }

    const generatedDate = new Date();
    const pdfBuffer = await buildDemandPackagePdf({
      title: pkg.title,
      caseLabel,
      generatedDate,
      summaryText: summaryDraft,
      liabilityText: liabilityDraft,
      treatmentText: treatmentDraft,
      damagesText: damagesDraft,
      futureCareText: futureCareDraft,
      settlementText: settlementDraft,
      appendixDocuments: caseDocs.map((doc) => ({
        name: doc.originalName || doc.id,
      })),
    });

    const documentId = crypto.randomUUID();
    const fileName = `${pkg.title.replace(/[^\w\s-]/g, "")}-demand-package.pdf`;
    const key = buildDocumentStorageKey({
      firmId,
      caseId,
      documentId,
      originalName: fileName,
    });
    await putObject(key, pdfBuffer, "application/pdf");
    const fileSha256 = crypto
      .createHash("sha256")
      .update(pdfBuffer)
      .digest("hex");
    const doc = await prisma.document.create({
      data: {
        id: documentId,
        firmId,
        source: "demand_package",
        spacesKey: key,
        originalName: fileName,
        mimeType: "application/pdf",
        pageCount: 0,
        status: "UPLOADED",
        processingStage: "complete",
        file_sha256: fileSha256,
        fileSizeBytes: pdfBuffer.length,
        processedAt: generatedDate,
        routedCaseId: caseId,
      },
    });

    await recordGeneratedDemandOutput({
      demandPackageId: packageId,
      firmId,
      generatedDocId: doc.id,
      generatedAt: generatedDate,
      status: "pending_dev_review",
    });

    createNotification(
      firmId,
      "demand_package_ready",
      "Demand package ready for review",
      `Demand package "${pkg.title}" has been generated and is ready for attorney or firm-admin review.`,
      { caseId, demandPackageId: packageId, status: "pending_dev_review" }
    ).catch(() => {});
    logActivity({
      firmId,
      caseId,
      type: "demand_package_generated",
      title: "Demand package generated for review",
      meta: {
        demandPackageId: packageId,
        documentId: doc.id,
        title: pkg.title,
        status: "pending_dev_review",
        aiWarnings,
        aiSectionsUsed: aiSectionSourceEntries
          .filter(
            (entry) =>
              entry.result &&
              isUsableGeneratedNarrative(entry.result.text)
          )
          .map((entry) => entry.narrativeType),
      },
    });

    return { ok: true, documentId: doc.id };
  } catch (error: any) {
    if (error instanceof DemandCapExceededError) {
      return {
        ok: false,
        error: error.payload.error,
        message: error.payload.message,
      };
    }

    const errMsg = error?.message ?? String(error);
    await prisma.demandPackage
      .update({
        where: { id: packageId, firmId },
        data: { status: "failed" },
      })
      .catch(() => {});
    await logSystemError("api", errMsg, (error as Error)?.stack).catch(() => {});
    return { ok: false, error: errMsg };
  }
}
