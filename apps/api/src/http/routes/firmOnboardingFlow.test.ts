import "dotenv/config";

process.env.ENABLE_INLINE_DOCUMENT_WORKER = "false";
process.env.REDIS_URL = "redis://localhost:6379/15";
process.env.PLATFORM_ADMIN_API_KEY = process.env.PLATFORM_ADMIN_API_KEY ?? "platform-admin-test-key";

const { prisma } = require("../../db/prisma") as typeof import("../../db/prisma");
const { app } = require("../server") as typeof import("../server");
const { assert, startTestServer, stopTestServer } = require("./cases.batchClioRouteTestUtils") as typeof import("./cases.batchClioRouteTestUtils");

async function postJson(url: string, body: unknown, token?: string): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

async function main() {
  const suffix = Date.now();
  const platformAdminToken = process.env.PLATFORM_ADMIN_API_KEY!;
  let firmId: string | null = null;
  let staffApiKeyId: string | null = null;

  const { baseUrl, server } = await startTestServer(app);

  try {
    const createFirm = await postJson(
      `${baseUrl}/firms`,
      { name: `Security Proof Firm ${suffix}`, plan: "starter" },
      platformAdminToken
    );
    assert(createFirm.status === 200, `Expected platform admin firm creation to return 200, got ${createFirm.status}`);
    const createFirmJson = (await createFirm.json()) as { ok?: boolean; firm?: { id?: string } };
    assert(createFirmJson.ok === true && typeof createFirmJson.firm?.id === "string", "Expected firm creation to succeed.");
    firmId = createFirmJson.firm!.id!;

    const createStaffApiKey = await postJson(
      `${baseUrl}/firms/${firmId}/api-keys`,
      { name: "Staff verification key" },
      platformAdminToken
    );
    assert(createStaffApiKey.status === 200, `Expected platform admin API key creation to return 200, got ${createStaffApiKey.status}`);
    const createStaffApiKeyJson = (await createStaffApiKey.json()) as {
      ok?: boolean;
      apiKey?: string;
      id?: string;
    };
    assert(
      createStaffApiKeyJson.ok === true && typeof createStaffApiKeyJson.apiKey === "string",
      "Expected staff-scoped API key creation to succeed."
    );
    const staffApiKey = createStaffApiKeyJson.apiKey!;
    staffApiKeyId = typeof createStaffApiKeyJson.id === "string" ? createStaffApiKeyJson.id : null;

    const unauthenticatedDevFirm = await postJson(`${baseUrl}/dev/create-firm`, {
      name: `Blocked dev firm ${suffix}`,
    });
    assert(
      unauthenticatedDevFirm.status === 401,
      `Expected unauthenticated /dev/create-firm to return 401, got ${unauthenticatedDevFirm.status}`
    );

    const staffDevFirm = await postJson(
      `${baseUrl}/dev/create-firm`,
      { name: `Blocked staff dev firm ${suffix}` },
      staffApiKey
    );
    assert(
      staffDevFirm.status === 403,
      `Expected staff /dev/create-firm to return 403, got ${staffDevFirm.status}`
    );

    const staffDevKey = await postJson(
      `${baseUrl}/dev/create-api-key/${firmId}`,
      { name: "Blocked staff dev key" },
      staffApiKey
    );
    assert(
      staffDevKey.status === 403,
      `Expected staff /dev/create-api-key to return 403, got ${staffDevKey.status}`
    );

    const adminDevKey = await postJson(
      `${baseUrl}/admin/dev/create-api-key`,
      { name: "Allowed admin dev key" },
      platformAdminToken
    );
    assert(
      adminDevKey.status === 200,
      `Expected non-production /admin/dev/create-api-key to return 200 for platform admin, got ${adminDevKey.status}`
    );

    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      const productionDevFirm = await postJson(
        `${baseUrl}/dev/create-firm`,
        { name: `Blocked prod dev firm ${suffix}` },
        platformAdminToken
      );
      assert(
        productionDevFirm.status === 404,
        `Expected production /dev/create-firm to return 404, got ${productionDevFirm.status}`
      );

      const productionAdminDevKey = await postJson(
        `${baseUrl}/admin/dev/create-api-key`,
        { name: "Blocked prod admin dev key" },
        platformAdminToken
      );
      assert(
        productionAdminDevKey.status === 404,
        `Expected production /admin/dev/create-api-key to return 404, got ${productionAdminDevKey.status}`
      );

      const productionDevKey = await postJson(
        `${baseUrl}/dev/create-api-key/${firmId}`,
        { name: "Blocked prod dev key" },
        platformAdminToken
      );
      assert(
        productionDevKey.status === 404,
        `Expected production /dev/create-api-key to return 404, got ${productionDevKey.status}`
      );
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
    }

    console.log("Firm onboarding security proof passed", {
      firmId,
      staffApiKeyId,
      unauthenticatedStatus: unauthenticatedDevFirm.status,
      staffCreateFirmStatus: staffDevFirm.status,
      staffCreateApiKeyStatus: staffDevKey.status,
      productionBlocked: true,
    });
  } finally {
    await stopTestServer(server);

    if (staffApiKeyId) {
      await prisma.apiKey.deleteMany({ where: { id: staffApiKeyId } }).catch(() => {});
    }
    if (firmId) {
      await prisma.apiKey.deleteMany({ where: { firmId } }).catch(() => {});
      await prisma.user.deleteMany({ where: { firmId } }).catch(() => {});
      await prisma.routingRule.deleteMany({ where: { firmId } }).catch(() => {});
      await prisma.firm.deleteMany({ where: { id: firmId } }).catch(() => {});
    }
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
      prisma.$disconnect(),
      new Promise((resolve) => setTimeout(resolve, 1000)),
    ]);
    process.exit(exitCode);
  });
