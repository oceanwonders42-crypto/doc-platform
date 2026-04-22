import { ClioHandoffExportSubtype, ClioHandoffExportType, Prisma, Role } from "@prisma/client";
import { Router, type Request } from "express";
import { prisma } from "../../db/prisma";
import { generateClioContactsCsv, generateClioMattersCsv, listClioContactRows, listClioMatterRows } from "../../exports/clioExport";
import { buildBatchClioHandoffExport } from "../../services/batchClioHandoffExport";
import {
  findRecentClioHandoffDuplicate,
  getCaseClioHandoffHistory,
  getClioHandoffSummaryByCaseIds,
  listClioHandoffHistory,
  recordBatchClioHandoff,
  recordSingleCaseClioHandoff,
  resolveClioHandoffActorSnapshot,
  type CaseClioHandoffHistoryItem,
  type ClioHandoffCaseSummary,
} from "../../services/clioHandoffTracking";
import { syncClioCaseAssignmentsIfStale } from "../../services/clioCaseAssignments";
import { buildVisibleCaseWhere } from "../../services/caseVisibility";
import { buildExportBundle, runExport } from "../../services/export";
import { getPresignedGetUrl } from "../../services/storage";
import { auth } from "../middleware/auth";
import { requireRole } from "../middleware/requireRole";

const router = Router();

const CONTACT_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  fullName: true,
  email: true,
  phone: true,
  dateOfBirth: true,
  address1: true,
  address2: true,
  city: true,
  state: true,
  postalCode: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ContactSelect;

type ClioBatchExportSummary = {
  status: "eligible" | "already_exported" | "potentially_skipped";
  reason: string;
};

type CaseRouteAccessContext = {
  firmId: string;
  authRole: Role | string | null | undefined;
  userId: string | null;
  apiKeyId: string | null;
};

function trimToNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function parseDate(value: unknown, fieldName: string): Date | null {
  const trimmed = trimToNull(value);
  if (!trimmed) return null;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${fieldName} must be a valid date`);
  }
  return parsed;
}

function normalizeCaseStatus(value: unknown): "open" | "pending" | "closed" {
  const normalized = trimToNull(value)?.toLowerCase();
  if (normalized === "pending" || normalized === "closed") return normalized;
  return "open";
}

function sanitizeFilePart(value: string | null | undefined, fallback: string): string {
  const trimmed = trimToNull(value);
  if (!trimmed) return fallback;
  const cleaned = trimmed.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return cleaned || fallback;
}

function splitName(fullName: string): { firstName: string | null; lastName: string | null } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: null, lastName: null };
  if (parts.length === 1) return { firstName: null, lastName: parts[0] };
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

function buildFullName(input: {
  fullName?: unknown;
  firstName?: unknown;
  lastName?: unknown;
  clientName?: unknown;
}): string | null {
  const explicit = trimToNull(input.fullName);
  if (explicit) return explicit;
  const firstName = trimToNull(input.firstName);
  const lastName = trimToNull(input.lastName);
  const combined = [firstName, lastName].filter(Boolean).join(" ").trim();
  if (combined) return combined;
  return trimToNull(input.clientName);
}

function buildClioBatchExportSummary(input: {
  clientName: string | null;
  totalDocs: number;
  persistedReviewDocs: number;
  exportReadyDocs: number;
  handoffSummary?: ClioHandoffCaseSummary;
}): ClioBatchExportSummary {
  if (input.handoffSummary?.alreadyExported) {
    const lastExportedAt = input.handoffSummary.lastExportedAt
      ? new Date(input.handoffSummary.lastExportedAt).toISOString().slice(0, 10)
      : null;
    return {
      status: "already_exported",
      reason: lastExportedAt
        ? `Already handed off to Clio on ${lastExportedAt}. Turn on include re-exports to export it again.`
        : "Already handed off to Clio. Turn on include re-exports to export it again.",
    };
  }
  if (!trimToNull(input.clientName)) {
    return {
      status: "potentially_skipped",
      reason: "This case does not have exportable client contact data yet.",
    };
  }
  if (input.totalDocs === 0) {
    return {
      status: "potentially_skipped",
      reason: "This case has no routed documents to export yet.",
    };
  }
  if (input.persistedReviewDocs > 0 && input.exportReadyDocs === 0) {
    return {
      status: "potentially_skipped",
      reason: "No export-ready documents are available for this case yet.",
    };
  }
  return {
    status: "eligible",
    reason: "Ready for batch Clio handoff export.",
  };
}

function parseBooleanFlag(value: unknown): boolean {
  if (value === true) return true;
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
}

function getClioIdempotencyKey(req: Request): string | null {
  return trimToNull(req.get("Idempotency-Key"));
}

function getSingleCaseReexportOverride(req: Request): boolean {
  return parseBooleanFlag(req.get("X-Clio-Reexport")) || parseBooleanFlag(req.query.reexport);
}

function getSingleCaseReexportReason(req: Request): string | null {
  return trimToNull(req.get("X-Clio-Reexport-Reason")) ?? trimToNull(req.query.reexportReason);
}

function getCaseRouteAccessContext(req: Request): CaseRouteAccessContext {
  return {
    firmId: (req as any).firmId as string,
    authRole: (req as any).authRole as Role | string | null | undefined,
    userId: typeof (req as any).userId === "string" ? ((req as any).userId as string) : null,
    apiKeyId: typeof (req as any).apiKeyId === "string" ? ((req as any).apiKeyId as string) : null,
  };
}

function buildSingleCaseRequestFingerprint(
  caseId: string,
  exportSubtype: ClioHandoffExportSubtype,
  reExportOverride: boolean
): string {
  return ["single_case", exportSubtype, caseId, reExportOverride ? "reexport" : "first_export"].join(":");
}

function buildBatchRequestFingerprint(caseIds: string[], allowReexport: boolean): string {
  const normalized = [...new Set(caseIds.map((item) => item.trim()).filter(Boolean))].sort();
  return ["batch", allowReexport ? "reexport" : "first_export", normalized.join(",")].join(":");
}

function serializeCase(
  item: Prisma.LegalCaseGetPayload<{ include: { clientContact: { select: typeof CONTACT_SELECT } } }>,
  options?: {
    clioBatchExport?: ClioBatchExportSummary;
    clioHandoff?: ClioHandoffCaseSummary;
    clioHandoffHistory?: CaseClioHandoffHistoryItem[];
  }
) {
  return {
    id: item.id,
    title: item.title,
    caseNumber: item.caseNumber,
    clientName: item.clientContact?.fullName ?? item.clientName ?? null,
    clientContactId: item.clientContactId,
    incidentDate: item.incidentDate?.toISOString() ?? null,
    status: item.status,
    notes: item.notes,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    clientContact: item.clientContact
      ? {
          ...item.clientContact,
          dateOfBirth: item.clientContact.dateOfBirth?.toISOString() ?? null,
          createdAt: item.clientContact.createdAt.toISOString(),
          updatedAt: item.clientContact.updatedAt.toISOString(),
        }
      : null,
    ...(options?.clioBatchExport ? { clioBatchExport: options.clioBatchExport } : {}),
    ...(options?.clioHandoff ? { clioHandoff: options.clioHandoff } : {}),
    ...(options?.clioHandoffHistory ? { clioHandoffHistory: options.clioHandoffHistory } : {}),
  };
}

router.get("/", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const accessContext = getCaseRouteAccessContext(req);
    const { firmId } = accessContext;
    const providerId = trimToNull(req.query.providerId);
    const status = trimToNull(req.query.status)?.toLowerCase();

    await syncClioCaseAssignmentsIfStale({ firmId }).catch(() => undefined);

    const scopedFilters: Prisma.LegalCaseWhereInput = {};
    if (providerId) {
      scopedFilters.caseProviders = {
        some: { providerId, firmId },
      };
    }
    if (status === "open" || status === "pending" || status === "closed") {
      scopedFilters.status = status;
    }
    const where = buildVisibleCaseWhere({
      ...accessContext,
      extraWhere: scopedFilters,
    });

    const items = await prisma.legalCase.findMany({
      where,
      include: { clientContact: { select: CONTACT_SELECT } },
      orderBy: { createdAt: "desc" },
    });
    const caseIds = items.map((item) => item.id);
    const exportCounts =
      caseIds.length > 0
        ? await prisma.document.groupBy({
            by: ["routedCaseId", "reviewState"],
            where: {
              firmId,
              routedCaseId: { in: caseIds },
            },
            _count: { _all: true },
          })
        : [];

    const exportCountsByCaseId = new Map<string, { totalDocs: number; persistedReviewDocs: number; exportReadyDocs: number }>();
    for (const row of exportCounts) {
      const caseId = row.routedCaseId;
      if (!caseId) continue;
      const next = exportCountsByCaseId.get(caseId) ?? {
        totalDocs: 0,
        persistedReviewDocs: 0,
        exportReadyDocs: 0,
      };
      next.totalDocs += row._count._all;
      if (row.reviewState != null) {
        next.persistedReviewDocs += row._count._all;
      }
      if (row.reviewState === "EXPORT_READY") {
        next.exportReadyDocs += row._count._all;
      }
      exportCountsByCaseId.set(caseId, next);
    }
    const handoffSummaries = await getClioHandoffSummaryByCaseIds(firmId, caseIds);

    res.json({
      ok: true,
      items: items.map((item) => {
        const counts = exportCountsByCaseId.get(item.id) ?? {
          totalDocs: 0,
          persistedReviewDocs: 0,
          exportReadyDocs: 0,
        };
        return serializeCase(
          item,
          {
            clioBatchExport: buildClioBatchExportSummary({
              clientName: item.clientContact?.fullName ?? item.clientName ?? null,
              totalDocs: counts.totalDocs,
              persistedReviewDocs: counts.persistedReviewDocs,
              exportReadyDocs: counts.exportReadyDocs,
              handoffSummary: handoffSummaries.get(item.id),
            }),
            clioHandoff: handoffSummaries.get(item.id),
          }
        );
      }),
    });
  } catch (e: unknown) {
    res.status(500).json({ ok: false, error: String((e as Error)?.message ?? e) });
  }
});

router.post("/", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const accessContext = getCaseRouteAccessContext(req);
    const { firmId, userId } = accessContext;
    const body = (req.body ?? {}) as {
      title?: unknown;
      caseNumber?: unknown;
      status?: unknown;
      incidentDate?: unknown;
      notes?: unknown;
      clientName?: unknown;
      contactId?: unknown;
      contact?: Record<string, unknown>;
    };

    const title = trimToNull(body.title);
    if (!title) {
      return res.status(400).json({ ok: false, error: "title is required" });
    }

    const caseNumber = trimToNull(body.caseNumber);
    const notes = trimToNull(body.notes);
    const incidentDate = parseDate(body.incidentDate, "incidentDate");
    const status = normalizeCaseStatus(body.status);
    const requestedContactId = trimToNull(body.contactId);
    const contactInput = body.contact && typeof body.contact === "object" ? body.contact : {};

    const fullName = buildFullName({
      fullName: contactInput.fullName,
      firstName: contactInput.firstName,
      lastName: contactInput.lastName,
      clientName: body.clientName,
    });

    if (!requestedContactId && !fullName) {
      return res.status(400).json({ ok: false, error: "client contact information is required" });
    }

    const created = await prisma.$transaction(async (tx) => {
      let clientContactId: string | null = null;
      let clientName = trimToNull(body.clientName);

      if (requestedContactId) {
        const existingContact = await tx.contact.findFirst({
          where: { id: requestedContactId, firmId },
          select: CONTACT_SELECT,
        });
        if (!existingContact) {
          throw new Error("Selected contact was not found");
        }
        clientContactId = existingContact.id;
        clientName = existingContact.fullName;
      } else if (fullName) {
        const derivedNames = splitName(fullName);
        const createdContact = await tx.contact.create({
          data: {
            firmId,
            firstName: trimToNull(contactInput.firstName) ?? derivedNames.firstName,
            lastName: trimToNull(contactInput.lastName) ?? derivedNames.lastName,
            fullName,
            email: trimToNull(contactInput.email),
            phone: trimToNull(contactInput.phone),
            dateOfBirth: parseDate(contactInput.dateOfBirth, "contact.dateOfBirth"),
            address1: trimToNull(contactInput.address1),
            address2: trimToNull(contactInput.address2),
            city: trimToNull(contactInput.city),
            state: trimToNull(contactInput.state),
            postalCode: trimToNull(contactInput.postalCode),
          },
          select: { id: true, fullName: true },
        });
        clientContactId = createdContact.id;
        clientName = createdContact.fullName;
      }

      return tx.legalCase.create({
        data: {
          firmId,
          title,
          caseNumber,
          clientName,
          clientContactId,
          assignedUserId: userId ?? undefined,
          incidentDate,
          status,
          notes,
        },
        include: { clientContact: { select: CONTACT_SELECT } },
      });
    });

    res.status(201).json({ ok: true, item: serializeCase(created) });
  } catch (e: unknown) {
    const message = String((e as Error)?.message ?? e);
    const status = message === "Selected contact was not found" || message.includes("must be a valid date") ? 400 : 500;
    res.status(status).json({ ok: false, error: message });
  }
});

router.post("/exports/clio/batch", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const accessContext = getCaseRouteAccessContext(req);
    const { firmId } = accessContext;
    const actor = await resolveClioHandoffActorSnapshot({
      firmId,
      userId: ((req as any).userId as string | null | undefined) ?? null,
      apiKeyId: ((req as any).apiKeyId as string | null | undefined) ?? null,
      authRole: ((req as any).authRole as string | null | undefined) ?? null,
    });
    const body = (req.body ?? {}) as {
      caseIds?: unknown;
      allowReexport?: unknown;
      reexportReason?: unknown;
    };
    if (!Array.isArray(body.caseIds)) {
      return res.status(400).json({ ok: false, error: "caseIds must be a non-empty array of case ids." });
    }

    const caseIds = body.caseIds.filter((value): value is string => typeof value === "string");
    const visibleCases = await prisma.legalCase.findMany({
      where: buildVisibleCaseWhere({
        ...accessContext,
        extraWhere: { id: { in: caseIds } },
        allowApiKeyFirmAccess: true,
      }),
      select: { id: true },
    });
    const visibleCaseIdSet = new Set(visibleCases.map((item) => item.id));
    const allowReexport = parseBooleanFlag(body.allowReexport);
    const reExportReason = allowReexport ? trimToNull(body.reexportReason) ?? "operator_override" : null;
    const result = await buildBatchClioHandoffExport({
      firmId,
      caseIds,
      accessibleCaseIds: [...visibleCaseIdSet],
      allowReexport,
    });
    const idempotencyKey = getClioIdempotencyKey(req);
    const requestFingerprint = buildBatchRequestFingerprint(caseIds, allowReexport);
    const duplicate = await findRecentClioHandoffDuplicate({
      firmId,
      exportType: ClioHandoffExportType.BATCH,
      exportSubtype: ClioHandoffExportSubtype.COMBINED_BATCH,
      idempotencyKey,
      requestFingerprint,
    });
    if (!duplicate) {
      await recordBatchClioHandoff({
        firmId,
        actor,
        idempotencyKey,
        requestFingerprint,
        reExportOverride: allowReexport,
        reExportReason,
        batchResult: result,
      });
    } else {
      res.setHeader("X-Clio-Idempotent-Replay", "true");
    }

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${result.fileName}"`);
    res.send(result.zipBuffer);
  } catch (e: unknown) {
    const message = String((e as Error)?.message ?? e);
    const status = message === "caseIds must contain at least one case id." ? 400 : 500;
    res.status(status).json({ ok: false, error: message });
  }
});

