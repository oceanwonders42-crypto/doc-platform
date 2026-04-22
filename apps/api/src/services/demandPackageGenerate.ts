/**
 * Generate demand package: assemble section drafts from case data, build PDF, upload, create Document.
 */
import { prisma } from "../db/prisma";
import { putObject } from "./storage";
import { buildDemandPackagePdf } from "./demandPackagePdf";
import { createNotification } from "./notifications";
import { logActivity } from "./activityFeed";
import { logSystemError } from "./errorLog";
import { buildDocumentStorageKey } from "./documentStorageKeys";
import { getMonthlyDemandUsage, recordGeneratedDemandOutput } from "./usageMetering";
import { getDemandMonthlyCap } from "./planPolicy";
import crypto from "crypto";

const SECTION_KEYS = ["summary", "liability", "treatment", "damages", "future_care", "settlement"] as const;

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

function formatDate(d: Date | null): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return "—";
  }
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
    const [legalCase, timelineEvents, financial, summary, caseDocs] = await Promise.all([
      prisma.legalCase.findFirst({ where: { id: caseId, firmId }, select: { clientName: true, caseNumber: true, title: true } }),
      prisma.caseTimelineEvent.findMany({
        where: { caseId, firmId },
        orderBy: [{ eventDate: "asc" }, { createdAt: "asc" }],
        select: { id: true, eventDate: true, eventType: true, provider: true, diagnosis: true, procedure: true, amount: true },
      }),
      prisma.caseFinancial.findFirst({ where: { caseId, firmId } }),
      prisma.caseSummary.findFirst({ where: { firmId, caseId }, select: { body: true } }),
      prisma.document.findMany({
        where: { firmId, routedCaseId: caseId },
        select: { id: true, originalName: true },
      }),
    ]);

    const caseLabel = [legalCase?.clientName, legalCase?.caseNumber, legalCase?.title].filter(Boolean).join(" · ") || "Case";

    // Build deterministic section drafts from available data (only if section is empty)
    const summaryDraft = pkg.summaryText?.trim() || summary?.body?.trim() || `Case summary for ${caseLabel}.`;
    const liabilityDraft = pkg.liabilityText?.trim() || "Liability analysis to be completed.";
    const treatmentDraft =
      pkg.treatmentText?.trim() ||
      (timelineEvents.length > 0
        ? timelineEvents
            .map(
              (e) =>
                `${formatDate(e.eventDate)} — ${e.eventType || "Treatment"}${e.provider ? ` (${e.provider})` : ""}${e.diagnosis ? `: ${e.diagnosis}` : ""}${e.procedure ? `; ${e.procedure}` : ""}${e.amount ? ` — $${e.amount}` : ""}`
            )
            .join("\n\n")
        : "Treatment chronology to be completed.");
    const damagesParts = financial
      ? [
          financial.medicalBillsTotal != null && financial.medicalBillsTotal > 0 ? `Medical bills: $${financial.medicalBillsTotal.toLocaleString()}` : null,
          financial.liensTotal != null && financial.liensTotal > 0 ? `Liens: $${financial.liensTotal.toLocaleString()}` : null,
          financial.settlementOffer != null ? `Settlement offer: $${financial.settlementOffer.toLocaleString()}` : null,
        ].filter(Boolean)
      : [];
    const damagesDraft =
      pkg.damagesText?.trim() || (damagesParts.length > 0 ? damagesParts.join("\n") : "Damages to be itemized.");
    const futureCareDraft = pkg.futureCareText?.trim() || "Future care and treatment needs to be outlined.";
    const settlementDraft = pkg.settlementText?.trim() || (financial?.settlementOffer != null ? `Settlement demand to be stated. Current offer: $${financial.settlementOffer.toLocaleString()}.` : "Settlement demand to be stated.");

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

    // Create section sources
    await prisma.demandPackageSectionSource.deleteMany({ where: { demandPackageId: packageId } });
    if (summary?.body) {
      await prisma.demandPackageSectionSource.create({
        data: { firmId, demandPackageId: packageId, sectionKey: "summary", sourceType: "summary", sourceMeta: {} },
      });
    }
    for (const e of timelineEvents.slice(0, 50)) {
      await prisma.demandPackageSectionSource.create({
        data: { firmId, demandPackageId: packageId, sectionKey: "treatment", timelineEventId: e.id, sourceType: "timeline", sourceMeta: {} },
      });
    }
    if (financial) {
      await prisma.demandPackageSectionSource.create({
        data: { firmId, demandPackageId: packageId, sectionKey: "damages", sourceType: "financial", sourceMeta: {} },
      });
    }
    for (const d of caseDocs.slice(0, 30)) {
      await prisma.demandPackageSectionSource.create({
        data: { firmId, demandPackageId: packageId, sectionKey: "summary", documentId: d.id, sourceType: "document", sourceMeta: { name: d.originalName } },
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
      appendixDocuments: caseDocs.map((d) => ({ name: d.originalName || d.id })),
    });

    const documentId = crypto.randomUUID();
    const key = buildDocumentStorageKey({
      firmId,
      caseId,
      documentId,
      originalName: `${pkg.title.replace(/[^\w\s-]/g, "")}-demand-package.pdf`,
    });
    await putObject(key, pdfBuffer, "application/pdf");
    const fileSha256 = crypto.createHash("sha256").update(pdfBuffer).digest("hex");
    const doc = await prisma.document.create({
      data: {
        id: documentId,
        firmId,
        source: "demand_package",
        spacesKey: key,
        originalName: `${pkg.title.replace(/[^\w\s-]/g, "")}-demand-package.pdf`,
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
      "Demand package awaiting internal review",
      `Demand package "${pkg.title}" has been generated and is blocked pending internal developer approval.`,
      { caseId, demandPackageId: packageId, status: "pending_dev_review" }
    ).catch(() => {});
    logActivity({
      firmId,
      caseId,
      type: "demand_package_generated",
      title: "Demand package generated for internal review",
      meta: { demandPackageId: packageId, documentId: doc.id, title: pkg.title, status: "pending_dev_review" },
    });

    return { ok: true, documentId: doc.id };
  } catch (e: any) {
    if (e instanceof DemandCapExceededError) {
      return {
        ok: false,
        error: e.payload.error,
        message: e.payload.message,
      };
    }

    const errMsg = e?.message ?? String(e);
    await prisma.demandPackage.update({
      where: { id: packageId, firmId },
      data: { status: "failed" },
    }).catch(() => {});
    await logSystemError("api", errMsg, (e as Error)?.stack).catch(() => {});
    return { ok: false, error: errMsg };
  }
}
