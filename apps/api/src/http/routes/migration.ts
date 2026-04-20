import multer from "multer";
import { ClioHandoffExportSubtype, ClioHandoffExportType, Role } from "@prisma/client";
import { Router } from "express";

import { generateClioContactsXlsx, generateClioMattersXlsx } from "../../exports/clioExport";
import {
  buildBatchClioHandoffExport,
  type BatchClioHandoffExportResult,
  type BatchClioHandoffManifest,
} from "../../services/batchClioHandoffExport";
import {
  findRecentClioHandoffDuplicate,
  getStoredBatchClioHandoffArchive,
  recordBatchClioHandoff,
  resolveClioHandoffActorSnapshot,
  recordClioHandoffAuditEvent,
} from "../../services/clioHandoffTracking";
import {
  buildMigrationBatchClioPreview,
  finalizeMigrationBatchForClioHandoff,
  getMigrationBatchDetail,
  importMigrationBatch,
  linkMigrationBatchToClioHandoff,
  listMigrationBatches,
} from "../../services/migrationBatchWorkflow";
import { prisma } from "../../db/prisma";
import { auth } from "../middleware/auth";
import { requireRole } from "../middleware/requireRole";
import { computeMigrationSystemReadiness } from "../../services/migrationSystemReadiness";

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

function readIncludedCaseIdsFromManifestJson(value: unknown): string[] {
  if (!value || typeof value !== "object" || !("includedCaseIds" in value)) {
    return [];
  }

  const includedCaseIds = (value as { includedCaseIds?: unknown }).includedCaseIds;
  if (!Array.isArray(includedCaseIds)) {
    return [];
  }

  return includedCaseIds
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

type ReplayManifestSignature = {
  includedCaseIds: string[];
  includedCaseNumbers: string[];
  includedCases: string[];
  skippedCases: string[];
  contactsRowCount: number;
  mattersRowCount: number;
};

function makeReplayManifestSignature(manifest: BatchClioHandoffManifest): ReplayManifestSignature {
  return {
    includedCaseIds: [...manifest.includedCaseIds].map((value) => value.trim()).sort(),
    includedCaseNumbers: [...manifest.includedCaseNumbers].map((value) => value.trim()).sort(),
    includedCases: manifest.includedCases.map((item) => item.id).sort(),
    skippedCases: manifest.skippedCases.map((item) => `${item.id}:::${item.reason}`).sort(),
    contactsRowCount: Number(manifest.contactsRowCount) || 0,
    mattersRowCount: Number(manifest.mattersRowCount) || 0,
  };
}

function buildReplayManifestSignature(result: BatchClioHandoffExportResult): ReplayManifestSignature {
  return makeReplayManifestSignature(result.manifest);
}

function readReplayManifestSignature(value: unknown): ReplayManifestSignature | null {
  if (!value || typeof value !== "object") return null;

  const record = value as Record<string, unknown>;
  const includedCaseIds = Array.isArray(record.includedCaseIds)
    ? record.includedCaseIds
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .sort()
    : null;
  const includedCaseNumbers = Array.isArray(record.includedCaseNumbers)
    ? record.includedCaseNumbers
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .sort()
    : null;
  const includedCases = Array.isArray(record.includedCases)
    ? record.includedCases
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          const candidate = item as { id?: unknown };
          return typeof candidate.id === "string" ? candidate.id : null;
        })
        .filter((item): item is string => item !== null)
        .map((item) => item.trim())
        .sort()
    : null;
  const skippedCases = Array.isArray(record.skippedCases)
    ? record.skippedCases
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          const candidate = item as { id?: unknown; reason?: unknown };
          if (typeof candidate.id !== "string") return null;
          if (typeof candidate.reason !== "string") return null;
          return `${candidate.id}:::${candidate.reason}`;
        })
        .filter((item): item is string => item !== null)
        .sort()
    : null;
  const contactsRowCount =
    typeof record.contactsRowCount === "number"
      ? record.contactsRowCount
      : typeof record.contactsRowCount === "string"
        ? Number(record.contactsRowCount)
        : null;
  const mattersRowCount =
    typeof record.mattersRowCount === "number"
      ? record.mattersRowCount
      : typeof record.mattersRowCount === "string"
        ? Number(record.mattersRowCount)
        : null;

  if (
    includedCaseIds === null ||
    includedCaseNumbers === null ||
    includedCases === null ||
    skippedCases === null ||
    contactsRowCount === null ||
    mattersRowCount === null
  ) {
    return null;
  }

  return {
    includedCaseIds,
    includedCaseNumbers,
    includedCases,
    skippedCases,
    contactsRowCount,
    mattersRowCount,
  };
}

