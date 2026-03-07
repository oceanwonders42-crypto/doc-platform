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
/**
 * Records request automation API.
 * All routes require auth; firmId from token only. No firmId in body.
 */
const express_1 = require("express");
const client_1 = require("@prisma/client");
const prisma_1 = require("../../db/prisma");
const auth_1 = require("../middleware/auth");
const requireRole_1 = require("../middleware/requireRole");
const tenant_1 = require("../../lib/tenant");
const recordsRequestService_1 = require("../../services/recordsRequestService");
const recordsRequestDelivery_1 = require("../../services/recordsRequestDelivery");
const recordsRequestPdf_1 = require("../../services/recordsRequestPdf");
const router = (0, express_1.Router)();
function getCreatedByUserId(req) {
    return req.userId ?? null;
}
// GET /records-requests/dashboard — must be before /:id
router.get("/dashboard", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.STAFF), async (req, res) => {
    const firmId = (0, tenant_1.requireFirmIdFromRequest)(req, res);
    if (!firmId)
        return;
    if (!(0, tenant_1.forbidCrossTenantAccess)(req, res))
        return;
    const where = (0, tenant_1.buildFirmWhere)(firmId);
    const [open, sent, followUpDue, received, failed, completedThisWeek] = await Promise.all([
        prisma_1.prisma.recordsRequest.count({
            where: { ...where, status: { in: ["DRAFT", "SENT", "FOLLOW_UP_DUE"] } },
        }),
        prisma_1.prisma.recordsRequest.count({ where: { ...where, status: "SENT" } }),
        prisma_1.prisma.recordsRequest.count({ where: { ...where, status: "FOLLOW_UP_DUE" } }),
        prisma_1.prisma.recordsRequest.count({ where: { ...where, status: "RECEIVED" } }),
        prisma_1.prisma.recordsRequest.count({ where: { ...where, status: "FAILED" } }),
        prisma_1.prisma.recordsRequest.count({
            where: {
                ...where,
                status: "COMPLETED",
                completedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
            },
        }),
    ]);
    return res.json({
        ok: true,
        dashboard: {
            open,
            sent,
            followUpDue,
            received,
            failed,
            completedThisWeek,
        },
    });
});
// GET /records-requests/templates
router.get("/templates", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.STAFF), async (req, res) => {
    const firmId = (0, tenant_1.requireFirmIdFromRequest)(req, res);
    if (!firmId)
        return;
    if (!(0, tenant_1.forbidCrossTenantAccess)(req, res))
        return;
    const list = await prisma_1.prisma.recordsRequestTemplate.findMany({
        where: (0, tenant_1.buildFirmWhere)(firmId),
        orderBy: { name: "asc" },
    });
    return res.json({ ok: true, templates: list });
});
// POST /records-requests/templates
router.post("/templates", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.STAFF), async (req, res) => {
    const firmId = (0, tenant_1.requireFirmIdFromRequest)(req, res);
    if (!firmId)
        return;
    if (!(0, tenant_1.forbidCrossTenantAccess)(req, res))
        return;
    const body = req.body;
    if (!body.name || typeof body.name !== "string" || !body.name.trim()) {
        return res.status(400).json({ ok: false, error: "name is required" });
    }
    const template = await prisma_1.prisma.recordsRequestTemplate.create({
        data: {
            firmId,
            name: body.name.trim(),
            requestType: body.requestType?.trim() || null,
            subject: body.subject?.trim() || null,
            body: body.body ?? null,
            isDefault: Boolean(body.isDefault),
        },
    });
    return res.status(201).json({ ok: true, template });
});
// PATCH /records-requests/templates/:id
router.patch("/templates/:id", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.STAFF), async (req, res) => {
    const firmId = (0, tenant_1.requireFirmIdFromRequest)(req, res);
    if (!firmId)
        return;
    if (!(0, tenant_1.forbidCrossTenantAccess)(req, res))
        return;
    const id = req.params.id;
    const existing = await prisma_1.prisma.recordsRequestTemplate.findFirst({
        where: (0, tenant_1.buildFirmWhere)(firmId, { id }),
    });
    if (!existing)
        return (0, tenant_1.sendNotFound)(res);
    const body = req.body;
    const template = await prisma_1.prisma.recordsRequestTemplate.update({
        where: { id },
        data: {
            ...(body.name !== undefined && { name: String(body.name).trim() }),
            ...(body.requestType !== undefined && { requestType: body.requestType?.trim() || null }),
            ...(body.subject !== undefined && { subject: body.subject?.trim() || null }),
            ...(body.body !== undefined && { body: body.body ?? null }),
            ...(body.isDefault !== undefined && { isDefault: Boolean(body.isDefault) }),
        },
    });
    return res.json({ ok: true, template });
});
// POST /records-requests — create draft
router.post("/", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.STAFF), async (req, res) => {
    const firmId = (0, tenant_1.requireFirmIdFromRequest)(req, res);
    if (!firmId)
        return;
    if (!(0, tenant_1.forbidCrossTenantAccess)(req, res))
        return;
    const b = req.body;
    const input = {
        firmId,
        caseId: typeof b.caseId === "string" ? b.caseId : "",
        providerId: typeof b.providerId === "string" ? b.providerId : null,
        patientName: typeof b.patientName === "string" ? b.patientName : null,
        patientDob: b.patientDob != null ? (typeof b.patientDob === "string" ? new Date(b.patientDob) : b.patientDob) : null,
        dateOfLoss: b.dateOfLoss != null ? (typeof b.dateOfLoss === "string" ? new Date(b.dateOfLoss) : b.dateOfLoss) : null,
        requestType: (b.requestType === "RECORDS" || b.requestType === "BILLS" || b.requestType === "BOTH") ? b.requestType : undefined,
        destinationType: (b.destinationType === "EMAIL" || b.destinationType === "FAX" || b.destinationType === "PORTAL" || b.destinationType === "MANUAL") ? b.destinationType : undefined,
        destinationValue: typeof b.destinationValue === "string" ? b.destinationValue : null,
        subject: typeof b.subject === "string" ? b.subject : null,
        messageBody: typeof b.messageBody === "string" ? b.messageBody : null,
        requestedDateFrom: b.requestedDateFrom != null ? (typeof b.requestedDateFrom === "string" ? new Date(b.requestedDateFrom) : b.requestedDateFrom) : null,
        requestedDateTo: b.requestedDateTo != null ? (typeof b.requestedDateTo === "string" ? new Date(b.requestedDateTo) : b.requestedDateTo) : null,
        createdByUserId: getCreatedByUserId(req),
    };
    const result = await (0, recordsRequestService_1.createRecordsRequestDraft)(input);
    if (!result.ok)
        return res.status(400).json({ ok: false, error: result.error });
    const request = await prisma_1.prisma.recordsRequest.findFirst({
        where: (0, tenant_1.buildFirmWhere)(firmId, { id: result.id }),
        include: { attachments: true, events: { orderBy: { createdAt: "desc" }, take: 5 } },
    });
    return res.status(201).json({ ok: true, request });
});
// GET /records-requests — list with filters
router.get("/", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.STAFF), async (req, res) => {
    const firmId = (0, tenant_1.requireFirmIdFromRequest)(req, res);
    if (!firmId)
        return;
    if (!(0, tenant_1.forbidCrossTenantAccess)(req, res))
        return;
    const caseId = typeof req.query.caseId === "string" ? req.query.caseId.trim() : undefined;
    const providerId = typeof req.query.providerId === "string" ? req.query.providerId.trim() : undefined;
    const status = typeof req.query.status === "string" ? req.query.status.trim() : undefined;
    const requestType = typeof req.query.requestType === "string" ? req.query.requestType.trim() : undefined;
    const where = (0, tenant_1.buildFirmWhere)(firmId);
    if (caseId)
        where.caseId = caseId;
    if (providerId)
        where.providerId = providerId;
    if (status)
        where.status = status;
    if (requestType)
        where.requestType = requestType;
    const requests = await prisma_1.prisma.recordsRequest.findMany({
        where,
        include: { attachments: true },
        orderBy: { createdAt: "desc" },
        take: 200,
    });
    return res.json({ ok: true, requests });
});
// GET /records-requests/:id
router.get("/:id", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.STAFF), async (req, res) => {
    const firmId = (0, tenant_1.requireFirmIdFromRequest)(req, res);
    if (!firmId)
        return;
    const id = req.params.id;
    const request = await (0, recordsRequestService_1.getRequestWithRelations)(id, firmId);
    if (!request)
        return (0, tenant_1.sendNotFound)(res);
    if (!(0, tenant_1.assertRecordBelongsToFirm)(request.firmId, firmId, res))
        return;
    return res.json({ ok: true, request });
});
// POST /records-requests/:id/send
router.post("/:id/send", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.STAFF), async (req, res) => {
    const firmId = (0, tenant_1.requireFirmIdFromRequest)(req, res);
    if (!firmId)
        return;
    const id = req.params.id;
    const request = await prisma_1.prisma.recordsRequest.findFirst({
        where: (0, tenant_1.buildFirmWhere)(firmId, { id }),
    });
    if (!request)
        return (0, tenant_1.sendNotFound)(res);
    const validation = await (0, recordsRequestService_1.validateForSend)(id, firmId);
    if (!validation.ok)
        return res.status(400).json({ ok: false, error: validation.error });
    const letterResult = await (0, recordsRequestPdf_1.generateAndStoreRecordsRequestLetter)({ recordsRequestId: id, firmId });
    let letterBuffer;
    let letterFilename;
    if (letterResult.ok) {
        const doc = await prisma_1.prisma.document.findFirst({
            where: (0, tenant_1.buildFirmWhere)(firmId, { id: letterResult.documentId }),
            select: { spacesKey: true, originalName: true },
        });
        if (doc) {
            const { getObjectBuffer } = await Promise.resolve().then(() => __importStar(require("../../services/storage")));
            letterBuffer = await getObjectBuffer(doc.spacesKey);
            letterFilename = doc.originalName ?? "records-request-letter.pdf";
        }
    }
    const deliverResult = await (0, recordsRequestDelivery_1.deliverRecordsRequestEmail)({
        recordsRequestId: id,
        firmId,
        letterPdfBuffer: letterBuffer,
        letterFilename,
    });
    if (!deliverResult.ok)
        return res.status(500).json({ ok: false, error: deliverResult.error });
    await prisma_1.prisma.recordsRequest.update({
        where: { id },
        data: { status: "SENT", sentAt: new Date() },
    });
    await prisma_1.prisma.recordsRequestEvent.create({
        data: {
            firmId,
            recordsRequestId: id,
            eventType: "SENT",
            status: "SENT",
            message: deliverResult.message,
            metaJson: { channel: "email", destination: request.destinationValue },
        },
    });
    const updated = await (0, recordsRequestService_1.getRequestWithRelations)(id, firmId);
    return res.json({ ok: true, request: updated, message: deliverResult.message });
});
// POST /records-requests/:id/follow-up
router.post("/:id/follow-up", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.STAFF), async (req, res) => {
    const firmId = (0, tenant_1.requireFirmIdFromRequest)(req, res);
    if (!firmId)
        return;
    const id = req.params.id;
    const request = await prisma_1.prisma.recordsRequest.findFirst({
        where: (0, tenant_1.buildFirmWhere)(firmId, { id }),
    });
    if (!request)
        return (0, tenant_1.sendNotFound)(res);
    if (request.status !== "SENT" && request.status !== "FOLLOW_UP_DUE") {
        return res.status(400).json({ ok: false, error: "Request must be SENT or FOLLOW_UP_DUE to send follow-up" });
    }
    const dest = (request.destinationValue ?? "").trim();
    if (!dest)
        return res.status(400).json({ ok: false, error: "No destination for follow-up" });
    const body = req.body.message ?? request.messageBody ?? "Please send the requested records at your earliest convenience. Thank you.";
    const subject = `Follow-up: ${request.subject ?? "Medical Records Request"}`;
    const { sendAdapter } = await Promise.resolve().then(() => __importStar(require("../../send/compositeAdapter")));
    const result = await sendAdapter.sendEmail(dest, subject, body);
    if (!result.ok) {
        await prisma_1.prisma.recordsRequestEvent.create({
            data: {
                firmId,
                recordsRequestId: id,
                eventType: "FAILED",
                status: request.status,
                message: `Follow-up failed: ${result.error}`,
                metaJson: { followUp: true },
            },
        });
        return res.status(500).json({ ok: false, error: result.error });
    }
    const followUpCount = (request.followUpCount ?? 0) + 1;
    await prisma_1.prisma.recordsRequest.update({
        where: { id },
        data: { followUpCount, lastFollowUpAt: new Date(), status: "SENT" },
    });
    await prisma_1.prisma.recordsRequestEvent.create({
        data: {
            firmId,
            recordsRequestId: id,
            eventType: "FOLLOW_UP_SENT",
            status: "SENT",
            message: "Follow-up sent",
            metaJson: { followUpCount },
        },
    });
    const updated = await (0, recordsRequestService_1.getRequestWithRelations)(id, firmId);
    return res.json({ ok: true, request: updated });
});
// POST /records-requests/:id/complete
router.post("/:id/complete", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.STAFF), async (req, res) => {
    const firmId = (0, tenant_1.requireFirmIdFromRequest)(req, res);
    if (!firmId)
        return;
    const id = req.params.id;
    const request = await prisma_1.prisma.recordsRequest.findFirst({
        where: (0, tenant_1.buildFirmWhere)(firmId, { id }),
    });
    if (!request)
        return (0, tenant_1.sendNotFound)(res);
    await prisma_1.prisma.recordsRequest.update({
        where: { id },
        data: { status: "COMPLETED", completedAt: new Date() },
    });
    await prisma_1.prisma.recordsRequestEvent.create({
        data: {
            firmId,
            recordsRequestId: id,
            eventType: "STATUS_CHANGED",
            status: "COMPLETED",
            message: "Marked completed",
        },
    });
    const updated = await (0, recordsRequestService_1.getRequestWithRelations)(id, firmId);
    return res.json({ ok: true, request: updated });
});
// POST /records-requests/:id/cancel
router.post("/:id/cancel", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.STAFF), async (req, res) => {
    const firmId = (0, tenant_1.requireFirmIdFromRequest)(req, res);
    if (!firmId)
        return;
    const id = req.params.id;
    const request = await prisma_1.prisma.recordsRequest.findFirst({
        where: (0, tenant_1.buildFirmWhere)(firmId, { id }),
    });
    if (!request)
        return (0, tenant_1.sendNotFound)(res);
    await prisma_1.prisma.recordsRequest.update({
        where: { id },
        data: { status: "CANCELLED" },
    });
    await prisma_1.prisma.recordsRequestEvent.create({
        data: {
            firmId,
            recordsRequestId: id,
            eventType: "STATUS_CHANGED",
            status: "CANCELLED",
            message: "Request cancelled",
        },
    });
    const updated = await (0, recordsRequestService_1.getRequestWithRelations)(id, firmId);
    return res.json({ ok: true, request: updated });
});
// POST /records-requests/:id/attach-document
router.post("/:id/attach-document", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.STAFF), async (req, res) => {
    const firmId = (0, tenant_1.requireFirmIdFromRequest)(req, res);
    if (!firmId)
        return;
    if (!(0, tenant_1.forbidCrossTenantAccess)(req, res))
        return;
    const id = req.params.id;
    const body = req.body;
    if (!body.documentId || typeof body.documentId !== "string") {
        return res.status(400).json({ ok: false, error: "documentId is required" });
    }
    const kind = ["AUTHORIZATION", "LETTER", "SUPPORTING_DOC", "RESPONSE_DOC"].includes(body.kind) ? body.kind : "SUPPORTING_DOC";
    const request = await prisma_1.prisma.recordsRequest.findFirst({
        where: (0, tenant_1.buildFirmWhere)(firmId, { id }),
    });
    if (!request)
        return (0, tenant_1.sendNotFound)(res);
    const doc = await prisma_1.prisma.document.findFirst({
        where: (0, tenant_1.buildFirmWhere)(firmId, { id: body.documentId }),
    });
    if (!doc)
        return res.status(404).json({ ok: false, error: "Document not found" });
    const attachment = await prisma_1.prisma.recordsRequestAttachment.create({
        data: {
            firmId,
            recordsRequestId: id,
            documentId: body.documentId,
            kind,
        },
    });
    const updated = await (0, recordsRequestService_1.getRequestWithRelations)(id, firmId);
    return res.status(201).json({ ok: true, attachment, request: updated });
});
exports.default = router;
