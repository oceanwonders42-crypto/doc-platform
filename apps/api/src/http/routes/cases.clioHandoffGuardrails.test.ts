/**
 * Route-level regression test for Clio handoff duplicate guardrails and idempotency.
 * Run: pnpm -C apps/api exec tsx src/http/routes/cases.clioHandoffGuardrails.test.ts
 */
import "dotenv/config";

import {
  ClioHandoffCaseStatus,
  ClioHandoffExportSubtype,
  ClioHandoffExportType,
  Role,
} from "@prisma/client";

process.env.ENABLE_INLINE_DOCUMENT_WORKER = "false";

import { prisma } from "../../db/prisma";
import { signToken } from "../../lib/jwt";
import { app } from "../server";
import {
  assert,
  getHeader,
  parseZip,
  ROUTE_PATH,
  startTestServer,
  stopTestServer,
  type BatchClioRouteManifest,
} from "./cases.batchClioRouteTestUtils";

const TARGET_CASE_IDS = ["demo-case-1", "demo-case-2", "demo-case-4"];

async function deleteTargetExports(firmId: string) {
  await prisma.clioHandoffExport.deleteMany({
    where: {
      firmId,
      memberships: {
        some: {
          caseId: { in: TARGET_CASE_IDS },
        },
      },
    },
  });
}

