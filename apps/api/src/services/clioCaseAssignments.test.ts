import "dotenv/config";

import { prisma } from "../db/prisma";
import { assert } from "../http/routes/cases.batchClioRouteTestUtils";
import { syncClioCaseAssignmentsIfStale } from "./clioCaseAssignments";

async function main() {
  const suffix = Date.now().toString(36);
  const firmId = `clio-case-assignment-firm-${suffix}`;
  const assignedUserId = `clio-case-assignment-user-${suffix}`;
  const caseId = `clio-case-assignment-case-${suffix}`;

  await prisma.firm.create({
    data: {
      id: firmId,
      name: `Clio Assignment Sync Test Firm ${suffix}`,
      settings: {
        crm: "clio",
        clioAccessToken: "clio-test-access-token",
      },
    },
  });
  await prisma.user.create({
    data: {
      id: assignedUserId,
      firmId,
      email: `assigned-${suffix}@example.com`,
    },
  });
  await prisma.legalCase.create({
    data: {
      id: caseId,
      firmId,
      title: "Clio assignment sync matter",
    },
  });
  await prisma.crmCaseMapping.create({
    data: {
      firmId,
      caseId,
      externalMatterId: `clio-matter-${suffix}`,
    },
  });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    assert(
      url.includes(`/matters/clio-matter-${suffix}.json`),
      `Expected Clio assignment sync to request the mapped matter, got ${url}`
    );
    const authHeader = new Headers(init?.headers).get("authorization");
    assert(
      authHeader === "Bearer clio-test-access-token",
      `Expected Clio assignment sync to forward the configured token, got ${String(authHeader)}`
    );

    return new Response(
      JSON.stringify({
        data: {
          id: `clio-matter-${suffix}`,
          responsible_attorney_id: `clio-user-${suffix}`,
          responsible_attorney: {
            id: `clio-user-${suffix}`,
            email: `assigned-${suffix}@example.com`,
          },
        },
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  }) as typeof fetch;

  try {
    const result = await syncClioCaseAssignmentsIfStale({
      firmId,
      force: true,
    });
    assert(result.ok === true, "Clio case assignment sync should succeed.");
    assert(result.syncedCount === 1, `Expected one case assignment sync, got ${result.syncedCount}`);

    const updatedCase = await prisma.legalCase.findUnique({
      where: { id: caseId },
      select: {
        assignedUserId: true,
        clioResponsibleAttorneyId: true,
        clioResponsibleAttorneyEmail: true,
        clioAssignmentSyncedAt: true,
      },
    });

    assert(updatedCase?.assignedUserId === assignedUserId, "Case should be assigned to the mapped local user.");
    assert(
      updatedCase?.clioResponsibleAttorneyId === `clio-user-${suffix}`,
      "Case should store the Clio responsible attorney id."
    );
    assert(
      updatedCase?.clioResponsibleAttorneyEmail === `assigned-${suffix}@example.com`,
      "Case should store the Clio responsible attorney email."
    );
    assert(updatedCase?.clioAssignmentSyncedAt != null, "Case should record when Clio assignment sync ran.");

    console.log("Clio case assignment sync tests passed");
  } finally {
    globalThis.fetch = originalFetch;
    await prisma.crmCaseMapping.deleteMany({ where: { firmId } });
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
