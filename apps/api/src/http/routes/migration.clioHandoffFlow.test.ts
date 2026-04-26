import "dotenv/config";

import { ClioHandoffExportSubtype, ClioHandoffExportType, Role } from "@prisma/client";

process.env.ENABLE_INLINE_DOCUMENT_WORKER = "false";

import { pgPool } from "../../db/pg";
import { prisma } from "../../db/prisma";
import { signToken } from "../../lib/jwt";
import { redis } from "../../services/queue";
import { s3 } from "../../services/storage";
import { app } from "../server";
import {
  assert,
  getHeader,
  parseZip,
  startTestServer,
  stopTestServer,
  type BatchClioRouteManifest,
} from "./cases.batchClioRouteTestUtils";

type ClioHandoffAuditMeta = {
  batchId: string;
  handoffExportId: string | null;
  hasIdempotencyKey: boolean;
  outcomeType: "replay_success" | "replay_rejected_legacy" | "replay_rejected_data_changed" | "forced_reexport";
  requestFingerprint: string | null;
  reason: string | null;
};

type ClioHandoffAuditReviewItem = {
  id: string;
  createdAt: string;
  outcomeType:
    | "replay_success"
    | "replay_rejected_legacy"
    | "replay_rejected_data_changed"
    | "forced_reexport"
    | "unknown";
  batchId: string | null;
  handoffExportId: string | null;
  hasIdempotencyKey: boolean;
  reason: string | null;
};

async function assertLatestClioHandoffAuditOutcome(params: {
  firmId: string;
  outcomeType: ClioHandoffAuditMeta["outcomeType"];
  expectedHandoffExportId?: string | null;
  expectsIdempotencyKey?: boolean;
}) {
  const { firmId, outcomeType, expectedHandoffExportId, expectsIdempotencyKey } = params;
  const logs = await prisma.systemErrorLog.findMany({
    where: { firmId, area: "clio_handoff_audit" },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { id: true, metaJson: true },
  });
  const matching = logs.find((log) => {
    const meta = log.metaJson as unknown as Partial<ClioHandoffAuditMeta>;
    return meta?.outcomeType === outcomeType;
  });
  assert(matching !== undefined, `Expected clio handoff audit outcome '${outcomeType}'.`);
  const meta = matching!.metaJson as unknown as ClioHandoffAuditMeta;
  if (expectsIdempotencyKey !== undefined) {
    assert(
      meta.hasIdempotencyKey === expectsIdempotencyKey,
      `Expected audit outcome '${outcomeType}' to record idempotency key presence ${expectsIdempotencyKey}.`
    );
  }
  if (expectedHandoffExportId !== undefined) {
    assert(
      meta.handoffExportId === expectedHandoffExportId,
      `Expected audit outcome '${outcomeType}' to include handoff export id ${expectedHandoffExportId}, got ${meta.handoffExportId}`
    );
  }
}