router.get("/exports/clio/history", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const requestedLimit = Number.parseInt(String(req.query.limit ?? ""), 10);
    const history = await listClioHandoffHistory(
      firmId,
      Number.isFinite(requestedLimit) ? requestedLimit : 20
    );
    res.json({ ok: true, items: history });
  } catch (e: unknown) {
    res.status(500).json({ ok: false, error: String((e as Error)?.message ?? e) });
  }
});

router.get("/:id", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const accessContext = getCaseRouteAccessContext(req);
    const { firmId } = accessContext;
    const caseId = String(req.params.id ?? "");
    await syncClioCaseAssignmentsIfStale({ firmId, caseIds: [caseId] }).catch(() => undefined);
    const item = await prisma.legalCase.findFirst({
      where: buildVisibleCaseWhere({ ...accessContext, caseId }),
      include: { clientContact: { select: CONTACT_SELECT } },
    });
    if (!item) return res.status(404).json({ ok: false, error: "Case not found" });
    const [handoffSummaryMap, clioHandoffHistory] = await Promise.all([
      getClioHandoffSummaryByCaseIds(firmId, [caseId]),
      getCaseClioHandoffHistory(firmId, caseId),
    ]);
    res.json({
      ok: true,
      item: serializeCase(item, {
        clioHandoff: handoffSummaryMap.get(caseId),
        clioHandoffHistory,
      }),
    });
  } catch (e: unknown) {
    res.status(500).json({ ok: false, error: String((e as Error)?.message ?? e) });
  }
});

