"use strict";
/**
 * Orchestrates building and pushing case intelligence messages to the firm's CRM.
 * Gated by crm_push feature flag. Logs to CrmPushLog only (no case state).
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.pushCrmWebhook = pushCrmWebhook;
exports.pushCaseIntelligenceToCrm = pushCaseIntelligenceToCrm;
const prisma_1 = require("../../db/prisma");
const pg_1 = require("../../db/pg");
const featureFlags_1 = require("../../services/featureFlags");
const messageBuilder_1 = require("./messageBuilder");
const webhookAdapter_1 = __importDefault(require("./webhookAdapter"));
const crmAdapter_1 = require("./crmAdapter");
async function pushCrmWebhook(params) {
    const { firmId, caseId, documentId, title, bodyMarkdown, meta = {} } = params;
    const enabled = await (0, featureFlags_1.hasFeature)(firmId, "crm_push");
    if (!enabled)
        return { ok: true };
    const actionType = meta.actionType ?? "webhook_push";
    const msg = {
        firmId,
        caseId,
        title,
        bodyMarkdown,
        meta: { ...meta, documentId: documentId ?? undefined },
    };
    const firm = await prisma_1.prisma.firm.findUnique({
        where: { id: firmId },
        select: { settings: true },
    });
    const settings = (firm?.settings ?? {});
    const provider = settings.crm === "clio" ? "clio" : "generic_webhook";
    let result;
    if (provider === "clio") {
        result = await (0, crmAdapter_1.pushCaseUpdate)({
            firmId,
            caseId,
            title,
            bodyMarkdown,
            meta,
        });
    }
    else {
        result = await webhookAdapter_1.default.pushNote(msg);
    }
    await prisma_1.prisma.crmPushLog.create({
        data: {
            firmId,
            caseId,
            documentId: documentId ?? null,
            actionType,
            provider,
            ok: result.ok,
            externalId: result.externalId ?? null,
            error: result.error ?? null,
        },
    });
    if (!result.ok) {
        console.warn("[crm] push failed:", { firmId, caseId, actionType, provider, error: result.error });
    }
    return result.ok ? { ok: true } : { ok: false, error: result.error };
}
async function getRecognitionForDocument(documentId) {
    const { rows } = await pg_1.pgPool.query(`select summary, match_reason, match_confidence, doc_type, risks, insights
     from document_recognition where document_id = $1`, [documentId]);
    const r = rows[0];
    if (!r)
        return {};
    const summaryPayload = r.summary != null
        ? typeof r.summary === "object"
            ? r.summary
            : (() => {
                try {
                    return JSON.parse(String(r.summary));
                }
                catch {
                    return null;
                }
            })()
        : null;
    const risks = Array.isArray(r.risks) ? r.risks : r.risks?.risks ?? [];
    const insights = Array.isArray(r.insights) ? r.insights : r.insights?.insights ?? [];
    return {
        summary: summaryPayload?.summary ?? null,
        keyFacts: summaryPayload?.keyFacts ?? [],
        matchReason: r.match_reason ?? null,
        matchConfidence: r.match_confidence != null ? Number(r.match_confidence) : null,
        docType: r.doc_type ?? null,
        risks,
        insights,
    };
}
async function getTimelineSummary(caseId, firmId) {
    const events = await prisma_1.prisma.caseTimelineEvent.findMany({
        where: { caseId, firmId },
        orderBy: [{ eventDate: "asc" }, { createdAt: "asc" }],
        take: 50,
        select: { eventDate: true, eventType: true, track: true, diagnosis: true, procedure: true, amount: true },
    });
    if (events.length === 0)
        return "No timeline events.";
    const lines = events.map((e) => {
        const d = e.eventDate ? new Date(e.eventDate).toISOString().slice(0, 10) : "—";
        const parts = [d, e.track, e.eventType ?? "", e.diagnosis ?? "", e.procedure ?? "", e.amount ?? ""].filter(Boolean);
        return parts.join(" · ");
    });
    return lines.join("\n");
}
async function getSourceDocuments(caseId, firmId, limit = 20) {
    const docs = await prisma_1.prisma.document.findMany({
        where: { routedCaseId: caseId, firmId },
        orderBy: { createdAt: "desc" },
        take: limit,
        select: { id: true, originalName: true },
    });
    return docs.map((d) => ({ id: d.id, fileName: d.originalName }));
}
/**
 * Build message payload and push to CRM. If crm_push is disabled, does nothing and returns.
 * On push (success or failure), logs to CrmPushLog.
 */
async function pushCaseIntelligenceToCrm(params) {
    const { firmId, caseId, actionType, documentId, narrativeExcerpt } = params;
    const enabled = await (0, featureFlags_1.hasFeature)(firmId, "crm_push");
    if (!enabled)
        return;
    let summary = null;
    let keyFacts = [];
    let matchReason = null;
    let confidence = null;
    let docType = null;
    let risks = [];
    let insights = [];
    let documentFileName = null;
    if (documentId) {
        const doc = await prisma_1.prisma.document.findFirst({
            where: { id: documentId, firmId },
            select: { originalName: true },
        });
        documentFileName = doc?.originalName ?? null;
        const rec = await getRecognitionForDocument(documentId);
        summary = rec.summary ?? null;
        keyFacts = rec.keyFacts ?? [];
        matchReason = rec.matchReason ?? null;
        confidence = rec.matchConfidence ?? null;
        docType = rec.docType ?? null;
        risks = rec.risks ?? [];
        insights = rec.insights ?? [];
    }
    const timelineSummary = await getTimelineSummary(caseId, firmId);
    const sourceDocuments = await getSourceDocuments(caseId, firmId);
    const { title, bodyMarkdown } = (0, messageBuilder_1.buildCaseIntelligenceMessage)({
        caseId,
        actionType,
        documentId: documentId ?? null,
        documentFileName,
        summary,
        keyFacts,
        matchReason,
        confidence,
        docType,
        risks,
        insights,
        timelineSummary,
        narrativeExcerpt: narrativeExcerpt ?? null,
        sourceDocuments,
    });
    await pushCrmWebhook({
        firmId,
        caseId,
        documentId: documentId ?? null,
        title,
        bodyMarkdown,
        meta: { actionType, documentId: documentId ?? undefined },
    });
}
