"use strict";
/**
 * CRM-agnostic export contract: unified shape for case + documents + timeline/summary
 * after document processing is complete. All export destinations consume this bundle.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildExportBundle = buildExportBundle;
const prisma_1 = require("../../db/prisma");
const pg_1 = require("../../db/pg");
/** Doc types that belong in a "bills" packet (billing, EOB, ledger). */
const BILL_DOC_TYPES = new Set([
    "medical_bill",
    "ledger_statement",
    "billing_statement",
    "eob",
    "insurance_eob",
]);
/**
 * Build the shared export bundle from internal case/document/provider data.
 * Use after processing is complete (documents routed to case). Does not modify any data.
 */
async function buildExportBundle(caseId, firmId, options = {}) {
    const { documentIds, includeTimeline = true, includeSummary = false, useNamingRules = true, packetType = "combined" } = options;
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
        select: { id: true, spacesKey: true, originalName: true, mimeType: true, metaJson: true, extractedFields: true },
    });
    let docsToUse = docs;
    if (packetType !== "combined" && docs.length > 0) {
        const docIds = docs.map((d) => d.id);
        const { rows } = await pg_1.pgPool.query(`select document_id, doc_type from document_recognition where document_id = any($1)`, [docIds]);
        const docTypeByDocId = new Map(rows.map((r) => [r.document_id, (r.doc_type ?? "").toLowerCase().trim()]));
        if (packetType === "bills") {
            docsToUse = docs.filter((d) => BILL_DOC_TYPES.has(docTypeByDocId.get(d.id) ?? ""));
        }
        else {
            docsToUse = docs.filter((d) => !BILL_DOC_TYPES.has(docTypeByDocId.get(d.id) ?? ""));
        }
    }
    const documents = [];
    const exportedAt = new Date().toISOString();
    if (useNamingRules) {
        const { getFirmExportNamingRules, getRecognitionForDocument, buildDocumentNamingContext, applyFilePattern, applyFolderPattern, getFolderForDocType, } = await Promise.resolve().then(() => __importStar(require("./namingRules")));
        const rules = await getFirmExportNamingRules(firmId);
        const caseData = {
            caseNumber: legalCase.caseNumber,
            clientName: legalCase.clientName,
            title: legalCase.title,
        };
        const caseCtx = buildDocumentNamingContext(caseData, { id: "", originalName: null }, null, exportedAt);
        const caseLevelFolder = rules ? applyFolderPattern(rules, caseCtx) : "";
        for (const d of docsToUse) {
            if (!d.spacesKey)
                continue;
            const recognition = await getRecognitionForDocument(d.id);
            const growthPrimary = d.extractedFields?.growthExtraction != null &&
                typeof d.extractedFields.growthExtraction === "object"
                ? d.extractedFields.growthExtraction?.serviceDates?.primaryServiceDate ?? undefined
                : undefined;
            const ctx = buildDocumentNamingContext(caseData, d, recognition, exportedAt, growthPrimary);
            let exportFileName;
            let exportFolderPath;
            const meta = (d.metaJson ?? {});
            const folderOverride = meta.exportFolderPathOverride != null ? String(meta.exportFolderPathOverride).trim() || null : null;
            const nameOverride = meta.exportFileNameOverride != null ? String(meta.exportFileNameOverride).trim() || null : null;
            if (nameOverride) {
                const ext = (d.originalName ?? "").split(".").pop()?.toLowerCase() || "bin";
                exportFileName = nameOverride.includes(".") ? nameOverride : `${nameOverride}.${ext}`;
            }
            else {
                const base = rules ? applyFilePattern(rules, ctx) : null;
                const ext = (d.originalName ?? "").split(".").pop()?.toLowerCase() || "bin";
                exportFileName = base ? `${base}.${ext}` : null;
            }
            if (folderOverride !== null) {
                exportFolderPath = folderOverride;
            }
            else {
                const docTypeFolder = rules ? getFolderForDocType(rules, ctx.documentType) : "";
                exportFolderPath = [caseLevelFolder, docTypeFolder].filter(Boolean).join("/") || null;
            }
            documents.push({
                id: d.id,
                storageKey: d.spacesKey,
                originalName: d.originalName,
                mimeType: d.mimeType ?? "application/octet-stream",
                exportFileName: exportFileName ?? undefined,
                exportFolderPath: exportFolderPath ?? undefined,
            });
        }
    }
    else {
        for (const d of docsToUse) {
            if (!d.spacesKey)
                continue;
            documents.push({
                id: d.id,
                storageKey: d.spacesKey,
                originalName: d.originalName,
                mimeType: d.mimeType ?? "application/octet-stream",
            });
        }
    }
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
        exportedAt,
    };
}
