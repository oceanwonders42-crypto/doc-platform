/**
 * Orchestrates building and pushing case intelligence messages to the firm's CRM.
 * Gated by crm_push feature flag. Logs to CrmPushLog only (no case state).
 */

import { prisma } from "../../db/prisma";
import { pgPool } from "../../db/pg";
import { hasFeature } from "../../services/featureFlags";
import {
  buildCaseIntelligenceMessage,
  type CaseIntelligenceActionType,
} from "./messageBuilder";
import type { CrmPushMessage } from "./index";
import webhookAdapter from "./webhookAdapter";

/** Generic webhook push: POST payload to firm's CRM webhook URL and log to CrmPushLog. Gated by crm_push. */
export type PushCrmWebhookParams = {
  firmId: string;
  caseId: string;
  documentId?: string | null;
  title: string;
  bodyMarkdown: string;
  meta?: Record<string, unknown>;
};

export async function pushCrmWebhook(params: PushCrmWebhookParams): Promise<{ ok: boolean; error?: string }> {
  const { firmId, caseId, documentId, title, bodyMarkdown, meta = {} } = params;
  const enabled = await hasFeature(firmId, "crm_push");
  if (!enabled) return { ok: true };

  const msg: CrmPushMessage = {
    firmId,
    caseId,
    title,
    bodyMarkdown,
    meta: { ...meta, documentId: documentId ?? undefined },
  };

  const result = await webhookAdapter.pushNote(msg);
  const actionType = (meta.actionType as string) ?? "webhook_push";

  await prisma.crmPushLog.create({
    data: {
      firmId,
      caseId,
      documentId: documentId ?? null,
      actionType,
      provider: "generic_webhook",
      ok: result.ok,
      externalId: result.externalId ?? null,
      error: result.error ?? null,
    },
  });

  if (!result.ok) {
    console.warn("[crm] push failed:", { firmId, caseId, actionType, error: result.error });
  }
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

export type PushCaseIntelligenceParams = {
  firmId: string;
  caseId: string;
  actionType: CaseIntelligenceActionType;
  documentId?: string | null;
  narrativeExcerpt?: string | null;
};

async function getRecognitionForDocument(documentId: string): Promise<{
  summary?: string | null;
  keyFacts?: string[];
  matchReason?: string | null;
  matchConfidence?: number | null;
  docType?: string | null;
  risks?: Array<{ type: string; severity?: string }>;
  insights?: Array<{ type: string; severity?: string }>;
}> {
  const { rows } = await pgPool.query(
    `select summary, match_reason, match_confidence, doc_type, risks, insights
     from document_recognition where document_id = $1`,
    [documentId]
  );
  const r = rows[0];
  if (!r) return {};

  const summaryPayload =
    r.summary != null
      ? typeof r.summary === "object"
        ? (r.summary as { summary?: string; keyFacts?: string[] })
        : (() => {
            try {
              return JSON.parse(String(r.summary)) as { summary?: string; keyFacts?: string[] };
            } catch {
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

async function getTimelineSummary(caseId: string, firmId: string): Promise<string> {
  const events = await prisma.caseTimelineEvent.findMany({
    where: { caseId, firmId },
    orderBy: [{ eventDate: "asc" }, { createdAt: "asc" }],
    take: 50,
    select: { eventDate: true, eventType: true, track: true, diagnosis: true, procedure: true, amount: true },
  });
  if (events.length === 0) return "No timeline events.";
  const lines = events.map((e) => {
    const d = e.eventDate ? new Date(e.eventDate).toISOString().slice(0, 10) : "—";
    const parts = [d, e.track, e.eventType ?? "", e.diagnosis ?? "", e.procedure ?? "", e.amount ?? ""].filter(Boolean);
    return parts.join(" · ");
  });
  return lines.join("\n");
}

async function getSourceDocuments(caseId: string, firmId: string, limit = 20): Promise<Array<{ id: string; fileName?: string | null }>> {
  const docs = await prisma.document.findMany({
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
export async function pushCaseIntelligenceToCrm(params: PushCaseIntelligenceParams): Promise<void> {
  const { firmId, caseId, actionType, documentId, narrativeExcerpt } = params;

  const enabled = await hasFeature(firmId, "crm_push");
  if (!enabled) return;

  let summary: string | null = null;
  let keyFacts: string[] = [];
  let matchReason: string | null = null;
  let confidence: number | null = null;
  let docType: string | null = null;
  let risks: Array<{ type: string; severity?: string }> = [];
  let insights: Array<{ type: string; severity?: string }> = [];
  let documentFileName: string | null = null;

  if (documentId) {
    const doc = await prisma.document.findFirst({
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

  const { title, bodyMarkdown } = buildCaseIntelligenceMessage({
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
