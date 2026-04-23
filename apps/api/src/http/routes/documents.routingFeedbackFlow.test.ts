import "dotenv/config";

import nodeAssert from "node:assert/strict";
import { Role } from "@prisma/client";

process.env.ENABLE_INLINE_DOCUMENT_WORKER = "false";

import { pgPool } from "../../db/pg";
import { prisma } from "../../db/prisma";
import { signToken } from "../../lib/jwt";
import { app } from "../server";
import { startTestServer, stopTestServer } from "./cases.batchClioRouteTestUtils";

async function main() {
  const suffix = Date.now();
  const firmId = `routing-feedback-firm-${suffix}`;
  const userId = `routing-feedback-user-${suffix}`;
  const suggestedCaseId = `routing-feedback-case-a-${suffix}`;
  const correctedCaseId = `routing-feedback-case-b-${suffix}`;
  const correctedDocId = `routing-feedback-doc-corrected-${suffix}`;
  const acceptedDocId = `routing-feedback-doc-accepted-${suffix}`;

  await prisma.firm.create({
    data: {
      id: firmId,
      name: "Routing Feedback Test Firm",
    },
  });
  await prisma.user.create({
    data: {
      id: userId,
      firmId,
      email: `routing-feedback-${suffix}@example.com`,
      role: Role.STAFF,
    },
  });
  await prisma.legalCase.createMany({
    data: [
      {
        id: suggestedCaseId,
        firmId,
        title: "Suggested Matter",
        caseNumber: `RF-A-${suffix}`,
        clientName: "Riley Feedback",
        assignedUserId: userId,
      },
      {
        id: correctedCaseId,
        firmId,
        title: "Corrected Matter",
        caseNumber: `RF-B-${suffix}`,
        clientName: "Riley Feedback",
        assignedUserId: userId,
      },
    ],
  });
  await prisma.document.createMany({
    data: [
      {
        id: correctedDocId,
        firmId,
        source: "upload",
        spacesKey: `tests/${correctedDocId}.pdf`,
        originalName: "corrected-routing.pdf",
        mimeType: "application/pdf",
        pageCount: 1,
        status: "NEEDS_REVIEW",
        processingStage: "case_match",
      },
      {
        id: acceptedDocId,
        firmId,
        source: "upload",
        spacesKey: `tests/${acceptedDocId}.pdf`,
        originalName: "accepted-routing.pdf",
        mimeType: "application/pdf",
        pageCount: 1,
        status: "UPLOADED",
        processingStage: "complete",
        routedCaseId: suggestedCaseId,
      },
    ],
  });

  await pgPool.query(
    `
    insert into document_recognition
      (document_id, case_number, client_name, doc_type, suggested_case_id, match_confidence, provider_name, updated_at)
    values
      ($1, $2, $3, 'medical_record', $4, 0.78, 'Feedback Therapy', now()),
      ($5, $6, $7, 'medical_record', $8, 0.97, 'Feedback Therapy', now())
    on conflict (document_id) do update set
      case_number = excluded.case_number,
      client_name = excluded.client_name,
      doc_type = excluded.doc_type,
      suggested_case_id = excluded.suggested_case_id,
      match_confidence = excluded.match_confidence,
      provider_name = excluded.provider_name,
      updated_at = now()
    `,
    [
      correctedDocId,
      `RF-A-${suffix}`,
      "Riley Feedback",
      suggestedCaseId,
      acceptedDocId,
      `RF-A-${suffix}`,
      "Riley Feedback",
      suggestedCaseId,
    ]
  );

  const token = signToken({
    userId,
    firmId,
    role: Role.STAFF,
    email: `routing-feedback-${suffix}@example.com`,
  });

  let server: import("node:http").Server | null = null;

  try {
    const started = await startTestServer(app);
    server = started.server;

    const correctedResponse = await fetch(`${started.baseUrl}/documents/${correctedDocId}/route`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ caseId: correctedCaseId }),
    });
    nodeAssert(
      correctedResponse.status === 200,
      `Expected corrected route to return 200, got ${correctedResponse.status}`
    );

    const approveResponse = await fetch(`${started.baseUrl}/documents/${acceptedDocId}/approve`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });
    nodeAssert(
      approveResponse.status === 200,
      `Expected approve route to return 200, got ${approveResponse.status}`
    );

    const feedbackRows = await prisma.routingFeedback.findMany({
      where: {
        firmId,
        documentId: { in: [correctedDocId, acceptedDocId] },
      },
      orderBy: { createdAt: "asc" },
    });
    const correctedFeedback = feedbackRows.find((row) => row.documentId === correctedDocId);
    const acceptedFeedback = feedbackRows.find((row) => row.documentId === acceptedDocId);

    nodeAssert(!!correctedFeedback, "Expected corrected route to persist routing feedback.");
    nodeAssert.equal(correctedFeedback?.predictedCaseId, suggestedCaseId);
    nodeAssert.equal(correctedFeedback?.finalCaseId, correctedCaseId);
    nodeAssert.equal(correctedFeedback?.wasAccepted, false);

    nodeAssert(!!acceptedFeedback, "Expected approve route to persist routing feedback.");
    nodeAssert.equal(acceptedFeedback?.predictedCaseId, suggestedCaseId);
    nodeAssert.equal(acceptedFeedback?.finalCaseId, suggestedCaseId);
    nodeAssert.equal(acceptedFeedback?.wasAccepted, true);

    console.log("documents.routingFeedbackFlow.test.ts passed");
  } finally {
    if (server) {
      await stopTestServer(server);
    }
    await prisma.routingFeedback.deleteMany({ where: { firmId } }).catch(() => undefined);
    await pgPool.query(
      `delete from document_recognition where document_id = any($1)`,
      [[correctedDocId, acceptedDocId]]
    ).catch(() => undefined);
    await prisma.document.deleteMany({ where: { id: { in: [correctedDocId, acceptedDocId] } } }).catch(() => undefined);
    await prisma.legalCase.deleteMany({ where: { id: { in: [suggestedCaseId, correctedCaseId] } } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { id: userId } }).catch(() => undefined);
    await prisma.firm.deleteMany({ where: { id: firmId } }).catch(() => undefined);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await Promise.allSettled([prisma.$disconnect(), pgPool.end()]);
  });
