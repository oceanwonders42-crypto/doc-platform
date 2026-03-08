/**
 * Records request automation API.
 * All routes require auth; firmId from token only. No firmId in body.
 */
import { Router, Request, Response } from "express";
import { Role } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { auth } from "../middleware/auth";
import { requireRole } from "../middleware/requireRole";
import {
  requireFirmIdFromRequest,
  buildFirmWhere,
  assertRecordBelongsToFirm,
  forbidCrossTenantAccess,
  sendNotFound,
} from "../../lib/tenant";
import {
  createRecordsRequestDraft,
  validateForSend,
  getRequestWithRelations,
  type CreateRecordsRequestInput,
} from "../../services/recordsRequestService";
import { deliverRecordsRequestEmail } from "../../services/recordsRequestDelivery";
import { generateAndStoreRecordsRequestLetter } from "../../services/recordsRequestPdf";

const router = Router();

function getCreatedByUserId(req: Request): string | null {
  return (req as Request & { userId?: string }).userId ?? null;
}

// GET /records-requests/dashboard — must be before /:id
router.get(
  "/dashboard",
  auth,
  requireRole(Role.STAFF),
  async (req: Request, res: Response) => {
    const firmId = requireFirmIdFromRequest(req, res);
    if (!firmId) return;
    if (!forbidCrossTenantAccess(req, res)) return;

    const where = buildFirmWhere(firmId);
    const [open, sent, followUpDue, received, failed, completedThisWeek] = await Promise.all([
      prisma.recordsRequest.count({
        where: { ...where, status: { in: ["DRAFT", "SENT", "FOLLOW_UP_DUE"] } },
      }),
      prisma.recordsRequest.count({ where: { ...where, status: "SENT" } }),
      prisma.recordsRequest.count({ where: { ...where, status: "FOLLOW_UP_DUE" } }),
      prisma.recordsRequest.count({ where: { ...where, status: "RECEIVED" } }),
      prisma.recordsRequest.count({ where: { ...where, status: "FAILED" } }),
      prisma.recordsRequest.count({
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
  }
);

// GET /records-requests/templates
router.get(
  "/templates",
  auth,
  requireRole(Role.STAFF),
  async (req: Request, res: Response) => {
    const firmId = requireFirmIdFromRequest(req, res);
    if (!firmId) return;
    if (!forbidCrossTenantAccess(req, res)) return;
    const list = await prisma.recordsRequestTemplate.findMany({
      where: buildFirmWhere(firmId),
      orderBy: { name: "asc" },
    });
    return res.json({ ok: true, templates: list });
  }
);

// POST /records-requests/templates
router.post(
  "/templates",
  auth,
  requireRole(Role.STAFF),
  async (req: Request, res: Response) => {
    const firmId = requireFirmIdFromRequest(req, res);
    if (!firmId) return;
    if (!forbidCrossTenantAccess(req, res)) return;
    const body = req.body as { name?: string; requestType?: string; subject?: string; body?: string; isDefault?: boolean };
    if (!body.name || typeof body.name !== "string" || !body.name.trim()) {
      return res.status(400).json({ ok: false, error: "name is required" });
    }
    const template = await prisma.recordsRequestTemplate.create({
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
  }
);

// PATCH /records-requests/templates/:id
router.patch(
  "/templates/:id",
  auth,
  requireRole(Role.STAFF),
  async (req: Request, res: Response) => {
    const firmId = requireFirmIdFromRequest(req, res);
    if (!firmId) return;
    if (!forbidCrossTenantAccess(req, res)) return;
    const id = req.params.id;
    const existing = await prisma.recordsRequestTemplate.findFirst({
      where: buildFirmWhere(firmId, { id }),
    });
    if (!existing) return sendNotFound(res);
    const body = req.body as { name?: string; requestType?: string; subject?: string; body?: string; isDefault?: boolean };
    const template = await prisma.recordsRequestTemplate.update({
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
  }
);

// POST /records-requests — create draft
router.post(
  "/",
  auth,
  requireRole(Role.STAFF),
  async (req: Request, res: Response) => {
    const firmId = requireFirmIdFromRequest(req, res);
    if (!firmId) return;
    if (!forbidCrossTenantAccess(req, res)) return;

    const b = req.body as Record<string, unknown>;
    const input: CreateRecordsRequestInput = {
      firmId,
      caseId: typeof b.caseId === "string" ? b.caseId : "",
      providerId: typeof b.providerId === "string" ? b.providerId : null,
      patientName: typeof b.patientName === "string" ? b.patientName : null,
      patientDob: b.patientDob != null ? (typeof b.patientDob === "string" ? new Date(b.patientDob) : (b.patientDob as Date)) : null,
      dateOfLoss: b.dateOfLoss != null ? (typeof b.dateOfLoss === "string" ? new Date(b.dateOfLoss) : (b.dateOfLoss as Date)) : null,
      requestType: (b.requestType === "RECORDS" || b.requestType === "BILLS" || b.requestType === "BOTH") ? b.requestType : undefined,
      destinationType: (b.destinationType === "EMAIL" || b.destinationType === "FAX" || b.destinationType === "PORTAL" || b.destinationType === "MANUAL") ? b.destinationType : undefined,
      destinationValue: typeof b.destinationValue === "string" ? b.destinationValue : null,
      subject: typeof b.subject === "string" ? b.subject : null,
      messageBody: typeof b.messageBody === "string" ? b.messageBody : null,
      requestedDateFrom: b.requestedDateFrom != null ? (typeof b.requestedDateFrom === "string" ? new Date(b.requestedDateFrom) : (b.requestedDateFrom as Date)) : null,
      requestedDateTo: b.requestedDateTo != null ? (typeof b.requestedDateTo === "string" ? new Date(b.requestedDateTo) : (b.requestedDateTo as Date)) : null,
      createdByUserId: getCreatedByUserId(req),
    };
    const result = await createRecordsRequestDraft(input);
    if (!result.ok) return res.status(400).json({ ok: false, error: result.error });
    const request = await prisma.recordsRequest.findFirst({
      where: buildFirmWhere(firmId, { id: result.id }),
      include: { attachments: true, events: { orderBy: { createdAt: "desc" }, take: 5 } },
    });
    return res.status(201).json({ ok: true, request });
  }
);

// GET /records-requests — list with filters
router.get(
  "/",
  auth,
  requireRole(Role.STAFF),
  async (req: Request, res: Response) => {
    const firmId = requireFirmIdFromRequest(req, res);
    if (!firmId) return;
    if (!forbidCrossTenantAccess(req, res)) return;

    const caseId = typeof req.query.caseId === "string" ? req.query.caseId.trim() : undefined;
    const providerId = typeof req.query.providerId === "string" ? req.query.providerId.trim() : undefined;
    const status = typeof req.query.status === "string" ? req.query.status.trim() : undefined;
    const requestType = typeof req.query.requestType === "string" ? req.query.requestType.trim() : undefined;

    const where = buildFirmWhere(firmId);
    if (caseId) (where as any).caseId = caseId;
    if (providerId) (where as any).providerId = providerId;
    if (status) (where as any).status = status;
    if (requestType) (where as any).requestType = requestType;

    const requests = await prisma.recordsRequest.findMany({
      where,
      include: { attachments: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return res.json({ ok: true, requests });
  }
);

// GET /records-requests/:id
router.get(
  "/:id",
  auth,
  requireRole(Role.STAFF),
  async (req: Request, res: Response) => {
    const firmId = requireFirmIdFromRequest(req, res);
    if (!firmId) return;
    const id = req.params.id;
    const request = await getRequestWithRelations(id, firmId);
    if (!request) return sendNotFound(res);
    if (!assertRecordBelongsToFirm((request as any).firmId, firmId, res)) return;
    return res.json({ ok: true, request });
  }
);

// POST /records-requests/:id/send
router.post(
  "/:id/send",
  auth,
  requireRole(Role.STAFF),
  async (req: Request, res: Response) => {
    const firmId = requireFirmIdFromRequest(req, res);
    if (!firmId) return;
    const id = req.params.id;
    const request = await prisma.recordsRequest.findFirst({
      where: buildFirmWhere(firmId, { id }),
    });
    if (!request) return sendNotFound(res);
    const validation = await validateForSend(id, firmId);
    if (!validation.ok) return res.status(400).json({ ok: false, error: validation.error });

    const letterResult = await generateAndStoreRecordsRequestLetter({ recordsRequestId: id, firmId });
    let letterBuffer: Buffer | undefined;
    let letterFilename: string | undefined;
    if (letterResult.ok) {
      const doc = await prisma.document.findFirst({
        where: buildFirmWhere(firmId, { id: letterResult.documentId }),
        select: { spacesKey: true, originalName: true },
      });
      if (doc) {
        const { getObjectBuffer } = await import("../../services/storage");
        letterBuffer = await getObjectBuffer(doc.spacesKey);
        letterFilename = doc.originalName ?? "records-request-letter.pdf";
      }
    }

    const deliverResult = await deliverRecordsRequestEmail({
      recordsRequestId: id,
      firmId,
      letterPdfBuffer: letterBuffer,
      letterFilename,
    });
    if (!deliverResult.ok) return res.status(500).json({ ok: false, error: deliverResult.error });

    await prisma.recordsRequest.update({
      where: { id },
      data: { status: "SENT", sentAt: new Date() },
    });
    await prisma.recordsRequestEvent.create({
      data: {
        firmId,
        recordsRequestId: id,
        eventType: "SENT",
        status: "SENT",
        message: deliverResult.message,
        metaJson: { channel: "email", destination: request.destinationValue },
      },
    });

    const updated = await getRequestWithRelations(id, firmId);
    return res.json({ ok: true, request: updated, message: deliverResult.message });
  }
);

// POST /records-requests/:id/follow-up
router.post(
  "/:id/follow-up",
  auth,
  requireRole(Role.STAFF),
  async (req: Request, res: Response) => {
    const firmId = requireFirmIdFromRequest(req, res);
    if (!firmId) return;
    const id = req.params.id;
    const request = await prisma.recordsRequest.findFirst({
      where: buildFirmWhere(firmId, { id }),
    });
    if (!request) return sendNotFound(res);
    if (request.status !== "SENT" && request.status !== "FOLLOW_UP_DUE") {
      return res.status(400).json({ ok: false, error: "Request must be SENT or FOLLOW_UP_DUE to send follow-up" });
    }
    const dest = (request.destinationValue ?? "").trim();
    if (!dest) return res.status(400).json({ ok: false, error: "No destination for follow-up" });
    const body = (req.body as { message?: string }).message ?? request.messageBody ?? "Please send the requested records at your earliest convenience. Thank you.";
    const subject = `Follow-up: ${request.subject ?? "Medical Records Request"}`;
    const { sendAdapter } = await import("../../send/compositeAdapter");
    const result = await sendAdapter.sendEmail(dest, subject, body);
    if (!result.ok) {
      await prisma.recordsRequestEvent.create({
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
    await prisma.recordsRequest.update({
      where: { id },
      data: { followUpCount, lastFollowUpAt: new Date(), status: "SENT" },
    });
    await prisma.recordsRequestEvent.create({
      data: {
        firmId,
        recordsRequestId: id,
        eventType: "FOLLOW_UP_SENT",
        status: "SENT",
        message: "Follow-up sent",
        metaJson: { followUpCount },
      },
    });
    const updated = await getRequestWithRelations(id, firmId);
    return res.json({ ok: true, request: updated });
  }
);

// POST /records-requests/:id/complete
router.post(
  "/:id/complete",
  auth,
  requireRole(Role.STAFF),
  async (req: Request, res: Response) => {
    const firmId = requireFirmIdFromRequest(req, res);
    if (!firmId) return;
    const id = req.params.id;
    const request = await prisma.recordsRequest.findFirst({
      where: buildFirmWhere(firmId, { id }),
    });
    if (!request) return sendNotFound(res);
    await prisma.recordsRequest.update({
      where: { id },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
    await prisma.recordsRequestEvent.create({
      data: {
        firmId,
        recordsRequestId: id,
        eventType: "STATUS_CHANGED",
        status: "COMPLETED",
        message: "Marked completed",
      },
    });
    const updated = await getRequestWithRelations(id, firmId);
    return res.json({ ok: true, request: updated });
  }
);

// POST /records-requests/:id/receive — set RECEIVED and completedAt
router.post(
  "/:id/receive",
  auth,
  requireRole(Role.STAFF),
  async (req: Request, res: Response) => {
    const firmId = requireFirmIdFromRequest(req, res);
    if (!firmId) return;
    const id = req.params.id;
    const request = await prisma.recordsRequest.findFirst({
      where: buildFirmWhere(firmId, { id }),
    });
    if (!request) return sendNotFound(res);
    const allowedFrom = ["SENT", "FOLLOW_UP_DUE", "DRAFT"];
    if (!allowedFrom.includes(request.status)) {
      return res.status(400).json({
        ok: false,
        error: `Cannot mark as received from status ${request.status}. Allowed: ${allowedFrom.join(", ")}`,
      });
    }
    await prisma.recordsRequest.update({
      where: { id },
      data: { status: "RECEIVED", completedAt: new Date() },
    });
    await prisma.recordsRequestEvent.create({
      data: {
        firmId,
        recordsRequestId: id,
        eventType: "RESPONSE_RECEIVED",
        status: "RECEIVED",
        message: "Records received",
        metaJson: (req.body as { note?: string })?.note ? { note: (req.body as { note: string }).note } : undefined,
      },
    });
    const updated = await getRequestWithRelations(id, firmId);
    return res.json({ ok: true, request: updated });
  }
);

// POST /records-requests/:id/mark-failed — set FAILED
router.post(
  "/:id/mark-failed",
  auth,
  requireRole(Role.STAFF),
  async (req: Request, res: Response) => {
    const firmId = requireFirmIdFromRequest(req, res);
    if (!firmId) return;
    const id = req.params.id;
    const request = await prisma.recordsRequest.findFirst({
      where: buildFirmWhere(firmId, { id }),
    });
    if (!request) return sendNotFound(res);
    const allowedFrom = ["DRAFT", "SENT", "FOLLOW_UP_DUE"];
    if (!allowedFrom.includes(request.status)) {
      return res.status(400).json({
        ok: false,
        error: `Cannot mark as failed from status ${request.status}. Allowed: ${allowedFrom.join(", ")}`,
      });
    }
    const message = (req.body as { message?: string })?.message?.trim() ?? "Marked as failed";
    await prisma.recordsRequest.update({
      where: { id },
      data: { status: "FAILED" },
    });
    await prisma.recordsRequestEvent.create({
      data: {
        firmId,
        recordsRequestId: id,
        eventType: "STATUS_CHANGED",
        status: "FAILED",
        message,
      },
    });
    const updated = await getRequestWithRelations(id, firmId);
    return res.json({ ok: true, request: updated });
  }
);

// POST /records-requests/:id/cancel
router.post(
  "/:id/cancel",
  auth,
  requireRole(Role.STAFF),
  async (req: Request, res: Response) => {
    const firmId = requireFirmIdFromRequest(req, res);
    if (!firmId) return;
    const id = req.params.id;
    const request = await prisma.recordsRequest.findFirst({
      where: buildFirmWhere(firmId, { id }),
    });
    if (!request) return sendNotFound(res);
    await prisma.recordsRequest.update({
      where: { id },
      data: { status: "CANCELLED" },
    });
    await prisma.recordsRequestEvent.create({
      data: {
        firmId,
        recordsRequestId: id,
        eventType: "STATUS_CHANGED",
        status: "CANCELLED",
        message: "Request cancelled",
      },
    });
    const updated = await getRequestWithRelations(id, firmId);
    return res.json({ ok: true, request: updated });
  }
);

// POST /records-requests/:id/attach-document
router.post(
  "/:id/attach-document",
  auth,
  requireRole(Role.STAFF),
  async (req: Request, res: Response) => {
    const firmId = requireFirmIdFromRequest(req, res);
    if (!firmId) return;
    if (!forbidCrossTenantAccess(req, res)) return;
    const id = req.params.id;
    const body = req.body as { documentId: string; kind: string };
    if (!body.documentId || typeof body.documentId !== "string") {
      return res.status(400).json({ ok: false, error: "documentId is required" });
    }
    const kind = ["AUTHORIZATION", "LETTER", "SUPPORTING_DOC", "RESPONSE_DOC"].includes(body.kind) ? body.kind : "SUPPORTING_DOC";
    const request = await prisma.recordsRequest.findFirst({
      where: buildFirmWhere(firmId, { id }),
    });
    if (!request) return sendNotFound(res);
    const doc = await prisma.document.findFirst({
      where: buildFirmWhere(firmId, { id: body.documentId }),
    });
    if (!doc) return res.status(404).json({ ok: false, error: "Document not found" });
    const attachment = await prisma.recordsRequestAttachment.create({
      data: {
        firmId,
        recordsRequestId: id,
        documentId: body.documentId,
        kind,
      },
    });
    const updated = await getRequestWithRelations(id, firmId);
    return res.status(201).json({ ok: true, attachment, request: updated });
  }
);

export default router;
