/**
 * Job handlers by type. Each handler receives payload + context and runs the long-running work.
 */
import { enqueueOcrJob, enqueueExtractionJob } from "../../services/queue";
import { prisma } from "../../db/prisma";
import { addDocumentAuditEvent } from "../../services/audit";
import { rebuildCaseTimeline } from "../../services/caseTimeline";
import { pushCaseIntelligenceToCrm } from "../../integrations/crm/pushService";
import { runExport } from "../../services/export";
import type { ExportDestinationKind } from "../../services/export";
import { generateDemandPackage } from "../../services/demandPackageGenerate";
import { sendRecordsRequest } from "../../services/recordsRequestSend";
import { generateAndStoreDocumentThumbnail } from "../../services/thumbnail";
import { getObjectBuffer } from "../../services/storage";

export type JobHandlerContext = {
  jobId: string;
  firmId: string | null;
  addEvent: (level: "info" | "warn" | "error", message: string, meta?: Record<string, unknown>) => Promise<void>;
};

export type JobHandler = (
  payload: Record<string, unknown>,
  ctx: JobHandlerContext
) => Promise<void>;

const handlers = new Map<string, JobHandler>();

handlers.set("retention_cleanup", async (_payload, ctx) => {
  const { runRetentionCleanup } = await import("../../services/retentionCleanup");
  await ctx.addEvent("info", "Starting retention cleanup");
  await runRetentionCleanup();
  await ctx.addEvent("info", "Retention cleanup complete");
});
handlers.set("overdue_task_reminders", async (_payload, ctx) => {
  const { runOverdueTaskReminders } = await import("../../services/overdueTaskReminders");
  await ctx.addEvent("info", "Starting overdue task reminders");
  await runOverdueTaskReminders();
  await ctx.addEvent("info", "Overdue task reminders complete");
});
handlers.set("webhook_delivery", async (payload, ctx) => {
  const { deliverWebhook } = await import("../../services/webhooks");
  const p = payload as {
    webhookEndpointId?: string;
    url?: string;
    secret?: string;
    event?: string;
    data?: Record<string, unknown>;
    timestamp?: string;
  };
  if (!p?.url || !p?.secret || !p?.event) throw new Error("Invalid webhook_delivery payload");
  await ctx.addEvent("info", "Delivering webhook", { event: p.event });
  await deliverWebhook({
    webhookEndpointId: p.webhookEndpointId ?? "",
    url: p.url,
    secret: p.secret,
    event: p.event,
    data: p.data ?? {},
    timestamp: p.timestamp ?? new Date().toISOString(),
  });
  await ctx.addEvent("info", "Webhook delivered");
});

// document.reprocess — payload: { documentId, firmId, mode: "full" | "ocr" | "extraction" }
handlers.set("document.reprocess", async (payload, ctx) => {
  const documentId = payload.documentId as string;
  const firmId = payload.firmId as string;
  const mode = (payload.mode as "full" | "ocr" | "extraction") || "full";
  if (!documentId || !firmId) throw new Error("documentId and firmId required");

  const doc = await prisma.document.findFirst({
    where: { id: documentId, firmId },
    select: { id: true, duplicateOfId: true },
  });
  if (!doc) throw new Error("Document not found");
  if (doc.duplicateOfId) throw new Error("Cannot reprocess a duplicate document");

  if (mode === "full" || mode === "ocr") {
    await prisma.document.update({
      where: { id: documentId },
      data: { status: "PROCESSING", processingStage: "uploaded" },
    });
    await enqueueOcrJob({ documentId, firmId });
    await ctx.addEvent("info", "Queued OCR job", { mode });
  } else {
    const { rows } = await (await import("../../db/pg")).pgPool.query(
      `select document_id, text_excerpt, doc_type from document_recognition where document_id = $1`,
      [documentId]
    );
    if (!rows[0]?.text_excerpt || !rows[0]?.doc_type) {
      throw new Error("Run recognition or OCR first; document has no text_excerpt or doc_type");
    }
    await prisma.document.update({
      where: { id: documentId },
      data: { status: "PROCESSING", processingStage: "extraction" },
    });
    await enqueueExtractionJob({ documentId, firmId });
    await ctx.addEvent("info", "Queued extraction job", { mode });
  }
  await addDocumentAuditEvent({
    firmId,
    documentId,
    actor: "system",
    action: "reprocess",
    fromCaseId: null,
    toCaseId: null,
    metaJson: { mode, jobId: ctx.jobId },
  });
});

// timeline.rebuild — payload: { caseId, firmId }
handlers.set("timeline.rebuild", async (payload, ctx) => {
  const caseId = payload.caseId as string;
  const firmId = payload.firmId as string;
  if (!caseId || !firmId) throw new Error("caseId and firmId required");
  await ctx.addEvent("info", "Starting timeline rebuild");
  await rebuildCaseTimeline(caseId, firmId);
  pushCaseIntelligenceToCrm({ firmId, caseId, actionType: "timeline_rebuilt" }).catch(() => {});
  await ctx.addEvent("info", "Timeline rebuild complete");
});

