import multer from "multer";
import { ClioHandoffExportSubtype, ClioHandoffExportType, Role } from "@prisma/client";
import { Router } from "express";

import {
  findRecentClioHandoffDuplicate,
  recordBatchClioHandoff,
  resolveClioHandoffActorSnapshot,
} from "../../services/clioHandoffTracking";
import {
  buildMigrationBatchClioPreview,
  getMigrationBatchDetail,
  importMigrationBatch,
  linkMigrationBatchToClioHandoff,
  listMigrationBatches,
} from "../../services/migrationBatchWorkflow";
import { auth } from "../middleware/auth";
import { requireRole } from "../middleware/requireRole";

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 200 },
});

function trimToNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseBooleanFlag(value: unknown): boolean {
  if (value === true) return true;
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
}

function getClioIdempotencyKey(req: Parameters<typeof auth>[0]): string | null {
  const raw = req.get("Idempotency-Key");
  return trimToNull(raw);
}

router.post(
  "/import",
  auth,
  requireRole(Role.STAFF),
  upload.array("files", 200),
  async (req, res) => {
    try {
      const firmId = (req as any).firmId as string;
      const createdByUserId = ((req as any).userId as string | null | undefined) ?? null;
      const files = ((req.files as Express.Multer.File[] | undefined) ?? []).filter(
        (file) => Buffer.isBuffer(file.buffer)
      );
      if (files.length === 0) {
        return res.status(400).json({ ok: false, error: "Upload at least one scanned file in the files field." });
      }

      const result = await importMigrationBatch({
        firmId,
        createdByUserId,
        label: trimToNull((req.body ?? {}).label),
        files: files.map((file) => ({
          buffer: file.buffer,
          originalName: file.originalname,
          mimeType: file.mimetype || "application/octet-stream",
        })),
      });

      const detail = await getMigrationBatchDetail(firmId, result.batchId);
      res.status(201).json({
        ok: true,
        batchId: result.batchId,
        importedCount: result.documentIds.length,
        failedCount: result.failures.length,
        documentIds: result.documentIds,
        failures: result.failures,
        batch: detail.batch,
      });
    } catch (e: any) {
      res.status(500).json({ ok: false, error: String(e?.message ?? e) });
    }
  }
);

router.get("/batches", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const items = await listMigrationBatches(firmId);
    res.json({ ok: true, items });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message ?? e) });
  }
});

router.get("/batches/:batchId", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const batchId = String(req.params.batchId ?? "");
    const detail = await getMigrationBatchDetail(firmId, batchId);
    res.json({ ok: true, ...detail });
  } catch (e: any) {
    const message = String(e?.message ?? e);
    const status = message === "Migration batch not found" ? 404 : 500;
    res.status(status).json({ ok: false, error: message });
  }
});

router.get("/batches/:batchId/exports/clio/contacts.csv", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const batchId = String(req.params.batchId ?? "");
    const preview = await buildMigrationBatchClioPreview(firmId, batchId, { allowReexport: true });
    if (preview.manifest.includedCaseIds.length === 0) {
      return res.status(409).json({
        ok: false,
        error: "No routed cases in this migration batch are currently ready for Clio contacts export.",
        skippedCases: preview.manifest.skippedCases,
      });
    }
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${preview.contactsFileName}"`
    );
    res.send(Buffer.from(preview.contactsCsv, "utf-8"));
  } catch (e: any) {
    const message = String(e?.message ?? e);
    const status =
      message === "Migration batch not found" ||
      message === "This migration batch does not have any routed cases ready for Clio export."
        ? 404
        : 500;
    res.status(status).json({ ok: false, error: message });
  }
});

router.get("/batches/:batchId/exports/clio/matters.csv", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const batchId = String(req.params.batchId ?? "");
    const preview = await buildMigrationBatchClioPreview(firmId, batchId, { allowReexport: true });
    if (preview.manifest.includedCaseIds.length === 0) {
      return res.status(409).json({
        ok: false,
        error: "No routed cases in this migration batch are currently ready for Clio matters export.",
        skippedCases: preview.manifest.skippedCases,
      });
    }
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${preview.mattersFileName}"`
    );
    res.send(Buffer.from(preview.mattersCsv, "utf-8"));
  } catch (e: any) {
    const message = String(e?.message ?? e);
    const status =
      message === "Migration batch not found" ||
      message === "This migration batch does not have any routed cases ready for Clio export."
        ? 404
        : 500;
    res.status(status).json({ ok: false, error: message });
  }
});

router.post("/batches/:batchId/exports/clio/handoff", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const batchId = String(req.params.batchId ?? "");
    const actor = await resolveClioHandoffActorSnapshot({
      firmId,
      userId: ((req as any).userId as string | null | undefined) ?? null,
      apiKeyId: ((req as any).apiKeyId as string | null | undefined) ?? null,
      authRole: ((req as any).authRole as string | null | undefined) ?? null,
    });
    const allowReexport = parseBooleanFlag((req.body ?? {}).allowReexport);
    const reExportReason = allowReexport
      ? trimToNull((req.body ?? {}).reexportReason) ?? "operator_override"
      : null;

    const preview = await buildMigrationBatchClioPreview(firmId, batchId, {
      allowReexport,
    });
    if (preview.manifest.includedCaseIds.length === 0) {
      return res.status(409).json({
        ok: false,
        error: "No routed cases in this migration batch are currently ready for Clio handoff.",
        skippedCases: preview.manifest.skippedCases,
      });
    }

    const idempotencyKey = getClioIdempotencyKey(req);
    const requestFingerprint = [
      "migration_batch",
      batchId,
      allowReexport ? "reexport" : "first_export",
      [...preview.manifest.includedCaseIds].sort().join(","),
    ].join(":");
    const duplicate = await findRecentClioHandoffDuplicate({
      firmId,
      exportType: ClioHandoffExportType.BATCH,
      exportSubtype: ClioHandoffExportSubtype.COMBINED_BATCH,
      idempotencyKey,
      requestFingerprint,
    });

    if (duplicate) {
      await linkMigrationBatchToClioHandoff(firmId, batchId, duplicate.id);
      res.setHeader("X-Clio-Idempotent-Replay", "true");
    } else {
      const exportRecord = await recordBatchClioHandoff({
        firmId,
        actor,
        idempotencyKey,
        requestFingerprint,
        reExportOverride: allowReexport,
        reExportReason,
        batchResult: preview,
      });
      await linkMigrationBatchToClioHandoff(firmId, batchId, exportRecord.id);
    }

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${preview.fileName}"`);
    res.send(preview.zipBuffer);
  } catch (e: any) {
    const message = String(e?.message ?? e);
    const status =
      message === "Migration batch not found" ||
      message === "This migration batch does not have any routed cases ready for Clio export."
        ? 404
        : 500;
    res.status(status).json({ ok: false, error: message });
  }
});

export default router;
