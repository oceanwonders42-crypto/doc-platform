/**
 * Route-level regression test for batch Clio handoff ZIP export.
 * Run: pnpm -C apps/api exec tsx src/http/routes/cases.batchClioRoute.test.ts
 */
import "dotenv/config";

import { Role } from "@prisma/client";

process.env.ENABLE_INLINE_DOCUMENT_WORKER = "false";

import { prisma } from "../../db/prisma";
import { signToken } from "../../lib/jwt";
import { app } from "../server";
import {
  assert,
  extractZipDatePart,
  getHeader,
  parseZip,
  ROUTE_PATH,
  startTestServer,
  stopTestServer,
  SUCCESS_CASE_IDS,
  type BatchClioRouteManifest,
} from "./cases.batchClioRouteTestUtils";

const TARGET_CASE_IDS = ["demo-case-1", "demo-case-2", "demo-case-4"];

async function main() {
  const seededCase = await prisma.legalCase.findUnique({
    where: { id: "demo-case-1" },
    select: { firmId: true },
  });
  assert(!!seededCase, "Seeded demo-case-1 was not found. Run pnpm run bootstrap:dev in apps/api first.");

  const otherFirm = await prisma.firm.upsert({
    where: { id: "batch-clio-route-test-firm" },
    update: { name: "Batch Clio Route Test Firm" },
    create: { id: "batch-clio-route-test-firm", name: "Batch Clio Route Test Firm" },
    select: { id: true },
  });

  const goodToken = signToken({
    userId: "batch-clio-route-staff",
    firmId: seededCase!.firmId,
    role: Role.STAFF,
    email: "batch-route@example.com",
  });
  const wrongFirmToken = signToken({
    userId: "batch-clio-route-other-firm-staff",
    firmId: otherFirm.id,
    role: Role.STAFF,
    email: "batch-route-other@example.com",
  });
  await prisma.clioHandoffExport.deleteMany({
    where: {
      firmId: seededCase!.firmId,
      memberships: {
        some: {
          caseId: { in: TARGET_CASE_IDS },
        },
      },
    },
  });

  const { baseUrl, server } = await startTestServer(app);

  try {
    const unauthenticated = await fetch(`${baseUrl}${ROUTE_PATH}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ caseIds: ["demo-case-1"] }),
    });
    assert(unauthenticated.status === 401, `Expected unauthenticated request to return 401, got ${unauthenticated.status}`);

    const invalidPayload = await fetch(`${baseUrl}${ROUTE_PATH}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${goodToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ caseIds: "demo-case-1" }),
    });
    assert(invalidPayload.status === 400, `Expected invalid payload to return 400, got ${invalidPayload.status}`);

    const success = await fetch(`${baseUrl}${ROUTE_PATH}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${goodToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ caseIds: SUCCESS_CASE_IDS }),
    });
    assert(success.status === 200, `Expected successful batch export to return 200, got ${success.status}`);
    assert(getHeader(success, "content-type").includes("application/zip"), "Success response should be a ZIP download.");

    const contentDisposition = getHeader(success, "content-disposition");
    const datePart = extractZipDatePart(contentDisposition);

    const successZip = await parseZip(success);
    const successEntries = Object.keys(successZip.files).sort();
    const expectedEntries = [
      `clio-contacts-batch-${datePart}.csv`,
      `clio-matters-batch-${datePart}.csv`,
      "manifest.json",
    ];
    assert(
      JSON.stringify(successEntries) === JSON.stringify(expectedEntries),
      `Unexpected ZIP entries. Expected ${expectedEntries.join(", ")}, got ${successEntries.join(", ")}`
    );

    const manifestText = await successZip.file("manifest.json")?.async("string");
    assert(typeof manifestText === "string" && manifestText.trim().length > 0, "manifest.json should be present in the ZIP.");
    const manifest = JSON.parse(manifestText!) as BatchClioRouteManifest;
    assert(
      JSON.stringify(manifest.includedCaseIds) === JSON.stringify(["demo-case-1", "demo-case-2"]),
      `Unexpected includedCaseIds: ${JSON.stringify(manifest.includedCaseIds)}`
    );
    assert(
      JSON.stringify(manifest.includedCaseNumbers) === JSON.stringify(["DEMO-001", "DEMO-002"]),
      `Unexpected includedCaseNumbers: ${JSON.stringify(manifest.includedCaseNumbers)}`
    );
    assert(manifest.contactsRowCount > 0, "Manifest should report at least one contacts row.");
    assert(manifest.mattersRowCount > 0, "Manifest should report at least one matters row.");
    assert(
      manifest.skippedCases.some(
        (item) => item.id === "demo-case-4" && item.reason === "This case has no routed documents to export yet."
      ),
      "Manifest should include demo-case-4 as a skipped case."
    );
    assert(
      manifest.skippedCases.some((item) => item.id === "missing-case" && item.reason === "Case not found"),
      "Manifest should include missing-case as a skipped case."
    );

    const wrongFirm = await fetch(`${baseUrl}${ROUTE_PATH}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${wrongFirmToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ caseIds: ["demo-case-1"] }),
    });
    assert(wrongFirm.status === 200, `Expected wrong-firm request to stay scoped and return 200, got ${wrongFirm.status}`);

    const wrongFirmZip = await parseZip(wrongFirm);
    const wrongFirmManifestText = await wrongFirmZip.file("manifest.json")?.async("string");
    assert(typeof wrongFirmManifestText === "string", "Wrong-firm ZIP should still include a manifest.");
    const wrongFirmManifest = JSON.parse(wrongFirmManifestText!) as BatchClioRouteManifest;
    assert(wrongFirmManifest.includedCaseIds.length === 0, "Wrong-firm request should not include inaccessible cases.");
    assert(
      wrongFirmManifest.skippedCases.some((item) => item.id === "demo-case-1" && item.reason === "Case not found"),
      "Wrong-firm manifest should record the case as not found within that firm scope."
    );

    console.log("Batch Clio route integration tests passed");
  } finally {
    await stopTestServer(server);
    await prisma.clioHandoffExport.deleteMany({
      where: {
        firmId: seededCase!.firmId,
        memberships: {
          some: {
            caseId: { in: TARGET_CASE_IDS },
          },
        },
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
