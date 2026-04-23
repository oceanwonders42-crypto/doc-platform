import { Role } from "@prisma/client";
import { Router } from "express";

import { auth } from "../middleware/auth";
import { requireRole } from "../middleware/requireRole";
import {
  getDemandBankDocumentDetail,
  listDemandBankDocuments,
  updateDemandBankDocument,
} from "../../services/demandBank";
import { ingestDemandBankDocument } from "../../services/demandBankIngest";

const router = Router();

function trimToNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseBooleanQuery(value: unknown): boolean | null {
  if (value === true || value === false) return value;
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "yes") return true;
  if (normalized === "false" || normalized === "0" || normalized === "no") return false;
  return null;
}

function normalizeStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const normalized = value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0);
  return normalized.length > 0 ? [...new Set(normalized)] : [];
}

router.post("/ingest", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const createdBy = ((req as any).userId as string | null | undefined) ?? null;
    const body = (req.body ?? {}) as Record<string, unknown>;

    const result = await ingestDemandBankDocument({
      firmId,
      createdBy,
      title: trimToNull(body.title),
      fileName: trimToNull(body.fileName),
      text: trimToNull(body.text),
      matterId: trimToNull(body.matterId),
      sourceDocumentId: trimToNull(body.sourceDocumentId),
      jurisdiction: trimToNull(body.jurisdiction),
      caseType: trimToNull(body.caseType),
      liabilityType: trimToNull(body.liabilityType),
      injuryTags: normalizeStringArray(body.injuryTags),
      treatmentTags: normalizeStringArray(body.treatmentTags),
      bodyPartTags: normalizeStringArray(body.bodyPartTags),
      templateFamily: trimToNull(body.templateFamily),
      toneStyle: trimToNull(body.toneStyle),
    });

    res.status(201).json({
      ok: true,
      item: {
        id: result.item.id,
        title: result.item.title,
        reviewStatus: result.item.reviewStatus,
        approvedForReuse: result.item.approvedForReuse,
        blockedForReuse: result.item.blockedForReuse,
        sectionCount: result.sectionCount,
        createdAt: result.item.createdAt.toISOString(),
      },
    });
  } catch (e: any) {
    const message = String(e?.message ?? e);
    const status =
      message === "Source document not found" ||
      message === "Matter not found" ||
      message === "Demand text is required or the source document must already have extracted text."
        ? 400
        : 500;
    res.status(status).json({ ok: false, error: message });
  }
});

router.get("/", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const items = await listDemandBankDocuments(firmId, {
      query: trimToNull(typeof req.query.q === "string" ? req.query.q : null),
      reviewStatus: trimToNull(typeof req.query.reviewStatus === "string" ? req.query.reviewStatus : null),
      approvedForReuse: parseBooleanQuery(req.query.approvedForReuse),
      blockedForReuse: parseBooleanQuery(req.query.blockedForReuse),
    });
    res.json({ ok: true, items });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message ?? e) });
  }
});

router.get("/:id", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const detail = await getDemandBankDocumentDetail(firmId, String(req.params.id ?? ""));
    res.json({ ok: true, ...detail });
  } catch (e: any) {
    const message = String(e?.message ?? e);
    const status = message === "Demand bank document not found" ? 404 : 500;
    res.status(status).json({ ok: false, error: message });
  }
});

router.patch("/:id", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const actorUserId = ((req as any).userId as string | null | undefined) ?? null;
    const updated = await updateDemandBankDocument(
      firmId,
      String(req.params.id ?? ""),
      actorUserId,
      (req.body ?? {}) as Record<string, unknown>
    );
    res.json({ ok: true, item: updated });
  } catch (e: any) {
    const message = String(e?.message ?? e);
    const status = message === "Demand bank document not found" ? 404 : 500;
    res.status(status).json({ ok: false, error: message });
  }
});

export default router;