router.get("/:id/exports/clio/contacts.csv", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const accessContext = getCaseRouteAccessContext(req);
    const { firmId } = accessContext;
    const actor = await resolveClioHandoffActorSnapshot({
      firmId,
      userId: ((req as any).userId as string | null | undefined) ?? null,
      apiKeyId: ((req as any).apiKeyId as string | null | undefined) ?? null,
      authRole: ((req as any).authRole as string | null | undefined) ?? null,
    });
    const caseId = String(req.params.id ?? "");
    await syncClioCaseAssignmentsIfStale({ firmId, caseIds: [caseId] }).catch(() => undefined);
    const item = await prisma.legalCase.findFirst({
      where: buildVisibleCaseWhere({ ...accessContext, caseId, allowApiKeyFirmAccess: true }),
      include: { clientContact: { select: CONTACT_SELECT } },
    });
    if (!item) return res.status(404).json({ ok: false, error: "Case not found" });
    const handoffSummary = (await getClioHandoffSummaryByCaseIds(firmId, [caseId])).get(caseId);
    const reExportOverride = getSingleCaseReexportOverride(req);
    const reExportReason = reExportOverride
      ? getSingleCaseReexportReason(req) ?? "operator_override"
      : null;
    if (handoffSummary?.alreadyExported && !reExportOverride) {
      return res.status(409).json({
        ok: false,
        error: "This case has already been handed off to Clio. Turn on re-export anyway to export it again.",
      });
    }

    const rows = await listClioContactRows(firmId, { caseIds: [caseId] });
    if (rows.length === 0) {
      return res.status(400).json({ ok: false, error: "This case does not have exportable client contact data yet." });
    }

    const csv = await generateClioContactsCsv(firmId, { caseIds: [caseId] });
    const fileBase = sanitizeFilePart(item.caseNumber ?? item.title ?? item.id, item.id);
    const fileName = `${fileBase}-contact.csv`;
    const idempotencyKey = getClioIdempotencyKey(req);
    const requestFingerprint = buildSingleCaseRequestFingerprint(
      caseId,
      ClioHandoffExportSubtype.CONTACTS,
      reExportOverride
    );
    const duplicate = await findRecentClioHandoffDuplicate({
      firmId,
      exportType: ClioHandoffExportType.SINGLE_CASE,
      exportSubtype: ClioHandoffExportSubtype.CONTACTS,
      idempotencyKey,
      requestFingerprint,
    });
    if (!duplicate) {
      await recordSingleCaseClioHandoff({
        firmId,
        actor,
        exportSubtype: ClioHandoffExportSubtype.CONTACTS,
        idempotencyKey,
        requestFingerprint,
        reExportOverride,
        reExportReason,
        isReExport: handoffSummary?.alreadyExported === true,
        caseSnapshot: {
          id: item.id,
          caseNumber: item.caseNumber ?? null,
          title: item.title ?? null,
          clientName: item.clientContact?.fullName ?? item.clientName ?? null,
        },
        fileName,
        rowCount: rows.length,
      });
    } else {
      res.setHeader("X-Clio-Idempotent-Replay", "true");
    }
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.send(Buffer.from(csv, "utf-8"));
  } catch (e: unknown) {
    res.status(500).json({ ok: false, error: String((e as Error)?.message ?? e) });
  }
});

