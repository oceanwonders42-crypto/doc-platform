import { Prisma, Role } from "@prisma/client";
import { Router } from "express";
import { prisma } from "../../db/prisma";
import { generateClioContactsCsv, generateClioMattersCsv, listClioContactRows, listClioMatterRows } from "../../exports/clioExport";
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

function serializeCase(
  item: Prisma.LegalCaseGetPayload<{ include: { clientContact: { select: typeof CONTACT_SELECT } } }>
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
  };
}

router.get("/", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const providerId = trimToNull(req.query.providerId);
    const status = trimToNull(req.query.status)?.toLowerCase();

    const where: Prisma.LegalCaseWhereInput = { firmId };
    if (providerId) {
      where.caseProviders = {
        some: { providerId, firmId },
      };
    }
    if (status === "open" || status === "pending" || status === "closed") {
      where.status = status;
    }

    const items = await prisma.legalCase.findMany({
      where,
      include: { clientContact: { select: CONTACT_SELECT } },
      orderBy: { createdAt: "desc" },
    });
    res.json({ ok: true, items: items.map(serializeCase) });
  } catch (e: unknown) {
    res.status(500).json({ ok: false, error: String((e as Error)?.message ?? e) });
  }
});

router.post("/", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
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

router.get("/:id", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const caseId = String(req.params.id ?? "");
    const item = await prisma.legalCase.findFirst({
      where: { id: caseId, firmId },
      include: { clientContact: { select: CONTACT_SELECT } },
    });
    if (!item) return res.status(404).json({ ok: false, error: "Case not found" });
    res.json({ ok: true, item: serializeCase(item) });
  } catch (e: unknown) {
    res.status(500).json({ ok: false, error: String((e as Error)?.message ?? e) });
  }
});

router.get("/:id/exports/clio/contacts.csv", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const caseId = String(req.params.id ?? "");
    const item = await prisma.legalCase.findFirst({
      where: { id: caseId, firmId },
      include: { clientContact: { select: CONTACT_SELECT } },
    });
    if (!item) return res.status(404).json({ ok: false, error: "Case not found" });

    const rows = await listClioContactRows(firmId, { caseIds: [caseId] });
    if (rows.length === 0) {
      return res.status(400).json({ ok: false, error: "This case does not have exportable client contact data yet." });
    }

    const csv = await generateClioContactsCsv(firmId, { caseIds: [caseId] });
    const fileBase = sanitizeFilePart(item.caseNumber ?? item.title ?? item.id, item.id);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${fileBase}-contact.csv"`);
    res.send(Buffer.from(csv, "utf-8"));
  } catch (e: unknown) {
    res.status(500).json({ ok: false, error: String((e as Error)?.message ?? e) });
  }
});

router.get("/:id/exports/clio/matters.csv", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const caseId = String(req.params.id ?? "");
    const item = await prisma.legalCase.findFirst({
      where: { id: caseId, firmId },
      include: { clientContact: { select: CONTACT_SELECT } },
    });
    if (!item) return res.status(404).json({ ok: false, error: "Case not found" });

    const rows = await listClioMatterRows(firmId, { caseIds: [caseId] });
    if (rows.length === 0) {
      return res.status(400).json({ ok: false, error: "This case does not have exportable matter data yet." });
    }

    const csv = await generateClioMattersCsv(firmId, { caseIds: [caseId] });
    const fileBase = sanitizeFilePart(item.caseNumber ?? item.title ?? item.id, item.id);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${fileBase}-matter.csv"`);
    res.send(Buffer.from(csv, "utf-8"));
  } catch (e: unknown) {
    res.status(500).json({ ok: false, error: String((e as Error)?.message ?? e) });
  }
});

router.post("/:id/exports/packet", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
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

    const item = await prisma.legalCase.findFirst({
      where: { id: caseId, firmId },
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
