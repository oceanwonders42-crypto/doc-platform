"use strict";
/**
 * CRM-agnostic export contract: unified shape for case + documents + timeline/summary
 * after document processing is complete. All export destinations consume this bundle.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildExportBundle = buildExportBundle;
const prisma_1 = require("../../db/prisma");
/**
 * Build the shared export bundle from internal case/document/provider data.
 * Use after processing is complete (documents routed to case). Does not modify any data.
 */
async function buildExportBundle(caseId, firmId, options = {}) {
    const { documentIds, includeTimeline = true, includeSummary = false } = options;
    const legalCase = await prisma_1.prisma.legalCase.findFirst({
        where: { id: caseId, firmId },
        select: { id: true, title: true, caseNumber: true, clientName: true },
    });
    if (!legalCase)
        return null;
    const docWhere = {
        firmId,
        routedCaseId: caseId,
    };
    if (documentIds != null && documentIds.length > 0) {
        docWhere.id = { in: documentIds };
    }
    const docs = await prisma_1.prisma.document.findMany({
        where: docWhere,
        select: { id: true, spacesKey: true, originalName: true, mimeType: true },
    });
    const documents = docs
        .filter((d) => d.spacesKey)
        .map((d) => ({
        id: d.id,
        storageKey: d.spacesKey,
        originalName: d.originalName,
        mimeType: d.mimeType ?? "application/octet-stream",
    }));
    let timelineText = null;
    if (includeTimeline) {
        const events = await prisma_1.prisma.caseTimelineEvent.findMany({
            where: { caseId, firmId },
            orderBy: [{ eventDate: "asc" }, { createdAt: "asc" }],
            select: {
                eventDate: true,
                eventType: true,
                track: true,
                provider: true,
                diagnosis: true,
                procedure: true,
                amount: true,
            },
        });
        const formatDate = (d) => {
            if (!d)
                return "";
            try {
                return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
            }
            catch {
                return "";
            }
        };
        const lines = events.map((e) => `${formatDate(e.eventDate)}\t${e.eventType || e.track || "Event"}\t${e.provider ?? ""}\t${e.diagnosis ?? ""}\t${e.procedure ?? ""}\t${e.amount ?? ""}`);
        timelineText = "Date\tType\tProvider\tDiagnosis\tProcedure\tAmount\n" + lines.join("\n");
    }
    let summaryText = null;
    if (includeSummary) {
        const summary = await prisma_1.prisma.caseSummary.findUnique({
            where: { firmId_caseId: { firmId, caseId } },
            select: { body: true },
        });
        summaryText = summary?.body ?? "No summary generated yet.";
    }
    return {
        firmId,
        caseId,
        case: {
            title: legalCase.title,
            caseNumber: legalCase.caseNumber,
            clientName: legalCase.clientName,
        },
        documents,
        timelineText,
        summaryText,
        exportedAt: new Date().toISOString(),
    };
}