router.get("/:id/exports/clio/matters.csv", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const accessContext = getCaseRouteAccessContext(req);
    const { firmId } = accessContext;
    const actor = await resolveClioHandoffActorSnapshot({
      firmId,
      userId: ((req as any).userId as string | null | undefined) ?? null,
      apiKeyId: ((req as any).apiKeyId as string | null | undefined) ?? null,
      authRole: ((req as any).authRole as string | null | undefined) ?? null,
    });
    const caseId = String(req.params.id ?? "");
    await syncClioCaseAssignmentsIfStale({ firmId, caseIds: [caseId] }).catch(() => undefined);
    const item = await prisma.legalCase.findFirst({
      where: buildVisibleCaseWhere({ ...accessContext, caseId, allowApiKeyFirmAccess: true }),
      include: { clientContact: { select: CONTACT_SELECT } },
    });
    if (!item) return res.status(404).json({ ok: false, error: "Case not found" });
    const handoffSummary = (await getClioHandoffSummaryByCaseIds(firmId, [caseId])).get(caseId);
    const reExportOverride = getSingleCaseReexportOverride(req);
    const reExportReason = reExportOverride
      ? getSingleCaseReexportReason(req) ?? "operator_override"
      : null;
    if (handoffSummary?.alreadyExported && !reExportOverride) {
      return res.status(409).json({
        ok: false,
        error: "This case has already been handed off to Clio. Turn on re-export anyway to export it again.",
      });
    }

    const rows = await listClioMatterRows(firmId, { caseIds: [caseId] });
    if (rows.length === 0) {
      return res.status(400).json({ ok: false, error: "This case does not have exportable matter data yet." });
    }

    const csv = await generateClioMattersCsv(firmId, { caseIds: [caseId] });
    const fileBase = sanitizeFilePart(item.caseNumber ?? item.title ?? item.id, item.id);
    const fileName = `${fileBase}-matter.csv`;
    const idempotencyKey = getClioIdempotencyKey(req);
    const requestFingerprint = buildSingleCaseRequestFingerprint(
      caseId,
      ClioHandoffExportSubtype.MATTERS,
      reExportOverride
    );
    const duplicate = await findRecentClioHandoffDuplicate({
      firmId,
      exportType: ClioHandoffExportType.SINGLE_CASE,
      exportSubtype: ClioHandoffExportSubtype.MATTERS,
      idempotencyKey,
      requestFingerprint,
    });
    if (!duplicate) {
      await recordSingleCaseClioHandoff({
        firmId,
        actor,
        exportSubtype: ClioHandoffExportSubtype.MATTERS,
        idempotencyKey,
        requestFingerprint,
        reExportOverride,
        reExportReason,
        isReExport: handoffSummary?.alreadyExported === true,
        caseSnapshot: {
          id: item.id,
          caseNumber: item.caseNumber ?? null,
          title: item.title ?? null,
          clientName: item.clientContact?.fullName ?? item.clientName ?? null,
        },
        fileName,
        rowCount: rows.length,
      });
    } else {
      res.setHeader("X-Clio-Idempotent-Replay", "true");
    }
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.send(Buffer.from(csv, "utf-8"));
  } catch (e: unknown) {
    res.status(500).json({ ok: false, error: String((e as Error)?.message ?? e) });
  }
});