function isSameReplayManifestSignature(
  left: ReplayManifestSignature,
  right: ReplayManifestSignature
): boolean {
  return (
    left.contactsRowCount === right.contactsRowCount &&
    left.mattersRowCount === right.mattersRowCount &&
    left.includedCaseIds.length === right.includedCaseIds.length &&
    left.includedCaseNumbers.length === right.includedCaseNumbers.length &&
    left.includedCases.length === right.includedCases.length &&
    left.skippedCases.length === right.skippedCases.length &&
    left.includedCaseIds.every((value, index) => value === right.includedCaseIds[index]) &&
    left.includedCaseNumbers.every((value, index) => value === right.includedCaseNumbers[index]) &&
    left.includedCases.every((value, index) => value === right.includedCases[index]) &&
    left.skippedCases.every((value, index) => value === right.skippedCases[index])
  );
}

function getClioIdempotencyKey(req: Parameters<typeof auth>[0]): string | null {
  const raw = req.get("Idempotency-Key");
  return trimToNull(raw);
}

const IDEMPOTENCY_LEGACY_REPLAY_ERROR =
  "This Idempotency-Key refers to a legacy export that cannot be safely replayed. Send allowReexport=true to force a fresh export.";
const IDEMPOTENCY_CHANGED_REPLAY_ERROR =
  "This Idempotency-Key cannot be replayed because batch export data changed since the prior handoff.";

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

router.post("/batches/:batchId/review/ready-for-handoff", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const batchId = String(req.params.batchId ?? "");
    const actor =
      ((req as any).apiKeyPrefix as string | null | undefined) ??
      ((req as any).userId as string | null | undefined) ??
      "migration-reviewer";
    const result = await finalizeMigrationBatchForClioHandoff(firmId, batchId, actor);
    if (!result.ok) {
      return res.status(409).json({ ok: false, error: result.error, ...result.detail });
    }
    return res.json({ ok: true, markedExportReadyCount: result.markedExportReadyCount, ...result.detail });
  } catch (e: any) {
    const message = String(e?.message ?? e);
    const status = message === "Migration batch not found" ? 404 : 500;
    res.status(status).json({ ok: false, error: message });
  }
});