async function fetchClioHandoffAuditItems(params: {
  baseUrl: string;
  token: string;
  outcomeType?: ClioHandoffAuditMeta["outcomeType"];
  limit?: number;
}): Promise<ClioHandoffAuditReviewItem[]> {
  const { baseUrl, token, outcomeType, limit = 100 } = params;
  const query = new URLSearchParams({ limit: String(limit), ...(outcomeType ? { outcomeType } : {}) });
  const response = await fetch(`${baseUrl}/me/clio-handoff-audit?${query.toString()}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  assert(response.status === 200, `Expected clio handoff audit endpoint to return 200, got ${response.status}`);
  const payload = (await response.json()) as { ok?: boolean; items?: ClioHandoffAuditReviewItem[] };
  assert(payload.ok === true, "Expected clio handoff audit endpoint response to be ok.");
  assert(Array.isArray(payload.items), "Expected clio handoff audit endpoint to return an items array.");
  return payload.items ?? [];
}

async function main() {
  const suffix = Date.now();
  const firmId = `migration-clio-flow-firm-${suffix}`;
  const actorUserId = `migration-clio-flow-user-${suffix}`;
  const caseId = `migration-clio-flow-case-${suffix}`;
  const contactId = `migration-clio-flow-contact-${suffix}`;
  const idempotencyKey = `migration-clio-flow-${suffix}`;
  const legacyIdempotencyKey = `migration-clio-flow-legacy-${suffix}`;
  const originalSend = s3.send.bind(s3);
  const originalLpush = redis.lpush.bind(redis);
  const clioHandoffExportDelegate = prisma.clioHandoffExport as any;
  const originalFindFirst = clioHandoffExportDelegate.findFirst.bind(clioHandoffExportDelegate);
  const duplicateLookupWhereClauses: Array<Record<string, unknown>> = [];

  await prisma.firm.create({
    data: {
      id: firmId,
      name: "Migration Clio Flow Test Firm",
    },
  });

  await prisma.user.create({
    data: {
      id: actorUserId,
      firmId,
      email: "migration-clio-flow@example.com",
      role: Role.STAFF,
      passwordHash: "test-hash",
    },
  });

  await prisma.contact.create({
    data: {
      id: contactId,
      firmId,
      fullName: "Taylor Migration",
      firstName: "Taylor",
      lastName: "Migration",
      email: `taylor-migration-${suffix}@example.com`,
    },
  });

  await prisma.legalCase.create({
    data: {
      id: caseId,
      firmId,
      title: "Migration Flow Matter",
      caseNumber: `MIG-${suffix}`,
      clientName: "Taylor Migration",
      clientContactId: contactId,
      status: "open",
    },
  });

  (s3 as any).send = async () => ({});
  (redis as any).lpush = async () => 1;

  const token = signToken({
    userId: actorUserId,
    firmId,
    role: Role.STAFF,
    email: "migration-clio-flow@example.com",
  });

  const { baseUrl, server } = await startTestServer(app);
  let createdBatchId: string | null = null;
  let documentIds: string[] = [];
  let secondBatchId: string | null = null;
  let secondDocumentIds: string[] = [];
  let secondContactId: string | null = null;
  let secondCaseId: string | null = null;
  let driftContactId: string | null = null;
  let driftCaseId: string | null = null;
  let firstHandoffExportId: string | null = null;
  let legacyHandoffExportId: string | null = null;
  let mainError: unknown = null;

  try {
    clioHandoffExportDelegate.findFirst = async (args: Parameters<typeof prisma.clioHandoffExport.findFirst>[0]) => {
      duplicateLookupWhereClauses.push((args?.where ?? {}) as Record<string, unknown>);
      return null;
    };

    const formData = new FormData();
    formData.append("label", "Migration to Clio flow");
    formData.append("files", new Blob([Buffer.from("scan one")], { type: "application/pdf" }), "scan-one.pdf");
    formData.append("files", new Blob([Buffer.from("scan two")], { type: "application/pdf" }), "scan-two.pdf");

    const importResponse = await fetch(`${baseUrl}/migration/import`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });
    assert(importResponse.status === 201, `Expected migration import route to return 201, got ${importResponse.status}`);
    const importJson = (await importResponse.json()) as {
      ok?: boolean;
      batchId?: string;
      documentIds?: string[];
      importedCount?: number;
    };
    assert(importJson.ok === true, "Expected migration import response to be ok.");
    assert(typeof importJson.batchId === "string" && importJson.batchId.length > 0, "Expected batchId to be returned.");
    assert((importJson.documentIds?.length ?? 0) === 2, `Expected 2 imported documents, got ${importJson.documentIds?.length ?? 0}`);
    createdBatchId = importJson.batchId ?? null;
    documentIds = importJson.documentIds ?? [];

    await prisma.document.updateMany({
      where: { id: { in: documentIds }, firmId },
      data: {
        status: "UPLOADED",
        processingStage: "complete",
        reviewState: "APPROVED",
        routedCaseId: caseId,
        routedSystem: "manual",
        routingStatus: "routed",
        processedAt: new Date(),
        pageCount: 1,
        confidence: 0.99,
      },
    });
    await pgPool.query(
      `insert into document_recognition
        (document_id, client_name, case_number, doc_type, confidence, match_confidence, match_reason, updated_at)
       select
        unnest($1::text[]),
        $2,
        $3,
        'medical_record',
        0.99,
        0.99,
        'Manual migration test route',
        now()
       on conflict (document_id) do update set
        client_name = excluded.client_name,
        case_number = excluded.case_number,
        doc_type = excluded.doc_type,
        confidence = excluded.confidence,
        match_confidence = excluded.match_confidence,
        match_reason = excluded.match_reason,
        updated_at = now()`,
      [documentIds, "Taylor Migration", `MIG-${suffix}`]
    );

    const readyDetailResponse = await fetch(`${baseUrl}/migration/batches/${createdBatchId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert(readyDetailResponse.status === 200, `Expected ready detail response to return 200, got ${readyDetailResponse.status}`);
    const readyDetail = (await readyDetailResponse.json()) as {
      ok?: boolean;
      batch?: { status?: string };
      exportSummary?: {
        readyForClioExport?: boolean;
        routedCaseIds?: string[];
        exportReadyCaseIds?: string[];
        blockedReason?: string | null;
        handoffCount?: number;
      };
      handoffReadiness?: {
        state?: string;
        canFinalize?: boolean;
      };
      handoffHistory?: unknown[];
    };
    assert(readyDetail.ok === true, "Expected ready detail payload to be ok.");
    assert(readyDetail.batch?.status === "NEEDS_REVIEW", `Expected batch status NEEDS_REVIEW before finalize, got ${readyDetail.batch?.status}`);
    assert(readyDetail.exportSummary?.readyForClioExport === false, "Expected batch to stay blocked before finalize.");
    assert(
      readyDetail.exportSummary?.routedCaseIds?.includes(caseId) === true,
      "Expected routed case id to appear in export summary."
    );
    assert(
      (readyDetail.exportSummary?.exportReadyCaseIds?.length ?? 0) === 0,
      "Expected no export-ready case ids before finalize."
    );
    assert(
      readyDetail.exportSummary?.blockedReason === "Finalize approved routed documents before downloading the Clio handoff package.",
      `Unexpected blockedReason before finalize: ${readyDetail.exportSummary?.blockedReason}`
    );
    assert(
      readyDetail.handoffReadiness?.state === "NEEDS_REVIEW" &&
        readyDetail.handoffReadiness?.canFinalize === true,
      "Expected handoff readiness to require finalize before export."
    );
    assert((readyDetail.handoffHistory?.length ?? 0) === 0, "Expected no handoff history before export.");

    const finalizeResponse = await fetch(`${baseUrl}/migration/batches/${createdBatchId}/review/ready-for-handoff`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });
    assert(finalizeResponse.status === 200, `Expected finalize route to return 200, got ${finalizeResponse.status}`);
    const finalizeJson = (await finalizeResponse.json()) as {
      ok?: boolean;
      markedExportReadyCount?: number;
      batch?: { status?: string };
      exportSummary?: {
        readyForClioExport?: boolean;
        exportReadyCaseIds?: string[];
      };
      handoffReadiness?: {
        state?: string;
      };
    };
    assert(finalizeJson.ok === true, "Expected finalize response to be ok.");
    assert(
      finalizeJson.markedExportReadyCount === 2,
      `Expected finalize route to mark 2 docs export-ready, got ${finalizeJson.markedExportReadyCount}`
    );
    assert(
      finalizeJson.batch?.status === "READY_FOR_EXPORT",
      `Expected batch status READY_FOR_EXPORT after finalize, got ${finalizeJson.batch?.status}`
    );
    assert(
      finalizeJson.exportSummary?.readyForClioExport === true &&
        finalizeJson.exportSummary?.exportReadyCaseIds?.includes(caseId) === true,
      "Expected finalize route to make the batch export-ready."
    );
    assert(
      finalizeJson.handoffReadiness?.state === "READY_FOR_HANDOFF",
      `Expected READY_FOR_HANDOFF after finalize, got ${finalizeJson.handoffReadiness?.state}`
    );

    const exportResponse = await fetch(`${baseUrl}/migration/batches/${createdBatchId}/exports/clio/handoff`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({}),
    });
    assert(exportResponse.status === 200, `Expected handoff route to return 200, got ${exportResponse.status}`);
    assert(getHeader(exportResponse, "content-type").includes("application/zip"), "Expected ZIP handoff response.");
    assert(exportResponse.headers.get("X-Clio-Idempotent-Replay") == null, "First handoff should not be marked as a replay.");
    assert(
      duplicateLookupWhereClauses.length > 0,
      "Expected the migration handoff route to consult duplicate tracking."
    );
    assert(
      duplicateLookupWhereClauses[0]?.exportType === ClioHandoffExportType.BATCH,
      `Expected duplicate lookup to be scoped to batch exports, got ${String(
        duplicateLookupWhereClauses[0]?.exportType
      )}`
    );
    assert(
      duplicateLookupWhereClauses[0]?.exportSubtype === ClioHandoffExportSubtype.COMBINED_BATCH,
      `Expected duplicate lookup to be scoped to combined batch exports, got ${String(
        duplicateLookupWhereClauses[0]?.exportSubtype
      )}`
    );
    clioHandoffExportDelegate.findFirst = originalFindFirst;

    const exportZip = await parseZip(exportResponse);
    const manifestText = await exportZip.file("manifest.json")?.async("string");
    assert(typeof manifestText === "string" && manifestText.trim().length > 0, "Expected manifest.json in handoff ZIP.");
    const manifest = JSON.parse(manifestText!) as BatchClioRouteManifest;
    assert(manifest.includedCaseIds.includes(caseId), "Expected manifest to include the routed case.");

    const exportsAfterFirstRun = await prisma.clioHandoffExport.findMany({
      where: {
        firmId,
        memberships: {
          some: {
            caseId,
          },
        },
      },
      include: {
        memberships: true,
        migrationBatchHandoffs: true,
      },
    });
    assert(exportsAfterFirstRun.length === 1, `Expected 1 persisted handoff export, got ${exportsAfterFirstRun.length}`);
    firstHandoffExportId = exportsAfterFirstRun[0]?.id ?? null;
    assert(
      firstHandoffExportId !== null && firstHandoffExportId.length > 0,
      "Expected the first handoff export record id to be present."
    );
    assert(
      exportsAfterFirstRun[0]?.memberships.some((membership) => membership.caseId === caseId && membership.status === "INCLUDED") === true,
      "Expected persisted handoff export to include the migration case."
    );
    assert(
      exportsAfterFirstRun[0]?.migrationBatchHandoffs.some((item) => item.batchId === createdBatchId) === true,
      "Expected migration batch to be linked to the persisted Clio handoff export."
    );

    const legacyExportResponse = await fetch(`${baseUrl}/migration/batches/${createdBatchId}/exports/clio/handoff`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Idempotency-Key": legacyIdempotencyKey,
      },
      body: JSON.stringify({}),
    });
    assert(
      legacyExportResponse.status === 200,
      `Expected legacy base handoff to return 200, got ${legacyExportResponse.status}`
    );
    await parseZip(legacyExportResponse);

    const legacyExports = await prisma.clioHandoffExport.findMany({
      where: {
        firmId,
        idempotencyKey: legacyIdempotencyKey,
      },
      include: {
        migrationBatchHandoffs: true,
      },
      orderBy: [{ exportedAt: "desc" }, { createdAt: "desc" }],
    });
    assert(legacyExports.length === 1, `Expected one legacy export record, got ${legacyExports.length}`);
    const legacyExport = legacyExports[0];
    legacyHandoffExportId = legacyExport?.id ?? null;
    assert(
      legacyExport?.migrationBatchHandoffs.some((item) => item.batchId === createdBatchId) === true,
      "Expected legacy export to be linked to the migration batch."
    );
    await prisma.clioHandoffExport.update({
      where: { id: legacyExport.id },
      data: { manifestJson: {} },
    });

    const legacyReplayResponse = await fetch(`${baseUrl}/migration/batches/${createdBatchId}/exports/clio/handoff`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Idempotency-Key": legacyIdempotencyKey,
      },
      body: JSON.stringify({}),
    });
    assert(
      legacyReplayResponse.status === 409,
      `Expected legacy replay attempt to return 409, got ${legacyReplayResponse.status}`
    );
    const legacyReplayJson = (await legacyReplayResponse.json()) as { ok?: boolean; error?: string };
    assert(legacyReplayJson.ok === false, "Expected legacy replay response to be not ok.");
    assert(
      String(legacyReplayJson.error ?? "").includes("cannot be safely replayed"),
      `Expected explicit legacy replay reason, got ${legacyReplayJson.error}`
    );
    await assertLatestClioHandoffAuditOutcome({
      firmId,
      outcomeType: "replay_rejected_legacy",
      expectedHandoffExportId: legacyHandoffExportId,
      expectsIdempotencyKey: true,
    });

    const legacyOverrideResponse = await fetch(`${baseUrl}/migration/batches/${createdBatchId}/exports/clio/handoff`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Idempotency-Key": legacyIdempotencyKey,
      },
      body: JSON.stringify({ allowReexport: true, reexportReason: "operator_override" }),
    });
    assert(
      legacyOverrideResponse.status === 200,
      `Expected legacy override handoff to return 200, got ${legacyOverrideResponse.status}`
    );
    assert(
      getHeader(legacyOverrideResponse, "content-type").includes("application/zip"),
      "Expected legacy override handoff to return a ZIP."
    );
    const legacyOverrideRecord = await prisma.migrationBatchClioHandoff.findFirst({
      where: {
        batchId: createdBatchId!,
        firmId,
      },
      orderBy: { createdAt: "desc" },
      select: { clioHandoffExportId: true },
    });
    const legacyOverrideExportId = legacyOverrideRecord?.clioHandoffExportId;
    if (typeof legacyOverrideExportId !== "string" || legacyOverrideExportId.length === 0) {
      throw new Error("Expected legacy override handoff export id.");
    }
    const legacyOverrideExportRecord = await prisma.clioHandoffExport.findFirst({
      where: { id: legacyOverrideExportId },
    });
    if (legacyOverrideExportRecord === null) {
      throw new Error("Expected legacy override handoff export record.");
    }
    await assertLatestClioHandoffAuditOutcome({
      firmId,
      outcomeType: "forced_reexport",
      expectedHandoffExportId: legacyOverrideExportRecord.id,
      expectsIdempotencyKey: true,
    });

    const replayResponse = await fetch(`${baseUrl}/migration/batches/${createdBatchId}/exports/clio/handoff`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({}),
    });
    assert(replayResponse.status === 200, `Expected same-request handoff to return 200, got ${replayResponse.status}`);
    assert(
      replayResponse.headers.get("X-Clio-Idempotent-Replay") == null,
      "Expected rebuilt same-request handoff response to omit X-Clio-Idempotent-Replay."
    );
    await assertLatestClioHandoffAuditOutcome({
      firmId,
      outcomeType: "replay_success",
      expectedHandoffExportId: firstHandoffExportId,
      expectsIdempotencyKey: true,
    });

    await prisma.legalCase.update({
      where: { id: caseId },
      data: { caseNumber: `MIG-${suffix}-DRIFT` },
    });

    const exportsBeforeStaleReplay = await prisma.clioHandoffExport.count({
      where: {
        firmId,
        memberships: {
          some: {
            caseId,
          },
        },
      },
    });
    const staleReplayResponse = await fetch(`${baseUrl}/migration/batches/${createdBatchId}/exports/clio/handoff`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({}),
    });
    assert(staleReplayResponse.status === 409, `Expected stale replay request to return 409, got ${staleReplayResponse.status}`);
    const staleReplayJson = (await staleReplayResponse.json()) as {
      ok?: boolean;
      error?: string;
    };
    assert(staleReplayJson.ok === false, "Expected stale replay response to be not ok.");
    assert(
      String(staleReplayJson.error ?? "").includes("data changed"),
      `Expected stale replay to report changed underlying data, got ${staleReplayJson.error}`
    );
    await assertLatestClioHandoffAuditOutcome({
      firmId,
      outcomeType: "replay_rejected_data_changed",
      expectedHandoffExportId: firstHandoffExportId,
      expectsIdempotencyKey: true,
    });

    const exportsAfterReplay = await prisma.clioHandoffExport.findMany({
      where: {
        firmId,
        memberships: {
          some: {
            caseId,
          },
        },
      },
      include: {
        migrationBatchHandoffs: true,
      },
    });
    assert(
      exportsAfterReplay.length === exportsBeforeStaleReplay,
      `Expected stale replay attempt to preserve handoff export count, got ${exportsAfterReplay.length}`
    );
    assert(
      exportsAfterReplay.some((item) => item.migrationBatchHandoffs.length === 1),
      "Expected replay flow to preserve batch handoff linkage."
    );

    driftContactId = `migration-clio-flow-contact-drift-${suffix}`;
    driftCaseId = `migration-clio-flow-case-drift-${suffix}`;
    await prisma.contact.create({
      data: {
        id: driftContactId,
        firmId,
        fullName: "Case Drift",
        firstName: "Case",
        lastName: "Drift",
        email: `case-drift-${suffix}@example.com`,
      },
    });
    await prisma.legalCase.create({
      data: {
        id: driftCaseId,
        firmId,
        title: "Migration Flow Drift Matter",
        caseNumber: `MIG-DRIFT-${suffix}`,
        clientName: "Case Drift",
        clientContactId: driftContactId,
        status: "open",
      },
    });
    await prisma.document.updateMany({
      where: { id: { in: documentIds }, firmId },
      data: {
        routedCaseId: driftCaseId,
        routedSystem: "manual",
        routingStatus: "routed",
      },
    });

    const driftReplayResponse = await fetch(`${baseUrl}/migration/batches/${createdBatchId}/exports/clio/handoff`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({}),
    });
    assert(
      driftReplayResponse.status === 409,
      `Expected same-batch drift with reused idempotency key to return 409, got ${driftReplayResponse.status}`
    );
    const driftReplayJson = (await driftReplayResponse.json()) as {
      ok?: boolean;
      error?: string;
    };
    assert(driftReplayJson.ok === false, "Expected drift replay response to be not ok.");
    assert(
      String(driftReplayJson.error ?? "").includes("Idempotency-Key"),
      `Expected a clear idempotency-key conflict error for drift replay, got ${driftReplayJson.error}`
    );

    const driftDetailResponse = await fetch(`${baseUrl}/migration/batches/${createdBatchId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert(
      driftDetailResponse.status === 200,
      `Expected drift detail response to return 200, got ${driftDetailResponse.status}`
    );
    const driftDetail = (await driftDetailResponse.json()) as {
      ok?: boolean;
      batch?: { status?: string };
      exportSummary?: { handoffCount?: number; routedCaseIds?: string[] };
      handoffHistory?: unknown[];
    };
    assert(driftDetail.ok === true, "Expected drift detail payload to be ok.");
    assert(driftDetail.batch?.status === "EXPORTED", `Expected drifted batch to remain EXPORTED, got ${driftDetail.batch?.status}`);
    assert(
      (driftDetail.exportSummary?.handoffCount ?? 0) >= 1,
      `Expected at least one handoff for drifted batch, got ${driftDetail.exportSummary?.handoffCount}`
    );
    assert(
      driftDetail.exportSummary?.routedCaseIds?.includes(driftCaseId) === true,
      "Expected the drifted batch to reflect the new routed case id."
    );
    assert(
      (driftDetail.handoffHistory?.length ?? 0) >= 1,
      `Expected at least one handoff history item after drift conflict, got ${driftDetail.handoffHistory?.length ?? 0}`
    );

    secondContactId = `migration-clio-flow-contact-two-${suffix}`;
    secondCaseId = `migration-clio-flow-case-two-${suffix}`;
    await prisma.contact.create({
      data: {
        id: secondContactId!,
        firmId,
        fullName: "Jordan Migration",
        firstName: "Jordan",
        lastName: "Migration",
        email: `jordan-migration-${suffix}@example.com`,
      },
    });
    await prisma.legalCase.create({
      data: {
        id: secondCaseId!,
        firmId,
        title: "Migration Flow Matter Two",
        caseNumber: `MIG2-${suffix}`,
        clientName: "Jordan Migration",
        clientContactId: secondContactId,
        status: "open",
      },
    });

    const secondFormData = new FormData();
    secondFormData.append("label", "Migration to Clio flow 2");
    secondFormData.append(
      "files",
      new Blob([Buffer.from("scan three")], { type: "application/pdf" }),
      "scan-three.pdf"
    );

    const secondImportResponse = await fetch(`${baseUrl}/migration/import`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: secondFormData,
    });
    assert(
      secondImportResponse.status === 201,
      `Expected second migration import route to return 201, got ${secondImportResponse.status}`
    );
    const secondImportJson = (await secondImportResponse.json()) as {
      ok?: boolean;
      batchId?: string;
      documentIds?: string[];
    };
    assert(secondImportJson.ok === true, "Expected second migration import response to be ok.");
    assert(
      typeof secondImportJson.batchId === "string" && secondImportJson.batchId.length > 0,
      "Expected second batchId to be returned."
    );
    assert(
      (secondImportJson.documentIds?.length ?? 0) === 1,
      `Expected 1 imported document in the second batch, got ${secondImportJson.documentIds?.length ?? 0}`
    );
    secondBatchId = secondImportJson.batchId ?? null;
    secondDocumentIds = secondImportJson.documentIds ?? [];

    await prisma.document.updateMany({
      where: { id: { in: secondDocumentIds }, firmId },
      data: {
        status: "UPLOADED",
        processingStage: "complete",
        reviewState: "EXPORT_READY",
        routedCaseId: secondCaseId!,
        routedSystem: "manual",
        routingStatus: "routed",
        processedAt: new Date(),
        pageCount: 1,
        confidence: 0.99,
      },
    });
    await pgPool.query(
      `insert into document_recognition
        (document_id, client_name, case_number, doc_type, confidence, match_confidence, match_reason, updated_at)
       select
        unnest($1::text[]),
        $2,
        $3,
        'medical_record',
        0.99,
        0.99,
        'Manual migration test route',
        now()
       on conflict (document_id) do update set
        client_name = excluded.client_name,
        case_number = excluded.case_number,
        doc_type = excluded.doc_type,
        confidence = excluded.confidence,
        match_confidence = excluded.match_confidence,
        match_reason = excluded.match_reason,
        updated_at = now()`,
      [secondDocumentIds, "Jordan Migration", `MIG2-${suffix}`]
    );

    const conflictingReplayResponse = await fetch(
      `${baseUrl}/migration/batches/${secondBatchId}/exports/clio/handoff`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({}),
      }
    );
    assert(
      conflictingReplayResponse.status === 409,
      `Expected reused idempotency key on a different batch to return 409, got ${conflictingReplayResponse.status}`
    );
    const conflictingReplayJson = (await conflictingReplayResponse.json()) as {
      ok?: boolean;
      error?: string;
    };
    assert(conflictingReplayJson.ok === false, "Expected conflicting replay response to be not ok.");
    assert(
      String(conflictingReplayJson.error ?? "").includes("Idempotency-Key"),
      `Expected a clear idempotency-key conflict error, got ${conflictingReplayJson.error}`
    );

    const secondDetailResponse = await fetch(`${baseUrl}/migration/batches/${secondBatchId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert(
      secondDetailResponse.status === 200,
      `Expected second batch detail response to return 200, got ${secondDetailResponse.status}`
    );
    const secondDetail = (await secondDetailResponse.json()) as {
      ok?: boolean;
      batch?: { status?: string };
      exportSummary?: { handoffCount?: number };
      handoffHistory?: unknown[];
    };
    assert(secondDetail.ok === true, "Expected second batch detail payload to be ok.");
    assert(
      secondDetail.batch?.status === "READY_FOR_EXPORT",
      `Expected second batch to remain READY_FOR_EXPORT, got ${secondDetail.batch?.status}`
    );
    assert(
      secondDetail.exportSummary?.handoffCount === 0,
      `Expected second batch handoffCount=0 after conflict, got ${secondDetail.exportSummary?.handoffCount}`
    );
    assert(
      (secondDetail.handoffHistory?.length ?? 0) === 0,
      `Expected no handoff history for the conflicting second batch, got ${secondDetail.handoffHistory?.length ?? 0}`
    );

    const exportedDetailResponse = await fetch(`${baseUrl}/migration/batches/${createdBatchId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert(exportedDetailResponse.status === 200, `Expected exported detail response to return 200, got ${exportedDetailResponse.status}`);
    const exportedDetail = (await exportedDetailResponse.json()) as {
      ok?: boolean;
      batch?: { status?: string };
      exportSummary?: {
        handoffCount?: number;
        lastHandoffAt?: string | null;
      };
      handoffHistory?: Array<{ exportId?: string }>;
    };
    assert(exportedDetail.ok === true, "Expected exported detail payload to be ok.");
    assert(exportedDetail.batch?.status === "EXPORTED", `Expected batch status EXPORTED, got ${exportedDetail.batch?.status}`);
    assert(
      (exportedDetail.exportSummary?.handoffCount ?? 0) >= 1,
      `Expected at least one handoff, got ${exportedDetail.exportSummary?.handoffCount}`
    );
    assert(typeof exportedDetail.exportSummary?.lastHandoffAt === "string", "Expected last handoff timestamp after export.");
    assert((exportedDetail.handoffHistory?.length ?? 0) >= 1, `Expected at least one batch handoff history item, got ${exportedDetail.handoffHistory?.length ?? 0}`);

    const clioHandoffAuditItems = await fetchClioHandoffAuditItems({ baseUrl, token, limit: 200 });
    const outcomeTypes = new Set(clioHandoffAuditItems.map((item) => item.outcomeType));
    assert(
      outcomeTypes.has("replay_success"),
      "Expected clio handoff audit review surface to include a replay_success outcome."
    );
    assert(
      outcomeTypes.has("replay_rejected_legacy"),
      "Expected clio handoff audit review surface to include a replay_rejected_legacy outcome."
    );
    assert(
      outcomeTypes.has("replay_rejected_data_changed"),
      "Expected clio handoff audit review surface to include a replay_rejected_data_changed outcome."
    );
    assert(
      outcomeTypes.has("forced_reexport"),
      "Expected clio handoff audit review surface to include a forced_reexport outcome."
    );

    const replayLegacy = clioHandoffAuditItems.find((item) => item.outcomeType === "replay_rejected_legacy");
    const replayChanged = clioHandoffAuditItems.find((item) => item.outcomeType === "replay_rejected_data_changed");
    const replaySuccess = clioHandoffAuditItems.find((item) => item.outcomeType === "replay_success");
    const forcedReexport = clioHandoffAuditItems.find((item) => item.outcomeType === "forced_reexport");
    if (replayLegacy === undefined) throw new Error("Expected to locate replay_rejected_legacy audit review row.");
    if (replayChanged === undefined) throw new Error("Expected to locate replay_rejected_data_changed audit review row.");
    if (replaySuccess === undefined) throw new Error("Expected to locate replay_success audit review row.");
    if (forcedReexport === undefined) throw new Error("Expected to locate forced_reexport audit review row.");
    assert(replayLegacy.batchId === createdBatchId, "Expected replay_rejected_legacy item to include the migration batch id.");
    assert(replayChanged.batchId === createdBatchId, "Expected replay_rejected_data_changed item to include the migration batch id.");
    assert(replaySuccess.batchId === createdBatchId, "Expected replay_success item to include the migration batch id.");
    assert(forcedReexport.batchId === createdBatchId, "Expected forced_reexport item to include the migration batch id.");
    assert(
      replayLegacy.reason?.toLowerCase().includes("legacy") === true,
      "Expected replay_rejected_legacy item to include legacy reason."
    );
    assert(
      replayChanged.reason?.toLowerCase().includes("data changed") === true ||
        replayChanged.reason?.toLowerCase().includes("manifest") === true,
      "Expected replay_rejected_data_changed item to include changed-data reason."
    );
    assert(replaySuccess.hasIdempotencyKey === true, "Expected replay_success item to preserve idempotency flag.");
    assert(forcedReexport.hasIdempotencyKey === true, "Expected forced_reexport item to preserve idempotency flag.");

    const historyResponse = await fetch(`${baseUrl}/cases/exports/clio/history?limit=5`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert(historyResponse.status === 200, `Expected history route to return 200, got ${historyResponse.status}`);
    const historyJson = (await historyResponse.json()) as {
      ok?: boolean;
      items?: Array<{
        exportId: string;
        includedCases: Array<{ caseId: string }>;
      }>;
    };
    assert(historyJson.ok === true, "Expected history route response to be ok.");
    assert(
      historyJson.items?.some((item) => item.exportId === exportsAfterReplay[0]?.id && item.includedCases.some((entry) => entry.caseId === caseId)) === true,
      "Expected export history to include the persisted migration handoff."
    );

    console.log("Migration batch to Clio handoff flow test passed");
  } catch (error) {
    mainError = error;
    throw error;
  } finally {
    clioHandoffExportDelegate.findFirst = originalFindFirst;
    await stopTestServer(server);
    (s3 as any).send = originalSend;
    (redis as any).lpush = originalLpush;
    const cleanupErrors: string[] = [];

    try {
      const batchIds = [createdBatchId, secondBatchId].filter((value): value is string => typeof value === "string");
      const persistedDocumentIds = batchIds.length > 0
        ? (
            await prisma.document.findMany({
              where: { firmId, migrationBatchId: { in: batchIds } },
              select: { id: true },
            })
          ).map((item) => item.id)
        : [];
      const allDocumentIds = [...new Set([...documentIds, ...secondDocumentIds, ...persistedDocumentIds])];

      await prisma.migrationBatchClioHandoff.deleteMany({ where: { firmId } });
      await prisma.clioHandoffExport.deleteMany({ where: { firmId } });
      if (allDocumentIds.length > 0) {
        await pgPool.query(`delete from document_recognition where document_id = any($1)`, [allDocumentIds]);
        await prisma.documentAuditEvent.deleteMany({ where: { documentId: { in: allDocumentIds } } });
      await prisma.document.deleteMany({ where: { id: { in: allDocumentIds } } });
      }
      if (batchIds.length > 0) {
        await prisma.migrationBatch.deleteMany({ where: { id: { in: batchIds } } });
      }
      await prisma.systemErrorLog.deleteMany({
        where: { firmId, area: "clio_handoff_audit" },
      });
      await prisma.legalCase.deleteMany({ where: { id: caseId } });
      if (driftCaseId) {
        await prisma.legalCase.deleteMany({ where: { id: driftCaseId } });
      }
      if (secondCaseId) {
        await prisma.legalCase.deleteMany({ where: { id: secondCaseId } });
      }
      await prisma.contact.deleteMany({ where: { id: contactId } });
      if (driftContactId) {
        await prisma.contact.deleteMany({ where: { id: driftContactId } });
      }
      if (secondContactId) {
        await prisma.contact.deleteMany({ where: { id: secondContactId } });
      }
      await prisma.firm.deleteMany({ where: { id: firmId } });
    } catch (cleanupError) {
      const message = cleanupError instanceof Error ? cleanupError.message : String(cleanupError);
      cleanupErrors.push(message);
      if (!mainError) {
        throw cleanupError;
      }
    }

    if (cleanupErrors.length > 0 && mainError) {
      console.warn("Cleanup warning:", cleanupErrors.join(" | "));
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    const exitCode = process.exitCode ?? 0;
    await Promise.race([
      Promise.allSettled([prisma.$disconnect(), pgPool.end()]),
      new Promise((resolve) => setTimeout(resolve, 1000)),
    ]);
    process.exit(exitCode);
  });