router.post("/:id/exports/packet", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const accessContext = getCaseRouteAccessContext(req);
    const { firmId } = accessContext;
    const caseId = String(req.params.id ?? "");
    const body = (req.body ?? {}) as {
      includeTimeline?: unknown;
      includeSummary?: unknown;
      packetType?: unknown;
    };
    const includeTimeline = body.includeTimeline !== false;
    const includeSummary = body.includeSummary === true;
    const packetType =
      body.packetType === "records" || body.packetType === "bills" || body.packetType === "combined"
        ? body.packetType
        : "combined";

    await syncClioCaseAssignmentsIfStale({ firmId, caseIds: [caseId] }).catch(() => undefined);
    const item = await prisma.legalCase.findFirst({
      where: buildVisibleCaseWhere({ ...accessContext, caseId }),
      include: { clientContact: { select: CONTACT_SELECT } },
    });
    if (!item) return res.status(404).json({ ok: false, error: "Case not found" });

    const [bundle, docCounts] = await Promise.all([
      buildExportBundle(caseId, firmId, {
        includeTimeline,
        includeSummary,
        packetType,
      }),
      prisma.document.groupBy({
        by: ["reviewState"],
        where: { firmId, routedCaseId: caseId },
        _count: { _all: true },
      }),
    ]);

    if (!bundle) {
      return res.status(404).json({ ok: false, error: "Case not found" });
    }

    const totalDocs = docCounts.reduce((sum, row) => sum + row._count._all, 0);
    const persistedReviewDocs = docCounts
      .filter((row) => row.reviewState != null)
      .reduce((sum, row) => sum + row._count._all, 0);
    const exportReadyDocs = docCounts
      .filter((row) => row.reviewState === "EXPORT_READY")
      .reduce((sum, row) => sum + row._count._all, 0);

    if (bundle.documents.length === 0) {
      if (totalDocs === 0) {
        return res.status(400).json({ ok: false, error: "This case has no routed documents to export yet." });
      }
      if (persistedReviewDocs > 0 && exportReadyDocs === 0) {
        return res.status(400).json({ ok: false, error: "No export-ready documents are available for this case yet." });
      }
      return res.status(400).json({ ok: false, error: "No documents matched this export packet." });
    }

    const result = await runExport({
      caseId,
      firmId,
      destinations: ["download_bundle"],
      includeTimeline,
      includeSummary,
      packetType,
    });
    const packetResult = result.results.find((entry) => entry.kind === "download_bundle");
    if (!result.ok || !packetResult?.ok || !packetResult.storageKey) {
      return res.status(500).json({
        ok: false,
        error: packetResult?.error ?? result.error ?? "Failed to generate packet export",
      });
    }

    const downloadUrl = await getPresignedGetUrl(packetResult.storageKey, 3600);
    res.json({
      ok: true,
      caseId,
      packetType,
      fileName: packetResult.fileName ?? null,
      downloadUrl,
      documentCount: result.bundle?.documentCount ?? bundle.documents.length,
      includesTimeline: includeTimeline,
      includesSummary: includeSummary,
    });
  } catch (e: unknown) {
    res.status(500).json({ ok: false, error: String((e as Error)?.message ?? e) });
  }
});

export default router;
