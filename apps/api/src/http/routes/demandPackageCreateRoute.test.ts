import "dotenv/config";

import { Role } from "@prisma/client";

process.env.ENABLE_INLINE_DOCUMENT_WORKER = "false";

import { prisma } from "../../db/prisma";
import { signToken } from "../../lib/jwt";
import { app } from "../server";
import { assert, startTestServer, stopTestServer } from "./cases.batchClioRouteTestUtils";

async function main() {
  const suffix = Date.now();
  const firmId = `demand-package-create-firm-${suffix}`;
  const caseId = `demand-package-create-case-${suffix}`;
  const userId = `demand-package-create-user-${suffix}`;
  const documentId = `demand-package-create-doc-${suffix}`;

  await prisma.firm.create({
    data: {
      id: firmId,
      name: "Demand Package Create Test Firm",
      features: ["demand_narratives"],
    },
  });
  await prisma.user.create({
    data: {
      id: userId,
      firmId,
      email: `demand-package-create-${suffix}@example.com`,
      role: Role.STAFF,
    },
  });
  await prisma.legalCase.create({
    data: {
      id: caseId,
      firmId,
      title: "Create Demand Matter",
      caseNumber: `DP-${suffix}`,
      clientName: "Darla Packet",
      assignedUserId: userId,
    },
  });
  await prisma.document.create({
    data: {
      id: documentId,
      firmId,
      source: "upload",
      spacesKey: `tests/${documentId}.pdf`,
      originalName: "demand-source.pdf",
      mimeType: "application/pdf",
      pageCount: 1,
      status: "UPLOADED",
      processingStage: "complete",
      routedCaseId: caseId,
    },
  });
  await prisma.caseTimelineEvent.create({
    data: {
      firmId,
      caseId,
      documentId,
      eventType: "treatment",
      track: "medical",
    },
  });

  const token = signToken({
    userId,
    firmId,
    role: Role.STAFF,
    email: `demand-package-create-${suffix}@example.com`,
  });

  let server: import("node:http").Server | null = null;

  try {
    const started = await startTestServer(app);
    server = started.server;

    const createResponse = await fetch(`${started.baseUrl}/cases/${caseId}/demand-packages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });
    assert(createResponse.status === 202, `Expected create demand package route to return 202, got ${createResponse.status}`);
    const createJson = (await createResponse.json()) as {
      ok?: boolean;
      item?: { id?: string; status?: string; title?: string };
      limitations?: {
        warnings?: string[];
        stats?: { documentCount?: number; timelineEventCount?: number };
      };
      jobId?: string;
    };
    assert(createJson.ok === true, "Expected create demand package route to succeed.");
    assert(createJson.item?.status === "draft", `Expected newly queued demand package status draft, got ${createJson.item?.status}`);
    assert(createJson.item?.title === "Darla Packet Demand Package", `Expected suggested title to use client name, got ${createJson.item?.title}`);
    assert(createJson.limitations?.stats?.documentCount === 1, "Expected readiness stats to include routed document count.");
    assert(createJson.limitations?.stats?.timelineEventCount === 1, "Expected readiness stats to include timeline count.");
    assert(typeof createJson.jobId === "string" && createJson.jobId.length > 0, "Expected create route to return a job id.");

    const demandPackage = await prisma.demandPackage.findFirst({
      where: { firmId, caseId },
      orderBy: { createdAt: "desc" },
    });
    assert(!!demandPackage, "Expected route to persist a demand package.");

    const job = await prisma.job.findUnique({
      where: { id: String(createJson.jobId) },
    });
    assert(job?.type === "demand_package.generate", `Expected queued job type demand_package.generate, got ${job?.type}`);

    const listResponse = await fetch(`${started.baseUrl}/cases/${caseId}/demand-packages`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    assert(listResponse.status === 200, `Expected demand package list route to return 200, got ${listResponse.status}`);
    const listJson = (await listResponse.json()) as {
      ok?: boolean;
      items?: Array<{ id: string; status: string }>;
    };
    assert(listJson.ok === true, "Expected demand package list route to succeed.");
    assert(
      Boolean(listJson.items?.some((item) => item.id === demandPackage?.id && item.status === "draft")),
      "Expected demand package list to include the queued draft item."
    );

    console.log("demandPackageCreateRoute.test.ts passed");
  } finally {
    if (server) {
      await stopTestServer(server);
    }
    await prisma.job.deleteMany({ where: { firmId } }).catch(() => undefined);
    await prisma.caseTimelineEvent.deleteMany({ where: { firmId, caseId } }).catch(() => undefined);
    await prisma.document.deleteMany({ where: { id: documentId } }).catch(() => undefined);
    await prisma.demandPackage.deleteMany({ where: { firmId, caseId } }).catch(() => undefined);
    await prisma.legalCase.deleteMany({ where: { id: caseId } }).catch(() => undefined);
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
    await prisma.$disconnect();
  });
