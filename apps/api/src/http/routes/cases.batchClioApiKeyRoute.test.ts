/**
 * Route-level regression test for the API-key auth branch of batch Clio handoff ZIP export.
 * Run: pnpm -C apps/api exec tsx src/http/routes/cases.batchClioApiKeyRoute.test.ts
 */
import "dotenv/config";

import crypto from "node:crypto";

import bcrypt from "bcryptjs";

process.env.ENABLE_INLINE_DOCUMENT_WORKER = "false";

import { prisma } from "../../db/prisma";
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

type CreatedApiKey = {
  id: string;
  rawKey: string;
};

async function createRouteTestApiKey(
  firmId: string,
  name: string
): Promise<CreatedApiKey> {
  const rawKey = `sk_live_${crypto.randomBytes(24).toString("hex")}`;
  const keyHash = await bcrypt.hash(rawKey, 10);
  const apiKey = await prisma.apiKey.create({
    data: {
      firmId,
      name,
      keyPrefix: rawKey.slice(0, 12),
      keyHash,
      scopes: "ingest",
    },
    select: { id: true },
  });

  return { id: apiKey.id, rawKey };
}

async function main() {
  const seededCase = await prisma.legalCase.findUnique({
    where: { id: "demo-case-1" },
    select: { firmId: true },
  });
  assert(!!seededCase, "Seeded demo-case-1 was not found. Run pnpm run bootstrap:dev in apps/api first.");
  const stamp = Date.now().toString();
  const seededSpacesKeys = [`tests/clio-batch-api-key-${stamp}-1.pdf`, `tests/clio-batch-api-key-${stamp}-2.pdf`];

  const otherFirm = await prisma.firm.upsert({
    where: { id: "batch-clio-api-key-route-test-firm" },
    update: { name: "Batch Clio API Key Route Test Firm" },
    create: { id: "batch-clio-api-key-route-test-firm", name: "Batch Clio API Key Route Test Firm" },
    select: { id: true },
  });

  const goodKey = await createRouteTestApiKey(seededCase!.firmId, "Batch Clio Route Test Key");
  const wrongFirmKey = await createRouteTestApiKey(otherFirm.id, "Batch Clio Route Test Wrong Firm Key");
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
  await prisma.document.deleteMany({
    where: {
      firmId: seededCase!.firmId,
      spacesKey: { in: seededSpacesKeys },
    },
  });
  await prisma.document.createMany({
    data: [
      {
        firmId: seededCase!.firmId,
        source: "test",
        spacesKey: seededSpacesKeys[0],
        originalName: "clio-batch-api-key-1.pdf",
        mimeType: "application/pdf",
        routedCaseId: "demo-case-1",
        reviewState: "EXPORT_READY",
      },
      {
        firmId: seededCase!.firmId,
        source: "test",
        spacesKey: seededSpacesKeys[1],
        originalName: "clio-batch-api-key-2.pdf",
        mimeType: "application/pdf",
        routedCaseId: "demo-case-2",
        reviewState: "EXPORT_READY",
      },
    ],
  });
  const { baseUrl, server } = await startTestServer(app);

  try {
    const missingAuth = await fetch(`${baseUrl}${ROUTE_PATH}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ caseIds: ["demo-case-1"] }),
    });
    assert(missingAuth.status === 401, `Expected missing API key request to return 401, got ${missingAuth.status}`);

    const invalidApiKey = await fetch(`${baseUrl}${ROUTE_PATH}`, {
      method: "POST",
      headers: {
        Authorization: "Bearer sk_live_invalid_batch_clio_route_key",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ caseIds: ["demo-case-1"] }),
    });
    assert(invalidApiKey.status === 401, `Expected invalid API key to return 401, got ${invalidApiKey.status}`);

    const invalidPayload = await fetch(`${baseUrl}${ROUTE_PATH}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${goodKey.rawKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ caseIds: "demo-case-1" }),
    });
    assert(invalidPayload.status === 400, `Expected invalid payload to return 400, got ${invalidPayload.status}`);

    const success = await fetch(`${baseUrl}${ROUTE_PATH}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${goodKey.rawKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ caseIds: SUCCESS_CASE_IDS }),
    });
    assert(success.status === 200, `Expected successful API-key batch export to return 200, got ${success.status}`);
    assert(getHeader(success, "content-type").includes("application/zip"), "Success response should be a ZIP download.");

    const datePart = extractZipDatePart(getHeader(success, "content-disposition"));
    const successZip = await parseZip(success);
    const successEntries = Object.keys(successZip.files).sort();
    const expectedEntries = [
      `clio-contacts-batch-${datePart}.csv`,
      `clio-contacts-batch-${datePart}.xlsx`,
      `clio-matters-batch-${datePart}.csv`,
      `clio-matters-batch-${datePart}.xlsx`,
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
        Authorization: `Bearer ${wrongFirmKey.rawKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ caseIds: ["demo-case-1"] }),
    });
    assert(wrongFirm.status === 200, `Expected wrong-firm API key request to stay scoped and return 200, got ${wrongFirm.status}`);

    const wrongFirmZip = await parseZip(wrongFirm);
    const wrongFirmManifestText = await wrongFirmZip.file("manifest.json")?.async("string");
    assert(typeof wrongFirmManifestText === "string", "Wrong-firm ZIP should still include a manifest.");
    const wrongFirmManifest = JSON.parse(wrongFirmManifestText!) as BatchClioRouteManifest;
    assert(wrongFirmManifest.includedCaseIds.length === 0, "Wrong-firm request should not include inaccessible cases.");
    assert(
      wrongFirmManifest.skippedCases.some((item) => item.id === "demo-case-1" && item.reason === "Case not found"),
      "Wrong-firm manifest should record the case as not found within that firm scope."
    );

    console.log("Batch Clio API-key route integration tests passed");
  } finally {
    await stopTestServer(server);
    await prisma.document.deleteMany({
      where: {
        firmId: seededCase!.firmId,
        spacesKey: { in: seededSpacesKeys },
      },
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
    await prisma.apiKey.deleteMany({ where: { id: { in: [goodKey.id, wrongFirmKey.id] } } });
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