router.get("/batches/:batchId/exports/clio/handoff/:exportId", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const batchId = String(req.params.batchId ?? "");
    const exportId = String(req.params.exportId ?? "");
    const archive = await getStoredBatchClioHandoffArchive({ firmId, batchId, exportId });
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${archive.fileName}"`);
    res.send(archive.buffer);
  } catch (e: any) {
    const message = String(e?.message ?? e);
    const status =
      message === "Migration batch handoff archive not found"
        ? 404
        : message === "Stored Clio handoff archive unavailable for this export."
          ? 409
          : 500;
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

router.get("/batches/:batchId/exports/clio/contacts.xlsx", auth, requireRole(Role.STAFF), async (req, res) => {
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
    const xlsx = await generateClioContactsXlsx(firmId, {
      caseIds: preview.manifest.includedCaseIds,
      preserveCaseOrder: true,
    });
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${preview.contactsFileName.replace(/\\.csv$/i, ".xlsx")}"`
    );
    res.send(xlsx);
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

router.get("/batches/:batchId/exports/clio/matters.xlsx", auth, requireRole(Role.STAFF), async (req, res) => {
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
    const xlsx = await generateClioMattersXlsx(firmId, {
      caseIds: preview.manifest.includedCaseIds,
      preserveCaseOrder: true,
    });
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${preview.mattersFileName.replace(/\\.csv$/i, ".xlsx")}"`
    );
    res.send(xlsx);
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
    const batchDetail = await getMigrationBatchDetail(firmId, batchId);
    const currentCaseIds = [...batchDetail.exportSummary.exportReadyCaseIds].sort();
    if (currentCaseIds.length === 0) {
      return res.status(409).json({
        ok: false,
        error:
          batchDetail.exportSummary.blockedReason ??
          "No routed cases in this migration batch are currently ready for Clio handoff.",
        skippedCases: [],
        exportSummary: batchDetail.exportSummary,
        handoffReadiness: batchDetail.handoffReadiness,
      });
    }

    const requestFingerprint = [
      "migration_batch",
      batchId,
      allowReexport ? "reexport" : "first_export",
      currentCaseIds.join(","),
    ].join(":");
    const idempotencyKey = getClioIdempotencyKey(req);
    const duplicate = await findRecentClioHandoffDuplicate({
      firmId,
      exportType: ClioHandoffExportType.BATCH,
      exportSubtype: ClioHandoffExportSubtype.COMBINED_BATCH,
      idempotencyKey,
      requestFingerprint,
    });

    if (duplicate) {
      if (
        duplicate.reExportOverride !== allowReexport ||
        (duplicate.reExportReason ?? null) !== reExportReason
      ) {
        return res.status(409).json({
          ok: false,
          error: "This Idempotency-Key was already used for a different Clio handoff export request.",
        });
      }
      const replayCurrentPreview = await buildBatchClioHandoffExport({
        firmId,
        caseIds: currentCaseIds,
        allowReexport: true,
      });
      const persistedReplaySignature = readReplayManifestSignature(duplicate.manifestJson);
      const currentReplaySignature = buildReplayManifestSignature(replayCurrentPreview);
      if (persistedReplaySignature === null) {
        await recordClioHandoffAuditEvent({
          firmId,
          batchId,
          handoffExportId: duplicate.id,
          hasIdempotencyKey: idempotencyKey !== null,
          outcomeType: "replay_rejected_legacy",
          reason: "legacy export cannot be safely replayed",
          requestFingerprint,
        });
        return res.status(409).json({
          ok: false,
          error: IDEMPOTENCY_LEGACY_REPLAY_ERROR,
        });
      }
      if (!isSameReplayManifestSignature(persistedReplaySignature, currentReplaySignature)) {
        await recordClioHandoffAuditEvent({
          firmId,
          batchId,
          handoffExportId: duplicate.id,
          hasIdempotencyKey: idempotencyKey !== null,
          outcomeType: "replay_rejected_data_changed",
          reason: "manifest changed since prior handoff",
          requestFingerprint,
        });
        return res.status(409).json({
          ok: false,
          error: IDEMPOTENCY_CHANGED_REPLAY_ERROR,
        });
      }
      const replayCaseIds = readIncludedCaseIdsFromManifestJson(duplicate.manifestJson);
      if (replayCaseIds.length === 0) {
        return res.status(409).json({
          ok: false,
          error: "Stored Clio handoff replay data is missing included case ids.",
        });
      }
      const replayPreview = await buildBatchClioHandoffExport({
        firmId,
        caseIds: replayCaseIds,
        allowReexport: true,
        exportedAt: duplicate.exportedAt,
      });
      await recordClioHandoffAuditEvent({
        firmId,
        batchId,
        handoffExportId: duplicate.id,
        hasIdempotencyKey: idempotencyKey !== null,
        outcomeType: "replay_success",
        requestFingerprint,
      });
      await linkMigrationBatchToClioHandoff(firmId, batchId, duplicate.id);
      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", `attachment; filename="${replayPreview.fileName}"`);
      return res.send(replayPreview.zipBuffer);
    } else {
      let overrideForcesFreshExport = false;
      if (idempotencyKey) {
        const sameKeyDuplicate = await findRecentClioHandoffDuplicate({
          firmId,
          exportType: ClioHandoffExportType.BATCH,
          exportSubtype: ClioHandoffExportSubtype.COMBINED_BATCH,
          idempotencyKey,
        });
        if (sameKeyDuplicate) {
          const isSameBatchDuplicate =
            allowReexport &&
            (await prisma.migrationBatchClioHandoff.findFirst({
              where: { batchId, clioHandoffExportId: sameKeyDuplicate.id },
              select: { id: true },
            })) !== null;
          if (!allowReexport || !isSameBatchDuplicate) {
            return res.status(409).json({
              ok: false,
              error: "This Idempotency-Key was already used for a different Clio handoff export request.",
            });
          }
          overrideForcesFreshExport = true;
        }
      }

      const recordIdempotencyKey =
        overrideForcesFreshExport ? null : idempotencyKey;
      const preview = await buildBatchClioHandoffExport({
        firmId,
        caseIds: currentCaseIds,
        allowReexport,
      });
      const exportRecord = await recordBatchClioHandoff({
        firmId,
        actor,
        idempotencyKey: recordIdempotencyKey,
        requestFingerprint,
        reExportOverride: allowReexport,
        reExportReason,
        batchResult: preview,
      });
      await linkMigrationBatchToClioHandoff(firmId, batchId, exportRecord.id);
      if (overrideForcesFreshExport) {
        await recordClioHandoffAuditEvent({
          firmId,
          batchId,
          handoffExportId: exportRecord.id,
          hasIdempotencyKey: idempotencyKey !== null,
          outcomeType: "forced_reexport",
          reason: reExportReason ?? "operator override",
          requestFingerprint,
        });
      }
      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", `attachment; filename="${preview.fileName}"`);
      return res.send(preview.zipBuffer);
    }
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

router.get("/system-readiness", auth, requireRole(Role.STAFF), async (_req, res) => {
  try {
    const result = await computeMigrationSystemReadiness();
    res.json({ ok: true, readiness: result.readiness, warnings: result.warnings, nextActions: result.nextActions });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[migration/system-readiness GET]", e);
    res.status(500).json({ ok: false, error: msg });
  }
});

export default router;
