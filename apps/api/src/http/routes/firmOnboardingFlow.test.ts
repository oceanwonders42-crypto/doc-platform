import "dotenv/config";

import { PDFDocument } from "pdf-lib";

process.env.ENABLE_INLINE_DOCUMENT_WORKER = "false";
process.env.REDIS_URL = "redis://localhost:6379/15";
process.env.PLATFORM_ADMIN_API_KEY = process.env.PLATFORM_ADMIN_API_KEY ?? "platform-admin-test-key";

const { prisma } = require("../../db/prisma") as typeof import("../../db/prisma");
const { getRedisQueueSnapshot, redis } = require("../../services/queue") as typeof import("../../services/queue");
const { s3 } = require("../../services/storage") as typeof import("../../services/storage");
const { app } = require("../server") as typeof import("../server");
const { startDocumentWorkerLoop } = require("../../workers/documentWorkerLoop") as typeof import("../../workers/documentWorkerLoop");
const { assert, startTestServer, stopTestServer } = require("./cases.batchClioRouteTestUtils") as typeof import("./cases.batchClioRouteTestUtils");

type JsonRecord = Record<string, any>;

const QUEUE_KEY = "doc_jobs";

async function buildPdfBuffer(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.addPage([300, 200]);
  return pdf.save();
}

async function postJson(url: string, body: unknown, token: string): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

