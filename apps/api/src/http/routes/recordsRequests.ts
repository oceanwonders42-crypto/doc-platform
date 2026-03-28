/**
 * Records request automation API.
 * All routes require auth; firmId from token only. No firmId in body.
 */
import { Router, Request, Response } from "express";
import { Prisma, Role } from "@prisma/client";
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
  getRequestWithRelations,
  type CreateRecordsRequestInput,
} from "../../services/recordsRequestService";
import { generateAndStoreRecordsRequestLetter } from "../../services/recordsRequestPdf";
import { sendRecordsRequest } from "../../services/recordsRequestSend";
import {
  normalizeRecordsRequestStatus,
  recordsRequestStatusLabel,
  type RecordsRequestStatus,
} from "../../services/recordsRequestStatus";
import { buildRecordsRequestLetterPdf } from "../../services/recordsLetterPdf";

const router = Router();
type RecordsRequestRecord = Prisma.RecordsRequestGetPayload<{}>;
type RecordsRequestWithRelations = Prisma.RecordsRequestGetPayload<{
  include: { attachments: true; events: { orderBy: { createdAt: "desc" } } };
}>;
type RecordsRequestLike = RecordsRequestRecord | RecordsRequestWithRelations;
type SerializedRecordsRequest = ReturnType<typeof serializeRequest<RecordsRequestRecord>>;

function idParam(req: Request): string {
  const p = req.params.id;
  return Array.isArray(p) ? p[0] : p;
}

function getCreatedByUserId(req: Request): string | null {
  return (req as Request & { userId?: string }).userId ?? null;
}

function serializeRequest<T extends RecordsRequestLike>(request: T): T & {
  status: RecordsRequestStatus;
  statusLabel: string;
  requestDate: string | null;
  responseDate: string | null;
} {
  const status = normalizeRecordsRequestStatus(request.status);
  return {
    ...request,
    status,
    statusLabel: recordsRequestStatusLabel(status),
    requestDate: (request.requestDate ?? request.sentAt ?? request.createdAt)?.toISOString() ?? null,
    responseDate: (request.responseDate ?? request.completedAt)?.toISOString() ?? null,
  };
}

async function fetchCaseSummaries(firmId: string, caseIds: string[]) {
  if (caseIds.length === 0) return new Map<string, { id: string; title: string | null; caseNumber: string | null; clientName: string | null }>();
  const cases = await prisma.legalCase.findMany({
    where: { firmId, id: { in: caseIds } },
    select: { id: true, title: true, caseNumber: true, clientName: true },
  });
  return new Map(cases.map((item) => [item.id, item]));
}

function buildRequestListItem(
  request: SerializedRecordsRequest,
  caseInfo: { title: string | null; caseNumber: string | null; clientName: string | null } | undefined
) {
  return {
    id: request.id,
    caseId: request.caseId,
    caseNumber: caseInfo?.caseNumber ?? null,
    clientName: caseInfo?.clientName ?? null,
    caseTitle: caseInfo?.title ?? null,
    providerName: request.providerName,
    providerContact: request.providerContact ?? null,
    status: request.status,
    statusLabel: request.statusLabel,
    requestDate: request.requestDate,
    responseDate: request.responseDate,
    createdAt: request.createdAt.toISOString(),
    updatedAt: request.updatedAt.toISOString(),
  };
}

