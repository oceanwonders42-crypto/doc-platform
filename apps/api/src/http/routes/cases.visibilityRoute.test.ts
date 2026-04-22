import "dotenv/config";

process.env.ENABLE_INLINE_DOCUMENT_WORKER = "false";

import { Role } from "@prisma/client";

import { prisma } from "../../db/prisma";
import { signToken } from "../../lib/jwt";
import { app } from "../server";
import { assert, startTestServer, stopTestServer } from "./cases.batchClioRouteTestUtils";

async function main() {
  const suffix = Date.now().toString(36);
  const firmId = `case-visibility-firm-${suffix}`;
  const adminUserId = `case-visibility-admin-${suffix}`;
  const assistantUserId = `case-visibility-assistant-${suffix}`;
  const attorneyUserId = `case-visibility-attorney-${suffix}`;
  const assistantCaseId = `case-visibility-assistant-case-${suffix}`;
  const attorneyCaseId = `case-visibility-attorney-case-${suffix}`;
  const unassignedCaseId = `case-visibility-unassigned-case-${suffix}`;

  await prisma.firm.create({
    data: {
      id: firmId,
      name: `Case Visibility Test Firm ${suffix}`,
    },
  });
  await prisma.user.createMany({
    data: [
      {
        id: adminUserId,
        firmId,
        email: `case-admin-${suffix}@example.com`,
        role: Role.FIRM_ADMIN,
      },
      {
        id: assistantUserId,
        firmId,
        email: `case-assistant-${suffix}@example.com`,
        role: Role.PARALEGAL,
      },
      {
        id: attorneyUserId,
        firmId,
        email: `case-attorney-${suffix}@example.com`,
        role: Role.STAFF,
      },
    ],
  });
  await prisma.legalCase.createMany({
    data: [
      {
        id: assistantCaseId,
        firmId,
        title: "Visibility Assistant Matter",
        caseNumber: "VIS-001",
        clientName: "Assistant Client",
        assignedUserId: assistantUserId,
      },
      {
        id: attorneyCaseId,
        firmId,
        title: "Visibility Attorney Matter",
        caseNumber: "VIS-002",
        clientName: "Attorney Client",
        assignedUserId: attorneyUserId,
      },
      {
        id: unassignedCaseId,
        firmId,
        title: "Visibility Unassigned Matter",
        caseNumber: "VIS-003",
        clientName: "Unassigned Client",
      },
    ],
  });
  await prisma.caseTimelineEvent.create({
    data: {
      caseId: attorneyCaseId,
      firmId,
      documentId: `case-visibility-document-${suffix}`,
      track: "medical",
      eventType: "Visit",
      provider: "Visibility Provider",
    },
  });

  const adminToken = signToken({
    userId: adminUserId,
    firmId,
    role: Role.FIRM_ADMIN,
    email: `case-admin-${suffix}@example.com`,
  });
  const assistantToken = signToken({
    userId: assistantUserId,
    firmId,
    role: "LEGAL_ASSISTANT",
    email: `case-assistant-${suffix}@example.com`,
  });
  const attorneyToken = signToken({
    userId: attorneyUserId,
    firmId,
    role: "ATTORNEY",
    email: `case-attorney-${suffix}@example.com`,
  });
  const readOnlyToken = signToken({
    userId: assistantUserId,
    firmId,
    role: "READ_ONLY",
    email: `case-assistant-${suffix}@example.com`,
  });

  const { baseUrl, server } = await startTestServer(app);

  try {
    const adminList = await fetch(`${baseUrl}/cases`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(adminList.status === 200, `Expected firm admin /cases to return 200, got ${adminList.status}`);
    const adminListPayload = await adminList.json() as { ok?: boolean; items?: Array<{ id: string }> };
    assert(adminListPayload.ok === true, "Firm admin /cases payload should have ok=true.");
    const adminIds = (adminListPayload.items ?? []).map((item) => item.id).sort();
    assert(
      JSON.stringify(adminIds) === JSON.stringify([assistantCaseId, attorneyCaseId, unassignedCaseId].sort()),
      `Firm admin should see all firm matters, got ${JSON.stringify(adminIds)}`
    );

    const assistantList = await fetch(`${baseUrl}/cases`, {
      headers: { Authorization: `Bearer ${assistantToken}` },
    });
    assert(assistantList.status === 200, `Expected assistant /cases to return 200, got ${assistantList.status}`);
    const assistantListPayload = await assistantList.json() as { ok?: boolean; items?: Array<{ id: string }> };
    const assistantIds = (assistantListPayload.items ?? []).map((item) => item.id);
    assert(
      JSON.stringify(assistantIds) === JSON.stringify([assistantCaseId]),
      `Assistant should see only assigned matter, got ${JSON.stringify(assistantIds)}`
    );

    const attorneyList = await fetch(`${baseUrl}/cases`, {
      headers: { Authorization: `Bearer ${attorneyToken}` },
    });
    assert(attorneyList.status === 200, `Expected attorney /cases to return 200, got ${attorneyList.status}`);
    const attorneyListPayload = await attorneyList.json() as { ok?: boolean; items?: Array<{ id: string }> };
    const attorneyIds = (attorneyListPayload.items ?? []).map((item) => item.id);
    assert(
      JSON.stringify(attorneyIds) === JSON.stringify([attorneyCaseId]),
      `Attorney should see only assigned matter, got ${JSON.stringify(attorneyIds)}`
    );

    const readOnlyList = await fetch(`${baseUrl}/cases`, {
      headers: { Authorization: `Bearer ${readOnlyToken}` },
    });
    assert(readOnlyList.status === 403, `Expected read-only /cases to return 403, got ${readOnlyList.status}`);

    const assistantForbiddenCase = await fetch(`${baseUrl}/cases/${encodeURIComponent(attorneyCaseId)}`, {
      headers: { Authorization: `Bearer ${assistantToken}` },
    });
    assert(
      assistantForbiddenCase.status === 404,
      `Expected assistant direct access to another matter to return 404, got ${assistantForbiddenCase.status}`
    );

    const assistantForbiddenTimeline = await fetch(`${baseUrl}/cases/${encodeURIComponent(attorneyCaseId)}/timeline`, {
      headers: { Authorization: `Bearer ${assistantToken}` },
    });
    assert(
      assistantForbiddenTimeline.status === 404,
      `Expected assistant timeline access to another matter to return 404, got ${assistantForbiddenTimeline.status}`
    );

    const adminTimeline = await fetch(`${baseUrl}/cases/${encodeURIComponent(attorneyCaseId)}/timeline`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(adminTimeline.status === 200, `Expected firm admin timeline request to return 200, got ${adminTimeline.status}`);
    const adminTimelinePayload = await adminTimeline.json() as { ok?: boolean; items?: Array<{ id: string }> };
    assert(adminTimelinePayload.ok === true, "Firm admin timeline payload should have ok=true.");
    assert((adminTimelinePayload.items ?? []).length === 1, "Firm admin timeline should include the seeded event.");

    const assistantSearch = await fetch(`${baseUrl}/me/search?q=Visibility`, {
      headers: { Authorization: `Bearer ${assistantToken}` },
    });
    assert(assistantSearch.status === 200, `Expected assistant /me/search to return 200, got ${assistantSearch.status}`);
    const assistantSearchPayload = await assistantSearch.json() as {
      ok?: boolean;
      cases?: { items?: Array<{ id: string }> };
    };
    const assistantSearchIds = (assistantSearchPayload.cases?.items ?? []).map((item) => item.id);
    assert(
      JSON.stringify(assistantSearchIds) === JSON.stringify([assistantCaseId]),
      `Assistant search should only return assigned matters, got ${JSON.stringify(assistantSearchIds)}`
    );

    console.log("Case visibility route tests passed");
  } finally {
    await stopTestServer(server);
    await prisma.caseTimelineEvent.deleteMany({ where: { firmId } });
    await prisma.legalCase.deleteMany({ where: { firmId } });
    await prisma.user.deleteMany({ where: { firmId } });
    await prisma.firm.deleteMany({ where: { id: firmId } });
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