async function login(baseUrl: string, email: string, password: string): Promise<string> {
  const response = await fetch(`${baseUrl}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  assert(response.status === 200, `Expected login for ${email} to return 200, got ${response.status}`);
  const json = (await response.json()) as { ok?: boolean; token?: string };
  assert(json.ok === true && typeof json.token === "string", `Expected login token for ${email}`);
  return json.token!;
}

async function waitForTimelineRebuild(caseId: string, firmId: string, timeoutMs = 10_000): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const [rebuild, eventCount] = await Promise.all([
      prisma.caseTimelineRebuild.findUnique({
        where: { caseId_firmId: { caseId, firmId } },
      }),
      prisma.caseTimelineEvent.count({
        where: { caseId, firmId },
      }),
    ]);

    if (rebuild && eventCount > 0) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  throw new Error(`Timed out waiting for timeline rebuild for case ${caseId}`);
}

async function removeQueuedTypesForFirm(firmId: string, removeTypes: Set<string>): Promise<string[]> {
  const rawQueue = await redis.lrange(QUEUE_KEY, 0, -1);
  const removed: string[] = [];
  const kept: string[] = [];

  for (const raw of rawQueue) {
    const payload = JSON.parse(raw) as { firmId?: string; type?: string };
    if (payload.firmId === firmId && payload.type && removeTypes.has(payload.type)) {
      removed.push(payload.type);
      continue;
    }
    kept.push(raw);
  }

  await redis.del(QUEUE_KEY);
  if (kept.length > 0) {
    await redis.rpush(QUEUE_KEY, ...kept);
  }

  return removed;
}

async function main() {
  const suffix = Date.now();
  const firmAEmail = `onboarding-admin-a-${suffix}@example.com`;
  const firmBEmail = `onboarding-admin-b-${suffix}@example.com`;
  const staffEmail = `onboarding-staff-${suffix}@example.com`;
  const adminPassword = "ProofPass123!";
  const staffPassword = "StaffPass123!";
  const platformAdminToken = process.env.PLATFORM_ADMIN_API_KEY!;
  const originalSend = s3.send.bind(s3);

  if (redis.status !== "ready") {
    await redis.connect();
  }
  await redis.flushdb();
  (s3 as any).send = async () => ({});

  const { baseUrl, server } = await startTestServer(app);
  let firmAId: string | null = null;
  let firmBId: string | null = null;
  let caseId: string | null = null;
  let documentId: string | null = null;

  try {
    const createFirmA = await postJson(
      `${baseUrl}/firms`,
      { name: `Proof Firm A ${suffix}`, plan: "starter" },
      platformAdminToken
    );
    assert(createFirmA.status === 200, `Expected create firm A to return 200, got ${createFirmA.status}`);
    const firmAJson = (await createFirmA.json()) as { ok?: boolean; firm?: JsonRecord };
    assert(firmAJson.ok === true && typeof firmAJson.firm?.id === "string", "Expected firm A to be created.");
    firmAId = firmAJson.firm!.id;
    const firmAIdValue = firmAJson.firm!.id as string;

    const routingRule = await prisma.routingRule.findUnique({ where: { firmId: firmAIdValue } });
    assert(!!routingRule, "Expected firm bootstrap to create a default routing rule.");
    assert(routingRule?.autoRouteEnabled === false, "Expected default routing rule to keep auto-route disabled.");

    const createAdminA = await postJson(
      `${baseUrl}/firms/${firmAIdValue}/users`,
      { email: firmAEmail, password: adminPassword, role: "FIRM_ADMIN" },
      platformAdminToken
    );
    assert(createAdminA.status === 200, `Expected create admin A to return 200, got ${createAdminA.status}`);
    const adminAJson = (await createAdminA.json()) as { ok?: boolean; user?: JsonRecord };
    assert(adminAJson.ok === true, "Expected admin A response to be ok.");
    assert(adminAJson.user?.loginReady === true, "Expected admin A to be login-ready.");

    const adminAToken = await login(baseUrl, firmAEmail, adminPassword);
    const authMeResponse = await fetch(`${baseUrl}/auth/me`, {
      headers: { Authorization: `Bearer ${adminAToken}` },
    });
    assert(authMeResponse.status === 200, `Expected auth/me to return 200, got ${authMeResponse.status}`);
    const authMeJson = (await authMeResponse.json()) as { ok?: boolean; firm?: JsonRecord; user?: JsonRecord; role?: string };
    assert(authMeJson.ok === true, "Expected auth/me to return ok.");
    assert(authMeJson.firm?.id === firmAIdValue, "Expected auth/me to return firm A.");
    assert(authMeJson.role === "FIRM_ADMIN", `Expected admin A role FIRM_ADMIN, got ${authMeJson.role}`);

    const createStaff = await postJson(
      `${baseUrl}/firms/${firmAIdValue}/users`,
      { email: staffEmail, password: staffPassword, role: "STAFF" },
      adminAToken
    );
    assert(createStaff.status === 200, `Expected create staff to return 200, got ${createStaff.status}`);
    const staffToken = await login(baseUrl, staffEmail, staffPassword);

    const staffKeyAttempt = await postJson(
      `${baseUrl}/firms/${firmAIdValue}/api-keys`,
      { name: "Staff should fail" },
      staffToken
    );
    assert(staffKeyAttempt.status === 403, `Expected staff API key creation to return 403, got ${staffKeyAttempt.status}`);

    const noAuthDevFirm = await fetch(`${baseUrl}/dev/create-firm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: `Blocked dev firm ${suffix}` }),
    });
    assert(noAuthDevFirm.status === 401, `Expected unauthenticated /dev/create-firm to return 401, got ${noAuthDevFirm.status}`);

    const staffDevFirm = await postJson(
      `${baseUrl}/dev/create-firm`,
      { name: `Blocked dev firm ${suffix}` },
      staffToken
    );
    assert(staffDevFirm.status === 403, `Expected staff /dev/create-firm to return 403, got ${staffDevFirm.status}`);

    const staffDevKey = await postJson(
      `${baseUrl}/dev/create-api-key/${firmAIdValue}`,
      { name: "Blocked dev key" },
      staffToken
    );
    assert(staffDevKey.status === 403, `Expected staff /dev/create-api-key to return 403, got ${staffDevKey.status}`);

    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      const prodDevFirm = await postJson(
        `${baseUrl}/dev/create-firm`,
        { name: `Prod blocked dev firm ${suffix}` },
        platformAdminToken
      );
      assert(prodDevFirm.status === 404, `Expected production /dev/create-firm to return 404, got ${prodDevFirm.status}`);

      const prodAdminDevKey = await postJson(
        `${baseUrl}/admin/dev/create-api-key`,
        { name: "Prod blocked admin key" },
        platformAdminToken
      );
      assert(
        prodAdminDevKey.status === 404,
        `Expected production /admin/dev/create-api-key to return 404, got ${prodAdminDevKey.status}`
      );

      const prodDevKey = await postJson(
        `${baseUrl}/dev/create-api-key/${firmAIdValue}`,
        { name: "Prod blocked dev key" },
        platformAdminToken
      );
      assert(prodDevKey.status === 404, `Expected production /dev/create-api-key to return 404, got ${prodDevKey.status}`);
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
    }

    const createFirmB = await postJson(
      `${baseUrl}/firms`,
      { name: `Proof Firm B ${suffix}`, plan: "starter" },
      platformAdminToken
    );
    assert(createFirmB.status === 200, `Expected create firm B to return 200, got ${createFirmB.status}`);
    const firmBJson = (await createFirmB.json()) as { ok?: boolean; firm?: JsonRecord };
    assert(firmBJson.ok === true && typeof firmBJson.firm?.id === "string", "Expected firm B to be created.");
    firmBId = firmBJson.firm!.id;
    const firmBIdValue = firmBJson.firm!.id as string;

    const createAdminB = await postJson(
      `${baseUrl}/firms/${firmBIdValue}/users`,
      { email: firmBEmail, password: adminPassword, role: "FIRM_ADMIN" },
      platformAdminToken
    );
    assert(createAdminB.status === 200, `Expected create admin B to return 200, got ${createAdminB.status}`);
    const adminBToken = await login(baseUrl, firmBEmail, adminPassword);

    const createCase = await postJson(
      `${baseUrl}/cases`,
      {
        title: "Onboarding proof case",
        caseNumber: `ONBOARD-${suffix}`,
        clientName: "Proof Client",
      },
      adminAToken
    );
    assert(createCase.status === 201, `Expected create case to return 201, got ${createCase.status}`);
    const caseJson = (await createCase.json()) as { ok?: boolean; item?: JsonRecord };
    assert(caseJson.ok === true && typeof caseJson.item?.id === "string", "Expected case to be created.");
    caseId = caseJson.item!.id;
    const caseIdValue = caseJson.item!.id as string;

    const createApiKey = await postJson(
      `${baseUrl}/firms/${firmAIdValue}/api-keys`,
      { name: "Proof ingest key" },
      adminAToken
    );
    assert(createApiKey.status === 200, `Expected create API key to return 200, got ${createApiKey.status}`);
    const apiKeyJson = (await createApiKey.json()) as { ok?: boolean; apiKey?: string };
    assert(apiKeyJson.ok === true && typeof apiKeyJson.apiKey === "string", "Expected ingest API key.");
    const apiKeyValue = apiKeyJson.apiKey as string;

    const pdfBuffer = await buildPdfBuffer();
    const pdfArrayBuffer = pdfBuffer.buffer.slice(
      pdfBuffer.byteOffset,
      pdfBuffer.byteOffset + pdfBuffer.byteLength
    ) as ArrayBuffer;
    const uploadForm = new FormData();
    uploadForm.append("source", "onboarding-proof");
    uploadForm.append("file", new Blob([pdfArrayBuffer], { type: "application/pdf" }), "proof.pdf");

    const uploadResponse = await fetch(`${baseUrl}/ingest`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKeyValue}` },
      body: uploadForm,
    });
    assert(uploadResponse.status === 200, `Expected ingest to return 200, got ${uploadResponse.status}`);
    const uploadJson = (await uploadResponse.json()) as { ok?: boolean; documentId?: string; spacesKey?: string };
    assert(uploadJson.ok === true && typeof uploadJson.documentId === "string", "Expected upload to create a document.");
    documentId = uploadJson.documentId!;
    const documentIdValue = uploadJson.documentId as string;

    const storedDocument = await prisma.document.findFirst({
      where: { id: documentIdValue, firmId: firmAIdValue },
      select: { id: true, spacesKey: true, routedCaseId: true },
    });
    assert(!!storedDocument, "Expected uploaded document to exist for firm A.");
    assert(
      storedDocument?.spacesKey.startsWith(`${firmAIdValue}/`) === true,
      `Expected storage key to start with firm scope, got ${storedDocument?.spacesKey}`
    );
    assert(storedDocument?.routedCaseId == null, "Expected ingest upload to stay unrouted before attach.");

    const attachResponse = await postJson(
      `${baseUrl}/cases/${caseIdValue}/documents`,
      { documentId: documentIdValue },
      adminAToken
    );
    assert(attachResponse.status === 201, `Expected attach-to-case to return 201, got ${attachResponse.status}`);
    const attachJson = (await attachResponse.json()) as { ok?: boolean; item?: JsonRecord };
    assert(attachJson.ok === true, "Expected attach-to-case response to be ok.");

    const crossFirmCaseRead = await fetch(`${baseUrl}/cases/${caseIdValue}`, {
      headers: { Authorization: `Bearer ${adminBToken}` },
    });
    assert(crossFirmCaseRead.status === 404, `Expected other firm case read to return 404, got ${crossFirmCaseRead.status}`);

    const crossFirmAttach = await postJson(
      `${baseUrl}/cases/${caseIdValue}/documents`,
      { documentId: documentIdValue },
      adminBToken
    );
    assert(crossFirmAttach.status === 404, `Expected other firm attach to return 404, got ${crossFirmAttach.status}`);

    const auditEvent = await prisma.documentAuditEvent.findFirst({
      where: { documentId: documentIdValue, action: "attached_to_case" },
      orderBy: { createdAt: "desc" },
    });
    assert(!!auditEvent, "Expected an attached_to_case audit event.");
    assert(auditEvent?.firmId === firmAIdValue, "Expected document audit event to keep firm context.");

    const queuedSnapshot = await getRedisQueueSnapshot();
    assert(
      (queuedSnapshot.byFirm[firmAIdValue]?.queued ?? 0) >= 2,
      `Expected queued jobs for firm A after upload+attach, got ${queuedSnapshot.byFirm[firmAIdValue]?.queued ?? 0}`
    );

    const removedTypes = await removeQueuedTypesForFirm(firmAIdValue, new Set(["ocr", "post_route_sync"]));
    assert(removedTypes.includes("ocr"), "Expected to remove firm A OCR job for focused worker proof.");

    const timelineOnlySnapshot = await getRedisQueueSnapshot();
    assert(
      timelineOnlySnapshot.byFirm[firmAIdValue]?.queued === 1,
      `Expected one queued timeline job for firm A, got ${timelineOnlySnapshot.byFirm[firmAIdValue]?.queued ?? 0}`
    );

    startDocumentWorkerLoop({
      label: `onboarding-proof-worker-${suffix}`,
      concurrency: 1,
      ocrConcurrency: 1,
      perFirmConcurrency: 1,
      perFirmQueuedCap: 5,
    }).catch((error) => {
      console.error("Onboarding proof worker failed", error);
    });

    await waitForTimelineRebuild(caseIdValue, firmAIdValue);

    const postWorkerSnapshot = await getRedisQueueSnapshot();
    assert(
      (postWorkerSnapshot.byFirm[firmAIdValue]?.queued ?? 0) === 0,
      `Expected firm A queue to drain after worker proof, got ${postWorkerSnapshot.byFirm[firmAIdValue]?.queued ?? 0}`
    );

    console.log("Firm onboarding proof passed", {
      firmAId,
      firmBId,
      caseId,
      documentId,
      queuedAfterAttach: queuedSnapshot.byFirm[firmAIdValue]?.queued ?? 0,
      removedTypes,
      workerDrainedFirmQueue: postWorkerSnapshot.byFirm[firmAIdValue]?.queued ?? 0,
    });
  } finally {
    await stopTestServer(server);
    (s3 as any).send = originalSend;
    await redis.flushdb().catch(() => {});

    if (firmAId || firmBId) {
      const firmIds = [firmAId, firmBId].filter((value): value is string => typeof value === "string");
      await prisma.caseTimelineEvent.deleteMany({ where: { firmId: { in: firmIds } } }).catch(() => {});
      await prisma.caseTimelineRebuild.deleteMany({ where: { firmId: { in: firmIds } } }).catch(() => {});
      await prisma.documentAuditEvent.deleteMany({ where: { firmId: { in: firmIds } } }).catch(() => {});
      await prisma.notification.deleteMany({ where: { firmId: { in: firmIds } } }).catch(() => {});
      await prisma.document.deleteMany({ where: { firmId: { in: firmIds } } }).catch(() => {});
      await prisma.apiKey.deleteMany({ where: { firmId: { in: firmIds } } }).catch(() => {});
      await prisma.legalCase.deleteMany({ where: { firmId: { in: firmIds } } }).catch(() => {});
      await prisma.contact.deleteMany({ where: { firmId: { in: firmIds } } }).catch(() => {});
      await prisma.routingRule.deleteMany({ where: { firmId: { in: firmIds } } }).catch(() => {});
      await prisma.user.deleteMany({ where: { firmId: { in: firmIds } } }).catch(() => {});
      await prisma.firm.deleteMany({ where: { id: { in: firmIds } } }).catch(() => {});
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
      Promise.allSettled([prisma.$disconnect(), redis.quit()]),
      new Promise((resolve) => setTimeout(resolve, 1000)),
    ]);
    process.exit(exitCode);
  });