async function main() {
  const seededCase = await prisma.legalCase.findUnique({
    where: { id: "demo-case-1" },
    select: { firmId: true },
  });
  assert(!!seededCase, "Seeded demo-case-1 was not found. Run pnpm run bootstrap:dev in apps/api first.");

  const firmId = seededCase!.firmId;
  await deleteTargetExports(firmId);

  const token = signToken({
    userId: "clio-handoff-guardrails-route-user",
    firmId,
    role: Role.STAFF,
    email: "guardrails-route@example.com",
  });

  const { baseUrl, server } = await startTestServer(app);

  try {
    const firstSingle = await fetch(`${baseUrl}/cases/demo-case-1/exports/clio/contacts.csv`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Idempotency-Key": "single-first-export",
      },
    });
    assert(firstSingle.status === 200, `Expected first single-case export to succeed, got ${firstSingle.status}`);
    assert(getHeader(firstSingle, "content-type").includes("text/csv"), "Single-case export should return CSV.");

    const blockedSingle = await fetch(`${baseUrl}/cases/demo-case-1/exports/clio/contacts.csv`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert(blockedSingle.status === 409, `Expected duplicate single-case export to be blocked, got ${blockedSingle.status}`);
    const blockedSingleJson = (await blockedSingle.json()) as { error?: string };
    assert(
      blockedSingleJson.error === "This case has already been handed off to Clio. Turn on re-export anyway to export it again.",
      `Unexpected duplicate single-case error: ${blockedSingleJson.error}`
    );

    const reExportSingle = await fetch(`${baseUrl}/cases/demo-case-1/exports/clio/contacts.csv`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Idempotency-Key": "single-reexport",
        "X-Clio-Reexport": "true",
        "X-Clio-Reexport-Reason": "operator_override",
      },
    });
    assert(reExportSingle.status === 200, `Expected explicit single-case re-export to succeed, got ${reExportSingle.status}`);

    const replayedSingle = await fetch(`${baseUrl}/cases/demo-case-1/exports/clio/contacts.csv`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Idempotency-Key": "single-reexport",
        "X-Clio-Reexport": "true",
        "X-Clio-Reexport-Reason": "operator_override",
      },
    });
    assert(replayedSingle.status === 200, `Expected replayed single-case re-export to succeed, got ${replayedSingle.status}`);
    assert(
      replayedSingle.headers.get("x-clio-idempotent-replay") === "true",
      "Expected replayed single-case request to be marked as an idempotent replay."
    );

    const singleExports = await prisma.clioHandoffExport.findMany({
      where: {
        firmId,
        exportType: ClioHandoffExportType.SINGLE_CASE,
        exportSubtype: ClioHandoffExportSubtype.CONTACTS,
        memberships: {
          some: {
            caseId: "demo-case-1",
            status: ClioHandoffCaseStatus.INCLUDED,
          },
        },
      },
      orderBy: [{ exportedAt: "asc" }, { createdAt: "asc" }],
      include: { memberships: true },
    });
    assert(singleExports.length === 2, `Expected 2 tracked single-case exports after replay dedupe, got ${singleExports.length}`);
    assert(singleExports[0]?.reExportOverride === false, "First single-case export should not be a re-export.");
    assert(singleExports[1]?.reExportOverride === true, "Second single-case export should record the re-export override.");
    assert(singleExports[1]?.reExportReason === "operator_override", "Second single-case export should record the override reason.");
    assert(singleExports[1]?.memberships[0]?.isReExport === true, "Second single-case export membership should be marked as a re-export.");

    const defaultBatch = await fetch(`${baseUrl}${ROUTE_PATH}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Idempotency-Key": "batch-default",
      },
      body: JSON.stringify({ caseIds: ["demo-case-1", "demo-case-4"] }),
    });
    assert(defaultBatch.status === 200, `Expected default batch export to succeed, got ${defaultBatch.status}`);
    assert(getHeader(defaultBatch, "content-type").includes("application/zip"), "Default batch response should be a ZIP.");
    const defaultBatchZip = await parseZip(defaultBatch);
    const defaultManifestText = await defaultBatchZip.file("manifest.json")?.async("string");
    assert(typeof defaultManifestText === "string", "Default batch ZIP should include manifest.json.");
    const defaultManifest = JSON.parse(defaultManifestText!) as BatchClioRouteManifest & {
      reexportedCaseIds?: string[];
      reexportedCaseNumbers?: string[];
    };
    assert(
      JSON.stringify(defaultManifest.includedCaseIds) === JSON.stringify([]),
      `Expected default batch export to exclude already-exported demo-case-1 and keep unready demo-case-4 skipped, got ${JSON.stringify(defaultManifest.includedCaseIds)}`
    );
    assert(
      defaultManifest.skippedCases.some(
        (item) =>
          item.id === "demo-case-1" &&
          item.reason.includes("Already handed off to Clio")
      ),
      "Default batch manifest should report demo-case-1 as skipped because it was already handed off."
    );

    const overrideBatch = await fetch(`${baseUrl}${ROUTE_PATH}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Idempotency-Key": "batch-reexport",
      },
      body: JSON.stringify({
        caseIds: TARGET_CASE_IDS,
        allowReexport: true,
        reexportReason: "operator_override",
      }),
    });
    assert(overrideBatch.status === 200, `Expected override batch export to succeed, got ${overrideBatch.status}`);
    const overrideBatchZip = await parseZip(overrideBatch);
    const overrideManifestText = await overrideBatchZip.file("manifest.json")?.async("string");
    assert(typeof overrideManifestText === "string", "Override batch ZIP should include manifest.json.");
    const overrideManifest = JSON.parse(overrideManifestText!) as BatchClioRouteManifest & {
      reexportedCaseIds: string[];
      reexportedCaseNumbers: string[];
    };
    assert(
      JSON.stringify(overrideManifest.includedCaseIds) === JSON.stringify(["demo-case-1", "demo-case-2"]),
      `Expected override batch export to include re-exported case, got ${JSON.stringify(overrideManifest.includedCaseIds)}`
    );
    assert(
      JSON.stringify(overrideManifest.reexportedCaseIds) === JSON.stringify(["demo-case-1"]),
      `Expected override batch manifest to mark demo-case-1 as re-exported, got ${JSON.stringify(overrideManifest.reexportedCaseIds)}`
    );

    const replayedBatch = await fetch(`${baseUrl}${ROUTE_PATH}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Idempotency-Key": "batch-reexport",
      },
      body: JSON.stringify({
        caseIds: TARGET_CASE_IDS,
        allowReexport: true,
        reexportReason: "operator_override",
      }),
    });
    assert(replayedBatch.status === 200, `Expected replayed batch export to succeed, got ${replayedBatch.status}`);
    assert(
      replayedBatch.headers.get("x-clio-idempotent-replay") === "true",
      "Expected replayed batch request to be marked as an idempotent replay."
    );

    const batchExports = await prisma.clioHandoffExport.findMany({
      where: {
        firmId,
        exportType: ClioHandoffExportType.BATCH,
        exportSubtype: ClioHandoffExportSubtype.COMBINED_BATCH,
      },
      orderBy: [{ exportedAt: "asc" }, { createdAt: "asc" }],
      include: { memberships: true },
    });
    assert(batchExports.length === 2, `Expected 2 tracked batch exports after replay dedupe, got ${batchExports.length}`);
    const defaultBatchRecord = batchExports.find((item) => item.idempotencyKey === "batch-default");
    const overrideBatchRecord = batchExports.find((item) => item.idempotencyKey === "batch-reexport");
    assert(!!defaultBatchRecord, "Expected tracked default batch export record.");
    assert(!!overrideBatchRecord, "Expected tracked override batch export record.");
    assert(
      defaultBatchRecord!.memberships.some(
        (item) =>
          item.caseId === "demo-case-1" &&
          item.status === ClioHandoffCaseStatus.SKIPPED &&
          (item.skipReason ?? "").includes("Already handed off to Clio")
      ),
      "Default batch export should record demo-case-1 as skipped because it was already handed off."
    );
    assert(
      defaultBatchRecord!.memberships.some(
        (item) =>
          item.caseId === "demo-case-4" &&
          item.status === ClioHandoffCaseStatus.SKIPPED &&
          item.skipReason === "This case has no routed documents to export yet."
      ),
      "Default batch export should record unready demo-case-4 as skipped."
    );
    assert(
      overrideBatchRecord!.reExportOverride === true &&
        overrideBatchRecord!.reExportReason === "operator_override",
      "Override batch export should persist override metadata."
    );
    assert(
      overrideBatchRecord!.memberships.some(
        (item) =>
          item.caseId === "demo-case-1" &&
          item.status === ClioHandoffCaseStatus.INCLUDED &&
          item.isReExport === true
      ),
      "Override batch export should mark demo-case-1 as a re-exported included case."
    );

    console.log("Clio handoff guardrail route tests passed");
  } finally {
    await stopTestServer(server);
    await deleteTargetExports(firmId);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