async function loadCaseInfo(firmId: string, caseId: string) {
  return prisma.legalCase.findFirst({
    where: buildFirmWhere(firmId, { id: caseId }),
    select: { id: true, title: true, caseNumber: true, clientName: true },
  });
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
    const id = idParam(req);
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
      providerName: typeof b.providerName === "string" ? b.providerName : null,
      providerContact: typeof b.providerContact === "string" ? b.providerContact : null,
      notes: typeof b.notes === "string" ? b.notes : null,
      patientName: typeof b.patientName === "string" ? b.patientName : null,
      patientDob: b.patientDob != null ? (typeof b.patientDob === "string" ? new Date(b.patientDob) : (b.patientDob as Date)) : null,
      dateOfLoss: b.dateOfLoss != null ? (typeof b.dateOfLoss === "string" ? new Date(b.dateOfLoss) : (b.dateOfLoss as Date)) : null,
      requestType: (b.requestType === "RECORDS" || b.requestType === "BILLS" || b.requestType === "BOTH") ? b.requestType : undefined,
      destinationType: (b.destinationType === "EMAIL" || b.destinationType === "FAX" || b.destinationType === "PORTAL" || b.destinationType === "MANUAL") ? b.destinationType : undefined,
      destinationValue: typeof b.destinationValue === "string" ? b.destinationValue : null,
      subject: typeof b.subject === "string" ? b.subject : null,
      messageBody: typeof b.messageBody === "string" ? b.messageBody : null,
      requestedDateFrom:
        b.requestedDateFrom != null
          ? (typeof b.requestedDateFrom === "string" ? new Date(b.requestedDateFrom) : (b.requestedDateFrom as Date))
          : b.dateFrom != null
            ? (typeof b.dateFrom === "string" ? new Date(b.dateFrom) : (b.dateFrom as Date))
            : null,
      requestedDateTo:
        b.requestedDateTo != null
          ? (typeof b.requestedDateTo === "string" ? new Date(b.requestedDateTo) : (b.requestedDateTo as Date))
          : b.dateTo != null
            ? (typeof b.dateTo === "string" ? new Date(b.dateTo) : (b.dateTo as Date))
            : null,
      createdByUserId: getCreatedByUserId(req),
    };
    const result = await createRecordsRequestDraft(input);
    if (!result.ok) return res.status(400).json({ ok: false, error: result.error });
    const request = await prisma.recordsRequest.findFirst({
      where: buildFirmWhere(firmId, { id: result.id }),
      include: { attachments: true, events: { orderBy: { createdAt: "desc" }, take: 5 } },
    });
    if (!request) return sendNotFound(res);
    const serialized = serializeRequest(request);
    const caseInfo = await loadCaseInfo(firmId, request.caseId);
    return res.status(201).json({ ok: true, request: serialized, item: serialized, case: caseInfo });
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
    if (status) (where as any).status = normalizeRecordsRequestStatus(status);
    if (requestType) (where as any).requestType = requestType;

    const requests = await prisma.recordsRequest.findMany({
      where,
      include: { attachments: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    const serializedRequests = requests.map((request) => serializeRequest(request));
    const caseMap = await fetchCaseSummaries(
      firmId,
      [...new Set(serializedRequests.map((request) => request.caseId))]
    );
    const items = serializedRequests.map((request) =>
      buildRequestListItem(request, caseMap.get(request.caseId))
    );
    return res.json({ ok: true, requests: serializedRequests, items });
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
    const id = idParam(req);
    const request = await getRequestWithRelations(id, firmId);
    if (!request) return sendNotFound(res);
    if (!assertRecordBelongsToFirm((request as any).firmId, firmId, res)) return;
    const caseInfo = await loadCaseInfo(firmId, request.caseId);
    const serialized = serializeRequest(request);
    return res.json({ ok: true, request: serialized, item: serialized, case: caseInfo });
  }
);

// PATCH /records-requests/:id
router.patch(
  "/:id",
  auth,
  requireRole(Role.STAFF),
  async (req: Request, res: Response) => {
    const firmId = requireFirmIdFromRequest(req, res);
    if (!firmId) return;
    const id = idParam(req);
    const existing = await prisma.recordsRequest.findFirst({
      where: buildFirmWhere(firmId, { id }),
    });
    if (!existing) return sendNotFound(res);

    const body = (req.body ?? {}) as Record<string, unknown>;
    const data: Prisma.RecordsRequestUpdateInput = {};

    if (body.status !== undefined) {
      const nextStatus = normalizeRecordsRequestStatus(body.status, normalizeRecordsRequestStatus(existing.status));
      const now = new Date();
      data.status = nextStatus;
      if (nextStatus === "SENT" && existing.sentAt == null) {
        data.sentAt = now;
        data.requestDate = existing.requestDate ?? now;
      }
      if ((nextStatus === "RECEIVED" || nextStatus === "COMPLETED") && existing.completedAt == null) {
        data.completedAt = now;
      }
      if (nextStatus === "RECEIVED" && existing.responseDate == null) {
        data.responseDate = now;
      }
    }
    if (body.notes !== undefined) data.notes = body.notes === null ? null : String(body.notes);
    if (body.dateFrom !== undefined) data.dateFrom = body.dateFrom ? new Date(String(body.dateFrom)) : null;
    if (body.dateTo !== undefined) data.dateTo = body.dateTo ? new Date(String(body.dateTo)) : null;
    if (body.requestedDateFrom !== undefined) {
      data.requestedDateFrom = body.requestedDateFrom ? new Date(String(body.requestedDateFrom)) : null;
    }
    if (body.requestedDateTo !== undefined) {
      data.requestedDateTo = body.requestedDateTo ? new Date(String(body.requestedDateTo)) : null;
    }
    if (body.providerName !== undefined) data.providerName = String(body.providerName || "").trim();
    if (body.providerContact !== undefined) {
      data.providerContact = body.providerContact === null ? null : String(body.providerContact);
    }
    if (body.subject !== undefined) data.subject = body.subject === null ? null : String(body.subject);
    if (body.messageBody !== undefined) {
      data.messageBody = body.messageBody === null ? null : String(body.messageBody);
    }
    if (body.letterBody !== undefined) {
      const nextBody = body.letterBody === null ? null : String(body.letterBody);
      data.letterBody = nextBody;
      if (body.messageBody === undefined) data.messageBody = nextBody;
    }

    const updated = await prisma.recordsRequest.update({
      where: { id },
      data,
      include: { attachments: true, events: { orderBy: { createdAt: "desc" } } },
    });
    const serialized = serializeRequest(updated);
    const caseInfo = await loadCaseInfo(firmId, updated.caseId);
    return res.json({ ok: true, request: serialized, item: serialized, case: caseInfo });
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
    const id = idParam(req);
    const request = await prisma.recordsRequest.findFirst({
      where: buildFirmWhere(firmId, { id }),
    });
    if (!request) return sendNotFound(res);
    const body = (req.body ?? {}) as { channel?: string; to?: string };
    const requestedChannel = String(body.channel ?? "").trim().toLowerCase();
    const channel = requestedChannel === "fax" ? "fax" : "email";
    const destination = String(body.to ?? request.destinationValue ?? "").trim();
    if (!destination) {
      return res.status(400).json({
        ok: false,
        error: channel === "fax" ? "Destination fax number is required" : "Destination email is required",
      });
    }

    const sendResult = await sendRecordsRequest({
      recordsRequestId: id,
      firmId,
      channel,
      destination,
    });
    if (!sendResult.ok) return res.status(400).json({ ok: false, error: sendResult.error });

    const updated = await getRequestWithRelations(id, firmId);
    if (!updated) return sendNotFound(res);
    const serialized = serializeRequest(updated);
    const caseInfo = await loadCaseInfo(firmId, updated.caseId);
    return res.json({ ok: true, request: serialized, item: serialized, case: caseInfo, message: sendResult.message });
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
    const id = idParam(req);
    const request = await prisma.recordsRequest.findFirst({
      where: buildFirmWhere(firmId, { id }),
    });
    if (!request) return sendNotFound(res);
    const currentStatus = normalizeRecordsRequestStatus(request.status);
    if (currentStatus !== "SENT" && currentStatus !== "FOLLOW_UP_DUE") {
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
          status: "FAILED",
          message: `Follow-up failed: ${result.error}`,
          metaJson: { followUp: true },
        },
      });
      await prisma.recordsRequest.update({
        where: { id },
        data: { status: "FAILED" },
      });
      return res.status(500).json({ ok: false, error: result.error });
    }
    const followUpCount = (request.followUpCount ?? 0) + 1;
    await prisma.recordsRequest.update({
      where: { id },
      data: { followUpCount, lastFollowUpAt: new Date(), status: "FOLLOW_UP_DUE" },
    });
    await prisma.recordsRequestEvent.create({
      data: {
        firmId,
        recordsRequestId: id,
        eventType: "FOLLOW_UP_SENT",
        status: "FOLLOW_UP_DUE",
        message: "Follow-up sent",
        metaJson: { followUpCount },
      },
    });
    const updated = await getRequestWithRelations(id, firmId);
    if (!updated) return sendNotFound(res);
    const serialized = serializeRequest(updated);
    const caseInfo = await loadCaseInfo(firmId, updated.caseId);
    return res.json({ ok: true, request: serialized, item: serialized, case: caseInfo });
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
    const id = idParam(req);
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
    if (!updated) return sendNotFound(res);
    const serialized = serializeRequest(updated);
    const caseInfo = await loadCaseInfo(firmId, updated.caseId);
    return res.json({ ok: true, request: serialized, item: serialized, case: caseInfo });
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
    const id = idParam(req);
    const request = await prisma.recordsRequest.findFirst({
      where: buildFirmWhere(firmId, { id }),
    });
    if (!request) return sendNotFound(res);
    const allowedFrom = ["SENT", "FOLLOW_UP_DUE", "DRAFT"];
    const currentStatus = normalizeRecordsRequestStatus(request.status);
    if (!allowedFrom.includes(currentStatus)) {
      return res.status(400).json({
        ok: false,
        error: `Cannot mark as received from status ${currentStatus}. Allowed: ${allowedFrom.join(", ")}`,
      });
    }
    await prisma.recordsRequest.update({
      where: { id },
      data: { status: "RECEIVED", responseDate: new Date(), completedAt: new Date() },
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
    if (!updated) return sendNotFound(res);
    return res.json({ ok: true, request: serializeRequest(updated), item: serializeRequest(updated) });
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
    const id = idParam(req);
    const request = await prisma.recordsRequest.findFirst({
      where: buildFirmWhere(firmId, { id }),
    });
    if (!request) return sendNotFound(res);
    const allowedFrom = ["DRAFT", "SENT", "FOLLOW_UP_DUE"];
    const currentStatus = normalizeRecordsRequestStatus(request.status);
    if (!allowedFrom.includes(currentStatus)) {
      return res.status(400).json({
        ok: false,
        error: `Cannot mark as failed from status ${currentStatus}. Allowed: ${allowedFrom.join(", ")}`,
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
    if (!updated) return sendNotFound(res);
    return res.json({ ok: true, request: serializeRequest(updated), item: serializeRequest(updated) });
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
    const id = idParam(req);
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
    if (!updated) return sendNotFound(res);
    return res.json({ ok: true, request: serializeRequest(updated), item: serializeRequest(updated) });
  }
);

// GET /records-requests/:id/attempts
router.get(
  "/:id/attempts",
  auth,
  requireRole(Role.STAFF),
  async (req: Request, res: Response) => {
    const firmId = requireFirmIdFromRequest(req, res);
    if (!firmId) return;
    const id = idParam(req);
    const request = await prisma.recordsRequest.findFirst({
      where: buildFirmWhere(firmId, { id }),
      select: { id: true },
    });
    if (!request) return sendNotFound(res);
    const attempts = await prisma.recordsRequestAttempt.findMany({
      where: buildFirmWhere(firmId, { recordsRequestId: id }),
      orderBy: { createdAt: "desc" },
    });
    return res.json({
      ok: true,
      items: attempts.map((attempt) => ({
        ...attempt,
        createdAt: attempt.createdAt.toISOString(),
      })),
    });
  }
);

// POST /records-requests/:id/generate-pdf
router.post(
  "/:id/generate-pdf",
  auth,
  requireRole(Role.STAFF),
  async (req: Request, res: Response) => {
    const firmId = requireFirmIdFromRequest(req, res);
    if (!firmId) return;
    const id = idParam(req);
    const result = await generateAndStoreRecordsRequestLetter({ recordsRequestId: id, firmId });
    if (!result.ok) return res.status(400).json({ ok: false, error: result.error });
    return res.json({ ok: true, documentId: result.documentId });
  }
);

// GET /records-requests/:id/letter
router.get(
  "/:id/letter",
  auth,
  requireRole(Role.STAFF),
  async (req: Request, res: Response) => {
    const firmId = requireFirmIdFromRequest(req, res);
    if (!firmId) return;
    const id = idParam(req);
    const formatPdf =
      req.query.format === "pdf" ||
      /application\/pdf/i.test(String(req.headers.accept ?? ""));
    const request = await prisma.recordsRequest.findFirst({
      where: buildFirmWhere(firmId, { id }),
    });
    if (!request) return sendNotFound(res);

    const today = new Date();
    const fmt = (value: Date | null) => (value ? value.toLocaleDateString("en-US") : "");
    const dateFromStr = request.requestedDateFrom ? fmt(request.requestedDateFrom) : fmt(request.dateFrom);
    const dateToStr = request.requestedDateTo ? fmt(request.requestedDateTo) : fmt(request.dateTo);
    const rangeStr =
      dateFromStr && dateToStr
        ? `${dateFromStr} – ${dateToStr}`
        : dateFromStr
          ? `from ${dateFromStr}`
          : dateToStr
            ? `through ${dateToStr}`
            : "for all dates of service on file";
    const notes = request.notes ? request.notes : "";
    const providerContact = request.providerContact ?? "";
    const templateText = [
      today.toLocaleDateString("en-US"),
      "",
      request.providerName,
      providerContact,
      "",
      "Re: Request for updated medical records and billing",
      "",
      `Please provide complete and legible copies of all medical records and itemized billing ${rangeStr} for the above-referenced matter.`,
      "",
      notes ? `Additional details:\n${notes}\n` : "",
      "You may send the records electronically or via fax to our office.",
      "",
      "Thank you for your prompt attention to this request.",
    ]
      .join("\n")
      .trim();

    const text = (request.letterBody ?? request.messageBody ?? templateText).trim();
    if (formatPdf) {
      const pdfBuffer = await buildRecordsRequestLetterPdf({
        letterBody: text,
        providerName: request.providerName,
        providerContact: request.providerContact,
      });
      const filename = `records-request-${request.providerName.replace(/[^a-zA-Z0-9-_]/g, "-").slice(0, 40)}.pdf`;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      return res.send(pdfBuffer);
    }

    const serialized = serializeRequest(request);
    return res.json({
      ok: true,
      text,
      html: request.letterBody
        ? `<pre style="white-space: pre-wrap; font-family: inherit;">${escapeHtml(text)}</pre>`
        : `<p>${today.toLocaleDateString("en-US")}</p><p>${request.providerName}<br/>${providerContact.replace(/\n/g, "<br/>")}</p><p><strong>Re: Request for updated medical records and billing</strong></p><p>Please provide complete and legible copies of all medical records and itemized billing ${rangeStr} for the above-referenced matter.</p>${notes ? `<p><strong>Additional details:</strong><br/>${notes.replace(/\n/g, "<br/>")}</p>` : ""}<p>You may send the records electronically or via fax to our office.</p><p>Thank you for your prompt attention to this request.</p>`,
      request: serialized,
    });
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
    const id = idParam(req);
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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
