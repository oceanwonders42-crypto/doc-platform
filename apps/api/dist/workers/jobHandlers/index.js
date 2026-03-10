"use strict";
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
exports.getJobHandler = getJobHandler;
exports.getRegisteredJobTypes = getRegisteredJobTypes;
/**
 * Job handlers by type. Each handler receives payload + context and runs the long-running work.
 */
const queue_1 = require("../../services/queue");
const prisma_1 = require("../../db/prisma");
const audit_1 = require("../../services/audit");
const caseTimeline_1 = require("../../services/caseTimeline");
const pushService_1 = require("../../integrations/crm/pushService");
const export_1 = require("../../services/export");
const demandPackageGenerate_1 = require("../../services/demandPackageGenerate");
const recordsRequestSend_1 = require("../../services/recordsRequestSend");
const thumbnail_1 = require("../../services/thumbnail");
const storage_1 = require("../../services/storage");
const handlers = new Map();
handlers.set("retention_cleanup", async (_payload, ctx) => {
    const { runRetentionCleanup } = await Promise.resolve().then(() => __importStar(require("../../services/retentionCleanup")));
    await ctx.addEvent("info", "Starting retention cleanup");
    await runRetentionCleanup();
    await ctx.addEvent("info", "Retention cleanup complete");
});
handlers.set("overdue_task_reminders", async (_payload, ctx) => {
    const { runOverdueTaskReminders } = await Promise.resolve().then(() => __importStar(require("../../services/overdueTaskReminders")));
    await ctx.addEvent("info", "Starting overdue task reminders");
    await runOverdueTaskReminders();
    await ctx.addEvent("info", "Overdue task reminders complete");
});
handlers.set("webhook_delivery", async (payload, ctx) => {
    const { deliverWebhook } = await Promise.resolve().then(() => __importStar(require("../../services/webhooks")));
    const p = payload;
    if (!p?.url || !p?.secret || !p?.event)
        throw new Error("Invalid webhook_delivery payload");
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
    const documentId = payload.documentId;
    const firmId = payload.firmId;
    const mode = payload.mode || "full";
    if (!documentId || !firmId)
        throw new Error("documentId and firmId required");
    const doc = await prisma_1.prisma.document.findFirst({
        where: { id: documentId, firmId },
        select: { id: true, duplicateOfId: true },
    });
    if (!doc)
        throw new Error("Document not found");
    if (doc.duplicateOfId)
        throw new Error("Cannot reprocess a duplicate document");
    if (mode === "full" || mode === "ocr") {
        await prisma_1.prisma.document.update({
            where: { id: documentId },
            data: { status: "PROCESSING", processingStage: "uploaded" },
        });
        await (0, queue_1.enqueueOcrJob)({ documentId, firmId });
        await ctx.addEvent("info", "Queued OCR job", { mode });
    }
    else {
        const { rows } = await (await Promise.resolve().then(() => __importStar(require("../../db/pg")))).pgPool.query(`select document_id, text_excerpt, doc_type from document_recognition where document_id = $1`, [documentId]);
        if (!rows[0]?.text_excerpt || !rows[0]?.doc_type) {
            throw new Error("Run recognition or OCR first; document has no text_excerpt or doc_type");
        }
        await prisma_1.prisma.document.update({
            where: { id: documentId },
            data: { status: "PROCESSING", processingStage: "extraction" },
        });
        await (0, queue_1.enqueueExtractionJob)({ documentId, firmId });
        await ctx.addEvent("info", "Queued extraction job", { mode });
    }
    await (0, audit_1.addDocumentAuditEvent)({
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
    const caseId = payload.caseId;
    const firmId = payload.firmId;
    if (!caseId || !firmId)
        throw new Error("caseId and firmId required");
    await ctx.addEvent("info", "Starting timeline rebuild");
    await (0, caseTimeline_1.rebuildCaseTimeline)(caseId, firmId);
    (0, pushService_1.pushCaseIntelligenceToCrm)({ firmId, caseId, actionType: "timeline_rebuilt" }).catch(() => { });
    await ctx.addEvent("info", "Timeline rebuild complete");
});
// records_request.send — payload: { recordsRequestId, firmId, channel, destination }
handlers.set("records_request.send", async (payload, ctx) => {
    const recordsRequestId = payload.recordsRequestId;
    const firmId = payload.firmId;
    const channel = payload.channel || "email";
    const destination = payload.destination || "";
    if (!recordsRequestId || !firmId || !destination) {
        throw new Error("recordsRequestId, firmId, and destination required");
    }
    if (!["email", "fax"].includes(channel))
        throw new Error("channel must be email or fax");
    await ctx.addEvent("info", "Sending records request", { channel, destination });
    const result = await (0, recordsRequestSend_1.sendRecordsRequest)({
        recordsRequestId,
        firmId,
        channel,
        destination,
    });
    if (!result.ok)
        throw new Error(result.error);
    await ctx.addEvent("info", result.message);
});
// demand_package.generate — payload: { demandPackageId, firmId }
handlers.set("demand_package.generate", async (payload, ctx) => {
    const demandPackageId = payload.demandPackageId;
    const firmId = payload.firmId;
    if (!demandPackageId || !firmId)
        throw new Error("demandPackageId and firmId required");
    await ctx.addEvent("info", "Generating demand package");
    const result = await (0, demandPackageGenerate_1.generateDemandPackage)(demandPackageId, firmId);
    if (!result.ok)
        throw new Error(result.error);
    await ctx.addEvent("info", "Demand package generated", { documentId: result.documentId });
});
// export.packet — payload: { caseId, firmId, documentIds?, includeTimeline?, includeSummary?, destinations?, emailTo?, emailSubject?, cloudPathPrefix? }
// Uses shared export layer; destinations default to ["download_bundle"] for backward compatibility.
handlers.set("export.packet", async (payload, ctx) => {
    const caseId = payload.caseId;
    const firmId = payload.firmId;
    const documentIds = Array.isArray(payload.documentIds)
        ? payload.documentIds.filter(Boolean)
        : undefined;
    const includeTimeline = payload.includeTimeline === true;
    const includeSummary = payload.includeSummary === true;
    const packetType = payload.packetType || "combined";
    const kinds = ["download_bundle", "cloud_folder", "cloud_drive", "email_packet", "crm"];
    const destinationsRaw = payload.destinations;
    const destinations = Array.isArray(destinationsRaw) && destinationsRaw.length > 0
        ? destinationsRaw.filter((d) => kinds.includes(d))
        : ["download_bundle"];
    if (!caseId || !firmId)
        throw new Error("caseId and firmId required");
    await ctx.addEvent("info", "Running export", { destinations });
    const result = await (0, export_1.runExport)({
        caseId,
        firmId,
        destinations,
        documentIds,
        includeTimeline,
        includeSummary,
        packetType,
        options: {
            emailTo: payload.emailTo,
            emailSubject: payload.emailSubject,
            cloudPathPrefix: payload.cloudPathPrefix,
            cloudDrivePathPrefix: payload.cloudDrivePathPrefix,
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
        }
        else {
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
    const documentId = payload.documentId;
    const firmId = payload.firmId;
    if (!documentId || !firmId)
        throw new Error("documentId and firmId required");
    const doc = await prisma_1.prisma.document.findFirst({
        where: { id: documentId, firmId },
        select: { spacesKey: true, mimeType: true, originalName: true },
    });
    if (!doc)
        throw new Error("Document not found");
    const isPdf = doc.mimeType === "application/pdf" ||
        (doc.originalName || "").toLowerCase().endsWith(".pdf");
    if (!isPdf) {
        await ctx.addEvent("info", "Skipped: not a PDF");
        return;
    }
    const buf = await (0, storage_1.getObjectBuffer)(doc.spacesKey);
    await ctx.addEvent("info", "Generating thumbnail");
    const thumbKey = await (0, thumbnail_1.generateAndStoreDocumentThumbnail)(documentId, firmId, buf);
    if (thumbKey) {
        await prisma_1.prisma.document.update({
            where: { id: documentId },
            data: { thumbnailKey: thumbKey },
        });
        await ctx.addEvent("info", "Thumbnail saved", { key: thumbKey });
    }
    else {
        await ctx.addEvent("warn", "Thumbnail generation returned no key");
    }
});
function getJobHandler(type) {
    return handlers.get(type) ?? null;
}
function getRegisteredJobTypes() {
    return Array.from(handlers.keys());
}
