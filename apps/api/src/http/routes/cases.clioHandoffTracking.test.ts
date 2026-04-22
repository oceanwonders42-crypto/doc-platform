/**
 * Route-level persistence regression tests for Clio handoff tracking.
 * Run: pnpm -C apps/api exec tsx src/http/routes/cases.clioHandoffTracking.test.ts
 */
import "dotenv/config";

import { ClioHandoffCaseStatus, ClioHandoffExportSubtype, ClioHandoffExportType, Role } from "@prisma/client";

process.env.ENABLE_INLINE_DOCUMENT_WORKER = "false";

import { prisma } from "../../db/prisma";
import { signToken } from "../../lib/jwt";
import { app } from "../server";
import { assert, ROUTE_PATH, startTestServer, stopTestServer } from "./cases.batchClioRouteTestUtils";

async function main() {
  const trackingActorUserId = "clio-handoff-tracking-route-user";
  const otherTrackingActorUserId = "clio-handoff-tracking-route-other-user";

  const seededCase = await prisma.legalCase.findUnique({
    where: { id: "demo-case-1" },
    select: { firmId: true },
  });
  assert(!!seededCase, "Seeded demo-case-1 was not found. Run pnpm run bootstrap:dev in apps/api first.");

  const otherFirm = await prisma.firm.upsert({
    where: { id: "clio-handoff-tracking-route-firm" },
    update: { name: "Clio Handoff Tracking Route Firm" },
    create: { id: "clio-handoff-tracking-route-firm", name: "Clio Handoff Tracking Route Firm" },
    select: { id: true },
  });

  const mainToken = signToken({
    userId: trackingActorUserId,
    firmId: seededCase!.firmId,
    role: Role.STAFF,
    email: "tracking-route@example.com",
  });
  const otherFirmToken = signToken({
    userId: otherTrackingActorUserId,
    firmId: otherFirm.id,
    role: Role.STAFF,
    email: "tracking-route-other@example.com",
  });

  await prisma.clioHandoffExport.deleteMany({
    where: {
      actorUserId: { in: [trackingActorUserId, otherTrackingActorUserId] },
    },
  });

  const { baseUrl, server } = await startTestServer(app);

  try {
    const contactsResponse = await fetch(`${baseUrl}/cases/demo-case-1/exports/clio/contacts.csv`, {
      headers: { Authorization: `Bearer ${mainToken}` },
    });
    assert(contactsResponse.status === 200, `Expected contacts export to succeed, got ${contactsResponse.status}`);

    const mattersResponse = await fetch(`${baseUrl}/cases/demo-case-1/exports/clio/matters.csv`, {
      headers: {
        Authorization: `Bearer ${mainToken}`,
        "X-Clio-Reexport": "true",
        "X-Clio-Reexport-Reason": "operator_override",
      },
    });
    assert(mattersResponse.status === 200, `Expected matters export to succeed, got ${mattersResponse.status}`);

    const batchResponse = await fetch(`${baseUrl}${ROUTE_PATH}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${mainToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        caseIds: ["demo-case-2", "demo-case-1", "demo-case-4", "missing-case"],
        allowReexport: true,
        reexportReason: "operator_override",
      }),
    });
    assert(batchResponse.status === 200, `Expected batch export to succeed, got ${batchResponse.status}`);

    const wrongFirmBatch = await fetch(`${baseUrl}${ROUTE_PATH}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${otherFirmToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ caseIds: ["demo-case-1"] }),
    });
    assert(wrongFirmBatch.status === 200, `Expected wrong-firm batch export to stay scoped, got ${wrongFirmBatch.status}`);

    const otherFirmExport = await prisma.clioHandoffExport.findFirst({
      where: {
        actorUserId: otherTrackingActorUserId,
        firmId: otherFirm.id,
      },
      orderBy: [{ exportedAt: "desc" }, { createdAt: "desc" }],
    });
    assert(!!otherFirmExport, "Expected a tracked batch export record for the other firm.");

    const createdExports = await prisma.clioHandoffExport.findMany({
      where: { actorUserId: trackingActorUserId },
      orderBy: [{ exportedAt: "asc" }, { createdAt: "asc" }],
      include: { memberships: true },
    });

    assert(createdExports.length === 3, `Expected 3 tracked exports for the main actor, got ${createdExports.length}`);

    const singleContacts = createdExports.find(
      (item) =>
        item.exportType === ClioHandoffExportType.SINGLE_CASE &&
        item.exportSubtype === ClioHandoffExportSubtype.CONTACTS
    );
    assert(!!singleContacts, "Expected a tracked single-case contacts export record.");
    assert(singleContacts!.memberships.length === 1, "Single contacts export should have one membership row.");
    assert(singleContacts!.memberships[0]?.caseId === "demo-case-1", "Single contacts export should include demo-case-1.");
    assert(singleContacts!.memberships[0]?.status === ClioHandoffCaseStatus.INCLUDED, "Single contacts export should be marked included.");

    const singleMatters = createdExports.find(
      (item) =>
        item.exportType === ClioHandoffExportType.SINGLE_CASE &&
        item.exportSubtype === ClioHandoffExportSubtype.MATTERS
    );
    assert(!!singleMatters, "Expected a tracked single-case matters export record.");
    assert(singleMatters!.memberships.length === 1, "Single matters export should have one membership row.");
    assert(singleMatters!.memberships[0]?.caseId === "demo-case-1", "Single matters export should include demo-case-1.");
    assert(singleMatters!.memberships[0]?.isReExport === true, "Single matters export should be tracked as a re-export after contacts export.");

    const batchExport = createdExports.find(
      (item) =>
        item.exportType === ClioHandoffExportType.BATCH &&
        item.exportSubtype === ClioHandoffExportSubtype.COMBINED_BATCH
    );
    assert(!!batchExport, "Expected a tracked batch Clio handoff export record.");
    assert(batchExport!.archiveFileName?.endsWith(".zip") === true, "Batch export should record its ZIP filename.");
    assert(
      batchExport!.memberships.some(
        (item) =>
          item.caseId === "demo-case-1" &&
          item.status === ClioHandoffCaseStatus.INCLUDED &&
          item.isReExport === true
      ),
      "Batch export should include demo-case-1 as a recorded re-export."
    );
    assert(batchExport!.memberships.some((item) => item.caseId === "demo-case-2" && item.status === ClioHandoffCaseStatus.INCLUDED), "Batch export should include demo-case-2.");
    assert(
      batchExport!.memberships.some(
        (item) =>
          item.caseId === "demo-case-4" &&
          item.status === ClioHandoffCaseStatus.SKIPPED &&
          item.skipReason === "This case has no routed documents to export yet."
      ),
      "Batch export should record demo-case-4 as skipped with its reason."
    );
    assert(
      batchExport!.memberships.some(
        (item) =>
          item.caseId === "missing-case" &&
          item.status === ClioHandoffCaseStatus.SKIPPED &&
          item.skipReason === "Case not found"
      ),
      "Batch export should record missing-case as skipped with its reason."
    );

    const caseDetailResponse = await fetch(`${baseUrl}/cases/demo-case-1`, {
      headers: { Authorization: `Bearer ${mainToken}`, Accept: "application/json" },
    });
    assert(caseDetailResponse.status === 200, `Expected case detail request to succeed, got ${caseDetailResponse.status}`);
    const caseDetail = (await caseDetailResponse.json()) as {
      ok?: boolean;
      item?: {
        clioHandoff?: {
          alreadyExported: boolean;
          exportCount: number;
          lastExportSubtype: string | null;
        };
        clioHandoffHistory?: Array<{ exportSubtype: string }>;
      };
    };
    assert(caseDetail.ok === true, "Expected case detail response to be ok.");
    assert(caseDetail.item?.clioHandoff?.alreadyExported === true, "Case detail should report demo-case-1 as already exported.");
    assert((caseDetail.item?.clioHandoff?.exportCount ?? 0) >= 3, "Case detail should report multiple recorded exports for demo-case-1.");
    assert(Array.isArray(caseDetail.item?.clioHandoffHistory) && caseDetail.item!.clioHandoffHistory!.length >= 3, "Case detail should expose recent Clio handoff history.");

    const historyResponse = await fetch(`${baseUrl}/cases/exports/clio/history?limit=10`, {
      headers: { Authorization: `Bearer ${mainToken}` },
    });
    assert(historyResponse.status === 200, `Expected history request to succeed, got ${historyResponse.status}`);
    const historyData = (await historyResponse.json()) as {
      ok?: boolean;
      items?: Array<{ exportId: string; includedCases: Array<{ caseId: string }>; skippedCases: Array<{ caseId: string; reason: string }> }>;
    };
    assert(historyData.ok === true && Array.isArray(historyData.items), "Expected history response items.");
    assert(historyData.items!.some((item) => item.exportId === batchExport!.id), "History should include the recorded batch export.");
    assert(
      historyData.items!.every((item) => item.exportId !== otherFirmExport!.id),
      "Main-firm history should not include other-firm handoff records."
    );
    assert(
      historyData.items!.some(
        (item) =>
          item.exportId === batchExport!.id &&
          item.skippedCases.some((skipped) => skipped.caseId === "demo-case-4" && skipped.reason === "This case has no routed documents to export yet.")
      ),
      "History should expose skipped cases and reasons for the batch export."
    );

    const otherFirmHistoryResponse = await fetch(`${baseUrl}/cases/exports/clio/history?limit=10`, {
      headers: { Authorization: `Bearer ${otherFirmToken}` },
    });
    assert(otherFirmHistoryResponse.status === 200, `Expected other-firm history request to succeed, got ${otherFirmHistoryResponse.status}`);
    const otherFirmHistory = (await otherFirmHistoryResponse.json()) as {
      ok?: boolean;
      items?: Array<{ includedCases: Array<{ caseId: string }>; skippedCases: Array<{ caseId: string }> }>;
    };
    assert(otherFirmHistory.ok === true && Array.isArray(otherFirmHistory.items), "Expected other-firm history response items.");
    assert(otherFirmHistory.items!.every((item) => item.includedCases.every((caseItem) => caseItem.caseId !== "demo-case-1")), "Other-firm history should not expose main-firm included cases.");

    console.log("Clio handoff tracking route tests passed");
  } finally {
    await stopTestServer(server);
    await prisma.clioHandoffExport.deleteMany({
      where: {
        actorUserId: { in: [trackingActorUserId, otherTrackingActorUserId] },
      },
    });
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
