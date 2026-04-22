import "dotenv/config";

import { Role } from "@prisma/client";

process.env.ENABLE_INLINE_DOCUMENT_WORKER = "false";

import { pgPool } from "../../db/pg";
import { prisma } from "../../db/prisma";
import { signToken } from "../../lib/jwt";
import { app } from "../server";
import { assert, getHeader, startTestServer, stopTestServer } from "./cases.batchClioRouteTestUtils";

async function main() {
  const suffix = Date.now();
  const firmId = `documents-route-firm-${suffix}`;
  const actorUserId = `documents-route-user-${suffix}`;
  const caseId = `documents-route-case-${suffix}`;
  const documentId = `documents-route-document-${suffix}`;

  await prisma.firm.create({
    data: {
      id: firmId,
      name: "Documents Route Test Firm",
    },
  });

  await prisma.legalCase.create({
    data: {
      id: caseId,
      firmId,
      title: "Timeline Export Matter",
      caseNumber: `DOC-${suffix}`,
      clientName: "Jordan Timeline",
      status: "open",
    },
  });

  await prisma.document.create({
    data: {
      id: documentId,
      firmId,
      source: "upload",
      spacesKey: `tests/${documentId}.pdf`,
      originalName: "timeline-source.pdf",
      mimeType: "application/pdf",
      pageCount: 2,
      status: "UPLOADED",
      processingStage: "complete",
      routedCaseId: caseId,
      routingStatus: "routed",
      processedAt: new Date(),
    },
  });

  await prisma.caseTimelineEvent.create({
    data: {
      caseId,
      firmId,
      eventDate: new Date("2026-04-10T00:00:00.000Z"),
      eventType: "Visit",
      track: "medical",
      provider: "Onyx Medical Group",
      diagnosis: "Cervical strain",
      procedure: "Physical therapy",
      documentId,
    },
  });

  const token = signToken({
    userId: actorUserId,
    firmId,
    role: Role.STAFF,
    email: "documents-route@example.com",
  });

  const { baseUrl, server } = await startTestServer(app);

  try {
    const documentsResponse = await fetch(`${baseUrl}/me/documents?limit=10`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });
    assert(documentsResponse.status === 200, `Expected /me/documents to return 200, got ${documentsResponse.status}`);
    const documentsJson = (await documentsResponse.json()) as {
      ok?: boolean;
      items?: Array<{ id: string; routedCaseId?: string | null; processingStage?: string | null }>;
      nextCursor?: string | null;
    };
    assert(documentsJson.ok === true, "Expected /me/documents response to include ok: true.");
    assert(Array.isArray(documentsJson.items), "Expected /me/documents response to include an items array.");
    assert(documentsJson.items?.some((item) => item.id === documentId) === true, "Expected test document in /me/documents response.");
    const returnedDocument = documentsJson.items?.find((item) => item.id === documentId);
    assert(returnedDocument?.routedCaseId === caseId, "Expected /me/documents to preserve routed case id.");
    assert(returnedDocument?.processingStage === "complete", "Expected /me/documents to preserve processing stage.");
    assert(documentsJson.nextCursor === null, `Expected /me/documents nextCursor to be null, got ${documentsJson.nextCursor}`);

    const pdfResponse = await fetch(`${baseUrl}/cases/${caseId}/timeline/export?format=pdf`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    assert(pdfResponse.status === 200, `Expected PDF chronology export to return 200, got ${pdfResponse.status}`);
    assert(
      getHeader(pdfResponse, "content-type").includes("application/pdf"),
      "Expected PDF chronology export content-type to be application/pdf."
    );
    assert(
      getHeader(pdfResponse, "content-disposition").includes("chronology.pdf"),
      "Expected PDF chronology export filename to end with chronology.pdf."
    );
    assert((await pdfResponse.arrayBuffer()).byteLength > 0, "Expected PDF chronology export body to be non-empty.");

    const docxResponse = await fetch(`${baseUrl}/cases/${caseId}/timeline/export?format=docx`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    assert(docxResponse.status === 200, `Expected DOCX chronology export to return 200, got ${docxResponse.status}`);
    assert(
      getHeader(docxResponse, "content-type").includes("application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
      "Expected DOCX chronology export content-type to be the Word document MIME type."
    );
    assert(
      getHeader(docxResponse, "content-disposition").includes("chronology.docx"),
      "Expected DOCX chronology export filename to end with chronology.docx."
    );
    assert((await docxResponse.arrayBuffer()).byteLength > 0, "Expected DOCX chronology export body to be non-empty.");

    const invalidResponse = await fetch(`${baseUrl}/cases/${caseId}/timeline/export?format=txt`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });
    assert(invalidResponse.status === 400, `Expected invalid chronology export format to return 400, got ${invalidResponse.status}`);
    const invalidJson = (await invalidResponse.json()) as { ok?: boolean; error?: string };
    assert(invalidJson.ok === false, "Expected invalid chronology export response to include ok: false.");
    assert(
      invalidJson.error === "format must be 'pdf' or 'docx'",
      `Expected invalid chronology export error message, got ${invalidJson.error}`
    );

    console.log("Documents and timeline export route tests passed");
  } finally {
    await stopTestServer(server);
    await prisma.caseTimelineEvent.deleteMany({
      where: { caseId, firmId },
    });
    await prisma.document.deleteMany({
      where: { id: documentId },
    });
    await prisma.legalCase.deleteMany({
      where: { id: caseId },
    });
    await prisma.firm.deleteMany({
      where: { id: firmId },
    });
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