// records_request.send — payload: { recordsRequestId, firmId, channel, destination }
handlers.set("records_request.send", async (payload, ctx) => {
  const recordsRequestId = payload.recordsRequestId as string;
  const firmId = payload.firmId as string;
  const channel = (payload.channel as "email" | "fax") || "email";
  const destination = (payload.destination as string) || "";
  if (!recordsRequestId || !firmId || !destination) {
    throw new Error("recordsRequestId, firmId, and destination required");
  }
  if (!["email", "fax"].includes(channel)) throw new Error("channel must be email or fax");
  await ctx.addEvent("info", "Sending records request", { channel, destination });
  const result = await sendRecordsRequest({
    recordsRequestId,
    firmId,
    channel,
    destination,
  });
  if (!result.ok) throw new Error(result.error);
  await ctx.addEvent("info", result.message);
});

// demand_package.generate — payload: { demandPackageId, firmId }
handlers.set("demand_package.generate", async (payload, ctx) => {
  const demandPackageId = payload.demandPackageId as string;
  const firmId = payload.firmId as string;
  if (!demandPackageId || !firmId) throw new Error("demandPackageId and firmId required");
  await ctx.addEvent("info", "Generating demand package");
  const result = await generateDemandPackage(demandPackageId, firmId);
  if (!result.ok) throw new Error(result.error);
  await ctx.addEvent("info", "Demand package generated", { documentId: result.documentId });
});

// export.packet — payload: { caseId, firmId, documentIds?, includeTimeline?, includeSummary?, destinations?, emailTo?, emailSubject?, cloudPathPrefix? }
// Uses shared export layer; destinations default to ["download_bundle"] for backward compatibility.
handlers.set("export.packet", async (payload, ctx) => {
  const caseId = payload.caseId as string;
  const firmId = payload.firmId as string;
  const documentIds = Array.isArray(payload.documentIds)
    ? (payload.documentIds as string[]).filter(Boolean)
    : undefined;
  const includeTimeline = payload.includeTimeline === true;
  const includeSummary = payload.includeSummary === true;
  const packetType = (payload.packetType as "records" | "bills" | "combined") || "combined";
  const kinds: ExportDestinationKind[] = ["download_bundle", "cloud_folder", "cloud_drive", "email_packet", "crm"];
  const destinationsRaw = payload.destinations;
  const destinations: ExportDestinationKind[] =
    Array.isArray(destinationsRaw) && destinationsRaw.length > 0
      ? (destinationsRaw as string[]).filter((d): d is ExportDestinationKind => kinds.includes(d as ExportDestinationKind))
      : ["download_bundle"];

  if (!caseId || !firmId) throw new Error("caseId and firmId required");

  await ctx.addEvent("info", "Running export", { destinations });
  const result = await runExport({
    caseId,
    firmId,
    destinations,
    documentIds,
    includeTimeline,
    includeSummary,
    packetType,
    options: {
      emailTo: payload.emailTo as string | undefined,
      emailSubject: payload.emailSubject as string | undefined,
      cloudPathPrefix: payload.cloudPathPrefix as string | undefined,
      cloudDrivePathPrefix: payload.cloudDrivePathPrefix as string | undefined,
    },
  });

  if (!result.bundle) {
    throw new Error(result.error ?? "Case not found");
  }

  for (const r of result.results) {
    if (r.ok) {
      await ctx.addEvent("info", `Export ${r.kind} complete`, {
        kind: r.kind,
        storageKey: r.storageKey,
        fileName: r.fileName,
        externalId: r.externalId,
        filesWritten: r.filesWritten,
      });
    } else {
      await ctx.addEvent("warn", `Export ${r.kind} failed: ${r.error}`, { kind: r.kind });
    }
  }

  const downloadResult = result.results.find((r) => r.kind === "download_bundle");
  if (downloadResult?.ok && downloadResult.externalId) {
    await ctx.addEvent("info", "Export created", {
      exportId: downloadResult.externalId,
      fileName: downloadResult.fileName,
      key: downloadResult.storageKey,
    });
  }
});

// document.thumbnail.generate — payload: { documentId, firmId }
handlers.set("document.thumbnail.generate", async (payload, ctx) => {
  const documentId = payload.documentId as string;
  const firmId = payload.firmId as string;
  if (!documentId || !firmId) throw new Error("documentId and firmId required");

  const doc = await prisma.document.findFirst({
    where: { id: documentId, firmId },
    select: { spacesKey: true, mimeType: true, originalName: true },
  });
  if (!doc) throw new Error("Document not found");
  const isPdf =
    doc.mimeType === "application/pdf" ||
    (doc.originalName || "").toLowerCase().endsWith(".pdf");
  if (!isPdf) {
    await ctx.addEvent("info", "Skipped: not a PDF");
    return;
  }
  const buf = await getObjectBuffer(doc.spacesKey);
  await ctx.addEvent("info", "Generating thumbnail");
  const thumbKey = await generateAndStoreDocumentThumbnail(documentId, firmId, buf);
  if (thumbKey) {
    await prisma.document.update({
      where: { id: documentId },
      data: { thumbnailKey: thumbKey },
    });
    await ctx.addEvent("info", "Thumbnail saved", { key: thumbKey });
  } else {
    await ctx.addEvent("warn", "Thumbnail generation returned no key");
  }
});

export function getJobHandler(type: string): JobHandler | null {
  return handlers.get(type) ?? null;
}

export function getRegisteredJobTypes(): string[] {
  return Array.from(handlers.keys());
}
