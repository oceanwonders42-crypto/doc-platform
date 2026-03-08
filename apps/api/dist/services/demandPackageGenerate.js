"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateDemandPackage = generateDemandPackage;
/**
 * Generate demand package: assemble section drafts from case data, build PDF, upload, create Document.
 */
const prisma_1 = require("../db/prisma");
const storage_1 = require("./storage");
const demandPackagePdf_1 = require("./demandPackagePdf");
const notifications_1 = require("./notifications");
const activityFeed_1 = require("./activityFeed");
const errorLog_1 = require("./errorLog");
const crypto_1 = __importDefault(require("crypto"));
const SECTION_KEYS = ["summary", "liability", "treatment", "damages", "future_care", "settlement"];
function formatDate(d) {
    if (!d)
        return "—";
    try {
        return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
    }
    catch {
        return "—";
    }
}
async function generateDemandPackage(packageId, firmId) {
    const pkg = await prisma_1.prisma.demandPackage.findFirst({
        where: { id: packageId, firmId },
        include: { case: true },
    });
    if (!pkg)
        return { ok: false, error: "Demand package not found" };
    try {
        await prisma_1.prisma.demandPackage.update({
            where: { id: packageId },
            data: { status: "generating" },
        });
        const caseId = pkg.caseId;
        const [legalCase, timelineEvents, financial, summary, caseDocs] = await Promise.all([
            prisma_1.prisma.legalCase.findFirst({ where: { id: caseId, firmId }, select: { clientName: true, caseNumber: true, title: true } }),
            prisma_1.prisma.caseTimelineEvent.findMany({
                where: { caseId, firmId },
                orderBy: [{ eventDate: "asc" }, { createdAt: "asc" }],
                select: { id: true, eventDate: true, eventType: true, provider: true, diagnosis: true, procedure: true, amount: true },
            }),
            prisma_1.prisma.caseFinancial.findFirst({ where: { caseId, firmId } }),
            prisma_1.prisma.caseSummary.findUnique({ where: { firmId_caseId: { firmId, caseId } }, select: { body: true } }),
            prisma_1.prisma.document.findMany({
                where: { firmId, routedCaseId: caseId },
                select: { id: true, originalName: true },
            }),
        ]);
        const caseLabel = [legalCase?.clientName, legalCase?.caseNumber, legalCase?.title].filter(Boolean).join(" · ") || "Case";
        // Build deterministic section drafts from available data (only if section is empty)
        const summaryDraft = pkg.summaryText?.trim() || summary?.body?.trim() || `Case summary for ${caseLabel}.`;
        const liabilityDraft = pkg.liabilityText?.trim() || "Liability analysis to be completed.";
        const treatmentDraft = pkg.treatmentText?.trim() ||
            (timelineEvents.length > 0
                ? timelineEvents
                    .map((e) => `${formatDate(e.eventDate)} — ${e.eventType || "Treatment"}${e.provider ? ` (${e.provider})` : ""}${e.diagnosis ? `: ${e.diagnosis}` : ""}${e.procedure ? `; ${e.procedure}` : ""}${e.amount ? ` — $${e.amount}` : ""}`)
                    .join("\n\n")
                : "Treatment chronology to be completed.");
        const damagesParts = financial
            ? [
                financial.medicalBillsTotal != null && financial.medicalBillsTotal > 0 ? `Medical bills: $${financial.medicalBillsTotal.toLocaleString()}` : null,
                financial.liensTotal != null && financial.liensTotal > 0 ? `Liens: $${financial.liensTotal.toLocaleString()}` : null,
                financial.settlementOffer != null ? `Settlement offer: $${financial.settlementOffer.toLocaleString()}` : null,
            ].filter(Boolean)
            : [];
        const damagesDraft = pkg.damagesText?.trim() || (damagesParts.length > 0 ? damagesParts.join("\n") : "Damages to be itemized.");
        const futureCareDraft = pkg.futureCareText?.trim() || "Future care and treatment needs to be outlined.";
        const settlementDraft = pkg.settlementText?.trim() || (financial?.settlementOffer != null ? `Settlement demand to be stated. Current offer: $${financial.settlementOffer.toLocaleString()}.` : "Settlement demand to be stated.");
        await prisma_1.prisma.demandPackage.update({
            where: { id: packageId },
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
        await prisma_1.prisma.demandPackageSectionSource.deleteMany({ where: { demandPackageId: packageId } });
        if (summary?.body) {
            await prisma_1.prisma.demandPackageSectionSource.create({
                data: { firmId, demandPackageId: packageId, sectionKey: "summary", sourceType: "summary", sourceMeta: {} },
            });
        }
        for (const e of timelineEvents.slice(0, 50)) {
            await prisma_1.prisma.demandPackageSectionSource.create({
                data: { firmId, demandPackageId: packageId, sectionKey: "treatment", timelineEventId: e.id, sourceType: "timeline", sourceMeta: {} },
            });
        }
        if (financial) {
            await prisma_1.prisma.demandPackageSectionSource.create({
                data: { firmId, demandPackageId: packageId, sectionKey: "damages", sourceType: "financial", sourceMeta: {} },
            });
        }
        for (const d of caseDocs.slice(0, 30)) {
            await prisma_1.prisma.demandPackageSectionSource.create({
                data: { firmId, demandPackageId: packageId, sectionKey: "summary", documentId: d.id, sourceType: "document", sourceMeta: { name: d.originalName } },
            });
        }
        const generatedDate = new Date();
        const pdfBuffer = await (0, demandPackagePdf_1.buildDemandPackagePdf)({
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
        const key = `${firmId}/demand_packages/${packageId}_${Date.now()}.pdf`;
        await (0, storage_1.putObject)(key, pdfBuffer, "application/pdf");
        const fileSha256 = crypto_1.default.createHash("sha256").update(pdfBuffer).digest("hex");
        const doc = await prisma_1.prisma.document.create({
            data: {
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
        await prisma_1.prisma.demandPackage.update({
            where: { id: packageId },
            data: { status: "ready", generatedDocId: doc.id, generatedAt: generatedDate },
        });
        (0, notifications_1.createNotification)(firmId, "demand_package_ready", "Demand package ready", `Demand package "${pkg.title}" has been generated.`, { caseId, demandPackageId: packageId, documentId: doc.id }).catch(() => { });
        (0, activityFeed_1.logActivity)({
            firmId,
            caseId,
            type: "demand_package_generated",
            title: "Demand package generated",
            meta: { demandPackageId: packageId, documentId: doc.id, title: pkg.title },
        });
        return { ok: true, documentId: doc.id };
    }
    catch (e) {
        const errMsg = e?.message ?? String(e);
        await prisma_1.prisma.demandPackage.update({
            where: { id: packageId },
            data: { status: "failed" },
        }).catch(() => { });
        await (0, errorLog_1.logSystemError)("api", errMsg, e?.stack).catch(() => { });
        return { ok: false, error: errMsg };
    }
}
