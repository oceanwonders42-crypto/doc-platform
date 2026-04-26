import "dotenv/config";

import assert from "node:assert/strict";
import { Role } from "@prisma/client";

process.env.ENABLE_INLINE_DOCUMENT_WORKER = "false";

import { prisma } from "../../db/prisma";
import { signToken } from "../../lib/jwt";
import { deleteObject, putObject } from "../../services/storage";
import { app } from "../server";
import { startTestServer, stopTestServer } from "./cases.batchClioRouteTestUtils";

const PDF_BYTES = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n", "utf8");

async function main() {
  const suffix = Date.now();
  const firmId = `preview-firm-${suffix}`;
  const otherFirmId = `preview-other-firm-${suffix}`;
  const userId = `preview-user-${suffix}`;
  const otherUserId = `preview-other-user-${suffix}`;
  const documentId = `preview-doc-${suffix}`;
  const spacesKey = `tests/document-preview-${suffix}.pdf`;

  await putObject(spacesKey, PDF_BYTES, "application/pdf");
  await prisma.firm.createMany({
    data: [
      { id: firmId, name: "Preview Test Firm" },
      { id: otherFirmId, name: "Preview Other Firm" },
    ],
  });
  await prisma.user.createMany({
    data: [
      {
        id: userId,
        firmId,
        email: `preview-user-${suffix}@example.com`,
        role: Role.STAFF,
      },
      {
        id: otherUserId,
        firmId: otherFirmId,
        email: `preview-other-${suffix}@example.com`,
        role: Role.STAFF,
      },
    ],
  });
  await prisma.document.create({
    data: {
      id: documentId,
      firmId,
      source: "upload",
      spacesKey,
      originalName: "preview.pdf",
      mimeType: "application/pdf",
      pageCount: 1,
      status: "UPLOADED",
      processingStage: "complete",
    },
  });

  const token = signToken({
    userId,
    firmId,
    role: Role.STAFF,
    email: `preview-user-${suffix}@example.com`,
  });
  const otherToken = signToken({
    userId: otherUserId,
    firmId: otherFirmId,
    role: Role.STAFF,
    email: `preview-other-${suffix}@example.com`,
  });

  let server: import("node:http").Server | null = null;

  try {
    const started = await startTestServer(app);
    server = started.server;

    const unauthenticated = await fetch(`${started.baseUrl}/documents/${documentId}/preview`);
    assert.equal(unauthenticated.status, 401);
    assert.match(unauthenticated.headers.get("content-type") ?? "", /application\/json/i);

    const crossFirm = await fetch(`${started.baseUrl}/documents/${documentId}/preview`, {
      headers: { Authorization: `Bearer ${otherToken}` },
    });
    assert.equal(crossFirm.status, 404);
    assert.match(crossFirm.headers.get("content-type") ?? "", /application\/json/i);

    const preview = await fetch(`${started.baseUrl}/documents/${documentId}/preview`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(preview.status, 200);
    assert.match(preview.headers.get("content-type") ?? "", /application\/pdf/i);
    assert.match(preview.headers.get("content-disposition") ?? "", /inline/i);
    const bytes = Buffer.from(await preview.arrayBuffer());
    assert.equal(bytes.toString("utf8", 0, 5), "%PDF-");

    console.log("documents.previewRoute.test passed");
  } finally {
    if (server) await stopTestServer(server);
    await prisma.document.deleteMany({ where: { id: documentId } }).catch(() => {});
    await prisma.user.deleteMany({ where: { firmId: { in: [firmId, otherFirmId] } } }).catch(() => {});
    await prisma.firm.deleteMany({ where: { id: { in: [firmId, otherFirmId] } } }).catch(() => {});
    await deleteObject(spacesKey).catch(() => {});
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => {});
  });
