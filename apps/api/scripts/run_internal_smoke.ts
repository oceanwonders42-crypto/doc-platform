#!/usr/bin/env node
import "dotenv/config";

import assert from "node:assert/strict";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import path from "node:path";

import {
  CreateBucketCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import Redis from "ioredis";
import {
  IntegrationProvider,
  IntegrationStatus,
  IntegrationType,
  JobStatus,
  MailboxProvider,
  Prisma,
} from "@prisma/client";

import { prisma } from "../src/db/prisma";
import { pgPool } from "../src/db/pg";
import { bootstrapFirmOnboarding } from "../src/services/firmOnboarding";
import { encryptSecret } from "../src/services/credentialEncryption";
import { canUseClioAutoUpdate } from "../src/services/planPolicy";
import { hasFeature } from "../src/services/featureFlags";
import { getPostRouteClioAutoUpdateGateSource } from "../src/workers/documentWorkerLoop";

type SmokeSummary = {
  localSmokeEnv: {
    firmCreated: boolean;
    adminUserCreated: boolean;
    caseCreated: boolean;
    encryptionKeySet: boolean;
    firmId: string;
    adminUserId: string;
    caseId: string;
  };
  mailbox: {
    realMailboxSmoke: boolean;
    blocker: string | null;
    sandboxHarness: {
      ok: boolean;
      method: string;
      mailboxId: string;
      integrationId: string;
      fixtureId: string;
      realNetworkCall: boolean;
      documentIds: string[];
    };
  };
  clio: {
    realClioSmoke: boolean;
    blocker: string | null;
    sandboxStub: {
      ok: boolean;
      gateSource: "entitlement" | "legacy_flag" | null;
      integrationId: string | null;
      pushEventAction: string | null;
      writeBackEventAction: string | null;
      claimNumberStatus: string | null;
      claimNumberCandidate: string | null;
      policyNumberCandidate: string | null;
      insuranceCarrierCandidate: string | null;
      realNetworkCall: boolean;
      reason: string;
    };
  };
  productSmoke: {
    ingestion: "PASS" | "FAIL";
    assignmentOrReviewFallback: "PASS" | "FAIL";
    demandCreation: "PASS" | "FAIL";
    demandStorage: "PASS" | "FAIL";
    feedbackStorage: "PASS" | "FAIL";
    clioBehavior: "PASS" | "FAIL";
    details: {
      strongDocumentId: string;
      ambiguousDocumentId: string;
      clioDocumentId: string;
      strongAssignedCaseId: string | null;
      ambiguousReviewReasons: string[];
      demandPackageId: string | null;
      generatedDocumentId: string | null;
      limitations: string[];
      routingFeedbackCount: number;
      demandSectionSourceTypes: string[];
    };
  };
};

const apiRoot = process.cwd();
const repoRoot = path.resolve(apiRoot, "..", "..");
const baseUrl = "http://127.0.0.1:4010";
const smokeRunToken = Date.now().toString(36);
const smokePassword = "SmokePass123!";
const smokeEmail = `smoke-admin-${smokeRunToken}@local.onyx`;
const smokeFirmName = "Internal Smoke Firm";
const smokePlan = "essential";
const mailboxSandboxFixtureId = "internal_smoke_mailbox";
const SMOKE_QUEUE_KEY = "doc_jobs";
const SMOKE_JOB_STATE_KEY_PATTERN = "doc_job_state:*";
const SMOKE_FIRM_SLOT_KEY_PATTERN = "doc_job_firm_slot:*";
const localEncryptionKey =
  process.env.ENCRYPTION_KEY?.trim() ||
  "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff";

process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY?.trim() || localEncryptionKey;
process.env.ONYX_ENABLE_LOCAL_MAILBOX_SANDBOX =
  process.env.ONYX_ENABLE_LOCAL_MAILBOX_SANDBOX?.trim() || "true";
process.env.ONYX_ENABLE_LOCAL_SMOKE_QUEUE_CLEANUP =
  process.env.ONYX_ENABLE_LOCAL_SMOKE_QUEUE_CLEANUP?.trim() || "true";
process.env.S3_ENDPOINT = "http://127.0.0.1:9000";
process.env.S3_ACCESS_KEY = "minioadmin";
process.env.S3_SECRET_KEY = "minioadmin";
process.env.S3_BUCKET = process.env.S3_BUCKET?.trim() || "docs";
process.env.S3_REGION = process.env.S3_REGION?.trim() || "us-east-1";

type LocalSmokeQueueState = {
  queueDepth: number;
  stateKeyCount: number;
  slotKeyCount: number;
  nonTerminalDbJobCount: number;
};

function randomId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

async function waitForHttp(url: string, timeoutMs = 30_000) {
  const start = Date.now();
  let lastError: unknown = null;
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
      lastError = new Error(`Unexpected status ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await sleep(500);
  }
  throw lastError ?? new Error(`Timed out waiting for ${url}`);
}

function spawnManagedProcess(label: string, command: string, args: string[], extraEnv: Record<string, string>): ChildProcess {
  const child = spawn(command, args, {
    cwd: apiRoot,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      PORT: "4010",
      NODE_ENV: "development",
      ENCRYPTION_KEY: localEncryptionKey,
      ONYX_ENABLE_LOCAL_CASE_API_SANDBOX: "true",
      ONYX_ENABLE_LOCAL_MAILBOX_SANDBOX: "true",
      CLIO_API_BASE_URL: "http://127.0.0.1:1/local-case-api-disabled",
      S3_ACCESS_KEY: "minioadmin",
      S3_SECRET_KEY: "minioadmin",
      ...extraEnv,
    },
  });
  child.stdout?.on("data", (chunk) => process.stdout.write(`[${label}] ${chunk}`));
  child.stderr?.on("data", (chunk) => process.stderr.write(`[${label}] ${chunk}`));
  return child;
}

async function stopManagedProcess(child: ChildProcess | null | undefined) {
  if (!child || child.exitCode != null) return;
  child.kill();
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    sleep(5_000).then(() => {
      if (child.exitCode == null) {
        child.kill("SIGKILL");
      }
    }),
  ]);
}

function killStaleIntegrationSyncWorkers() {
  const workerScriptPath = path.join(apiRoot, "dist", "workers", "integrationSyncWorker.js");
  if (process.platform === "win32") {
    const escapedPath = workerScriptPath.replace(/\\/g, "\\\\");
    spawnSync(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        [
          "$currentPid = $PID",
          "Get-CimInstance Win32_Process",
          "| Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -like '*integrationSyncWorker.js*' -and $_.CommandLine -like '*" +
            escapedPath +
            "*' }",
          "| ForEach-Object { if ($_.ProcessId -ne $currentPid) { Stop-Process -Id $_.ProcessId -Force } }",
        ].join(" "),
      ],
      { stdio: "ignore" }
    );
    return;
  }
  spawnSync("pkill", ["-f", workerScriptPath], { stdio: "ignore" });
}

function createS3Client() {
  return new S3Client({
    region: process.env.S3_REGION || "us-east-1",
    endpoint: "http://127.0.0.1:9000",
    forcePathStyle: true,
    credentials: {
      accessKeyId: "minioadmin",
      secretAccessKey: "minioadmin",
    },
  });
}

async function ensureDocsBucketExists(client: S3Client) {
  try {
    await client.send(new HeadBucketCommand({ Bucket: "docs" }));
  } catch {
    await client.send(new CreateBucketCommand({ Bucket: "docs" }));
  }
}

function isLocalSmokeQueueCleanupEnabled() {
  return (
    process.env.NODE_ENV !== "production"
    && process.env.ONYX_ENABLE_LOCAL_SMOKE_QUEUE_CLEANUP === "true"
  );
}

async function scanRedisKeys(redis: Redis, pattern: string) {
  const keys: string[] = [];
  let cursor = "0";
  do {
    const [nextCursor, batch] = await redis.scan(cursor, "MATCH", pattern, "COUNT", 100);
    cursor = nextCursor;
    keys.push(...batch);
  } while (cursor !== "0");
  return keys;
}

async function getLocalSmokeQueueState(redis: Redis): Promise<LocalSmokeQueueState> {
  const [queueDepth, stateKeys, slotKeys, nonTerminalDbJobCount] = await Promise.all([
    redis.llen(SMOKE_QUEUE_KEY),
    scanRedisKeys(redis, SMOKE_JOB_STATE_KEY_PATTERN),
    scanRedisKeys(redis, SMOKE_FIRM_SLOT_KEY_PATTERN),
    prisma.job.count({
      where: {
        status: { in: ["queued", "running", "failed"] },
      },
    }),
  ]);

  return {
    queueDepth,
    stateKeyCount: stateKeys.length,
    slotKeyCount: slotKeys.length,
    nonTerminalDbJobCount,
  };
}

async function clearLocalSmokeQueueState() {
  if (!isLocalSmokeQueueCleanupEnabled()) {
    throw new Error("Local smoke queue cleanup requires non-production runtime plus ONYX_ENABLE_LOCAL_SMOKE_QUEUE_CLEANUP=true.");
  }

  const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");
  try {
    const before = await getLocalSmokeQueueState(redis);
    const [stateKeys, slotKeys] = await Promise.all([
      scanRedisKeys(redis, SMOKE_JOB_STATE_KEY_PATTERN),
      scanRedisKeys(redis, SMOKE_FIRM_SLOT_KEY_PATTERN),
    ]);

    await redis.del(SMOKE_QUEUE_KEY);
    if (stateKeys.length > 0) {
      await redis.del(...stateKeys);
    }
    if (slotKeys.length > 0) {
      await redis.del(...slotKeys);
    }

    const after = await getLocalSmokeQueueState(redis);
    console.log("[smoke] local queue cleanup", { before, after });

    assert.equal(after.queueDepth, 0, "Expected local smoke queue cleanup to clear Redis doc_jobs.");
    assert.equal(after.stateKeyCount, 0, "Expected local smoke queue cleanup to clear Redis doc_job_state markers.");
    assert.equal(after.slotKeyCount, 0, "Expected local smoke queue cleanup to clear Redis firm slot markers.");

    return { before, after };
  } finally {
    await redis.quit().catch(() => undefined);
  }
}

async function seedSmokeFirm() {
  const existingFirm = await prisma.firm.findFirst({
    where: { name: smokeFirmName },
    select: { id: true },
  });

  if (existingFirm) {
    const existingFeedbackDocs = await prisma.routingFeedback.findMany({
      where: { firmId: existingFirm.id },
      select: { documentId: true },
    });
    const existingDocIds = [
      ...new Set(existingFeedbackDocs.map((row) => row.documentId)),
    ];
    await prisma.routingFeedback.deleteMany({ where: { firmId: existingFirm.id } }).catch(() => undefined);
    await prisma.demandPackageSectionSource.deleteMany({ where: { firmId: existingFirm.id } }).catch(() => undefined);
    await prisma.demandPackage.deleteMany({ where: { firmId: existingFirm.id } }).catch(() => undefined);
    await prisma.caseTimelineEvent.deleteMany({ where: { firmId: existingFirm.id } }).catch(() => undefined);
    await prisma.recordsRequest.deleteMany({ where: { firmId: existingFirm.id } }).catch(() => undefined);
    await prisma.caseFinancial.deleteMany({ where: { firmId: existingFirm.id } }).catch(() => undefined);
    await prisma.caseSummary.deleteMany({ where: { firmId: existingFirm.id } }).catch(() => undefined);
    await prisma.caseProvider.deleteMany({ where: { firmId: existingFirm.id } }).catch(() => undefined);
    await prisma.provider.deleteMany({ where: { firmId: existingFirm.id } }).catch(() => undefined);
    await prisma.document.deleteMany({ where: { firmId: existingFirm.id } }).catch(() => undefined);
    if (existingDocIds.length > 0) {
      await pgPool.query(
        `delete from document_recognition where document_id = any($1::text[])`,
        [existingDocIds]
      ).catch(() => undefined);
    }
    await prisma.legalCase.deleteMany({ where: { firmId: existingFirm.id } }).catch(() => undefined);
    await prisma.contact.deleteMany({ where: { firmId: existingFirm.id } }).catch(() => undefined);
    await prisma.demandBankSection.deleteMany({
      where: { document: { firmId: existingFirm.id } },
    }).catch(() => undefined);
    await prisma.demandBankDocument.deleteMany({ where: { firmId: existingFirm.id } }).catch(() => undefined);
    await prisma.apiKey.deleteMany({ where: { firmId: existingFirm.id } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { firmId: existingFirm.id } }).catch(() => undefined);
    await prisma.routingRule.deleteMany({ where: { firmId: existingFirm.id } }).catch(() => undefined);
    await prisma.firm.deleteMany({ where: { id: existingFirm.id } }).catch(() => undefined);
  }

  const onboarding = await bootstrapFirmOnboarding({
    name: smokeFirmName,
    plan: smokePlan,
    adminEmail: smokeEmail,
    adminPassword: smokePassword,
    apiKeyName: "Smoke ingest key",
  });

  await prisma.firm.update({
    where: { id: onboarding.firm.id },
    data: {
      features: [
        "demand_narratives",
        "insurance_extraction",
        "duplicates_detection",
        "crm_sync",
      ] as Prisma.InputJsonValue,
    },
  });

  const contactId = randomId("smoke-contact");
  const caseId = randomId("smoke-case");
  const providerId = randomId("smoke-provider");
  const caseNumber = "SMOKE-2026-001";

  await prisma.contact.create({
    data: {
      id: contactId,
      firmId: onboarding.firm.id,
      firstName: "Riley",
      lastName: "Carter",
      fullName: "Riley Carter",
      dateOfBirth: new Date("1988-07-15T00:00:00.000Z"),
    },
  });

  await prisma.legalCase.create({
    data: {
      id: caseId,
      firmId: onboarding.firm.id,
      title: "Riley Carter v. Safe Harbor Insurance",
      caseNumber,
      clientName: "Riley Carter",
      clientContactId: contactId,
      assignedUserId: onboarding.user.id,
      incidentDate: new Date("2026-02-14T00:00:00.000Z"),
      notes: "Rear-end collision with ongoing cervical and lumbar complaints.",
    },
  });

  await prisma.provider.create({
    data: {
      id: providerId,
      firmId: onboarding.firm.id,
      name: "Harbor Physical Therapy",
      address: "123 Harbor Ave",
      specialty: "Physical Therapy",
      city: "New York",
      state: "NY",
    },
  });

  await prisma.caseProvider.create({
    data: {
      firmId: onboarding.firm.id,
      caseId,
      providerId,
    },
  });

  await prisma.caseSummary.create({
    data: {
      firmId: onboarding.firm.id,
      caseId,
      body: "Client sustained cervical and lumbar strains after a rear-end collision and pursued immediate conservative care.",
    },
  });

  await prisma.caseFinancial.create({
    data: {
      firmId: onboarding.firm.id,
      caseId,
      medicalBillsTotal: 18500,
      settlementOffer: 22000,
      liensTotal: 1500,
    },
  });

  await prisma.recordsRequest.create({
    data: {
      firmId: onboarding.firm.id,
      caseId,
      providerId,
      providerName: "Harbor Imaging Center",
      status: "SENT",
      requestDate: new Date("2026-04-01T00:00:00.000Z"),
    },
  });

  const demandBankDocumentId = randomId("smoke-demand-doc");
  await prisma.demandBankDocument.create({
    data: {
      id: demandBankDocumentId,
      firmId: onboarding.firm.id,
      matterId: "smoke-pattern-library",
      title: "Firm-approved cervical strain demand",
      originalText: "Approved demand example for cervical strain treatment.",
      redactedText: "Approved demand example for [CLIENT] describing consistent conservative treatment after a rear-end collision.",
      summary: "Approved reusable cervical strain demand example.",
      caseType: "motor_vehicle",
      liabilityType: "rear_end",
      injuryTags: ["cervical strain", "lumbar strain"],
      treatmentTags: ["physical therapy"],
      bodyPartTags: ["neck", "back"],
      totalBillsAmount: 18500,
      demandAmount: 60000,
      templateFamily: "pre_suit_demand",
      toneStyle: "assertive",
      qualityScore: 92,
      approvedForReuse: true,
      reviewStatus: "approved",
    },
  });
  await prisma.demandBankSection.create({
    data: {
      demandBankDocumentId,
      sectionType: "treatment_summary",
      heading: "Treatment Overview",
      originalText: "Treatment summary original text.",
      redactedText: "[CLIENT] treated with physical therapy, diagnostic imaging, and continued follow-up care.",
      qualityScore: 91,
      approvedForReuse: true,
    },
  });

  return {
    firmId: onboarding.firm.id,
    adminUserId: onboarding.user.id,
    caseId,
    caseNumber,
    providerName: "Harbor Physical Therapy",
  };
}

async function seedSmokeCaseApiSandboxIntegration(params: { firmId: string; caseId: string }) {
  const sandboxMatterId = `sandbox-matter-${params.caseId}`;
  const integration = await prisma.firmIntegration.create({
    data: {
      firmId: params.firmId,
      type: IntegrationType.CASE_API,
      provider: IntegrationProvider.CLIO,
      status: IntegrationStatus.CONNECTED,
    },
  });
  await prisma.integrationCredential.create({
    data: {
      integrationId: integration.id,
      encryptedSecret: encryptSecret(
        JSON.stringify({
          accessToken: "local-case-api-sandbox-token",
          sandboxMode: "local_case_api",
          sandboxLabel: "Internal smoke CASE_API sandbox",
        })
      ),
    },
  });
  await prisma.fieldMapping.create({
    data: {
      firmId: params.firmId,
      integrationId: integration.id,
      sourceField: "claimNumber",
      targetField: "sandbox-claim-number-field",
    },
  });
  await prisma.crmCaseMapping.upsert({
    where: {
      firmId_caseId: {
        firmId: params.firmId,
        caseId: params.caseId,
      },
    },
    update: {
      externalMatterId: sandboxMatterId,
    },
    create: {
      firmId: params.firmId,
      caseId: params.caseId,
      externalMatterId: sandboxMatterId,
    },
  });

  const firm = await prisma.firm.findUniqueOrThrow({
    where: { id: params.firmId },
    select: { settings: true },
  });
  const currentSettings = asRecord(firm.settings) ?? {};
  await prisma.firm.update({
    where: { id: params.firmId },
    data: {
      settings: {
        ...currentSettings,
        crm: "clio",
        crmIntegrationId: integration.id,
      } as Prisma.InputJsonValue,
    },
  });

  return {
    integrationId: integration.id,
    sandboxMatterId,
    claimNumberCustomFieldId: "sandbox-claim-number-field",
  };
}

async function seedSmokeMailboxSandbox(params: { firmId: string }) {
  const integration = await prisma.firmIntegration.create({
    data: {
      firmId: params.firmId,
      type: IntegrationType.EMAIL,
      provider: IntegrationProvider.GENERIC,
      status: IntegrationStatus.CONNECTED,
    },
  });
  await prisma.integrationCredential.create({
    data: {
      integrationId: integration.id,
      encryptedSecret: encryptSecret(
        JSON.stringify({
          imapHost: "127.0.0.1",
          imapPort: 1,
          imapSecure: false,
          imapUsername: "smoke-mailbox@local.onyx",
          imapPassword: "sandbox-only",
          folder: "INBOX",
          sandboxMode: "local_imap_fixture",
          sandboxLabel: "Internal smoke mailbox sandbox",
          sandboxFixtureId: mailboxSandboxFixtureId,
        })
      ),
    },
  });
  const mailbox = await prisma.mailboxConnection.create({
    data: {
      firmId: params.firmId,
      emailAddress: "smoke-mailbox@local.onyx",
      provider: MailboxProvider.IMAP,
      active: true,
      integrationId: integration.id,
    },
  });

  return {
    integrationId: integration.id,
    mailboxId: mailbox.id,
    fixtureId: mailboxSandboxFixtureId,
  };
}

async function loginAndGetJwt() {
  const response = await fetch(`${baseUrl}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: smokeEmail, password: smokePassword }),
  });
  const json = (await response.json()) as { ok?: boolean; token?: string; error?: string };
  assert.equal(response.status, 200, `Expected login 200, got ${response.status}: ${json.error ?? "unknown error"}`);
  assert.equal(Boolean(json.ok), true, "Expected login ok=true");
  assert.ok(json.token, "Expected login token");
  return json.token!;
}

async function waitForMailboxDocuments(params: {
  firmId: string;
  originalNames: string[];
  timeoutMs?: number;
}) {
  const deadline = Date.now() + (params.timeoutMs ?? 30_000);
  while (Date.now() < deadline) {
    const docs = await prisma.document.findMany({
      where: {
        firmId: params.firmId,
        source: "email",
        originalName: { in: params.originalNames },
      },
      select: {
        id: true,
        originalName: true,
      },
      orderBy: { ingestedAt: "asc" },
    });
    const byName = new Map(docs.map((doc) => [doc.originalName, doc.id]));
    if (params.originalNames.every((name) => byName.has(name))) {
      return {
        strongDocumentId: byName.get("smoke-strong-record.pdf")!,
        ambiguousDocumentId: byName.get("smoke-ambiguous-note.pdf")!,
        clioDocumentId: byName.get("smoke-clio-routing-letter.pdf")!,
      };
    }
    await sleep(500);
  }
  throw new Error("Timed out waiting for mailbox-ingested documents");
}

async function waitForMailboxSandboxPoll(params: {
  mailboxId: string;
  integrationId: string;
  timeoutMs?: number;
}) {
  const deadline = Date.now() + (params.timeoutMs ?? 30_000);
  while (Date.now() < deadline) {
    const mailbox = await prisma.mailboxConnection.findUnique({
      where: { id: params.mailboxId },
      select: { lastUid: true, lastSyncAt: true },
    });
    const logs = await prisma.integrationSyncLog.findMany({
      where: {
        integrationId: params.integrationId,
        eventType: { in: ["mailbox_sandbox_poll", "attachment_ingested", "sync"] },
      },
      orderBy: { createdAt: "asc" },
      select: {
        eventType: true,
        status: true,
        message: true,
      },
    });
    const attachmentSuccessCount = logs.filter(
      (row) => row.eventType === "attachment_ingested" && row.status === "success"
    ).length;
    const sandboxPollLog = logs.find((row) => row.eventType === "mailbox_sandbox_poll") ?? null;
    const syncSuccessLog = logs.find(
      (row) => row.eventType === "sync" && row.status === "success"
    ) ?? null;
    if (
      mailbox?.lastUid === "1003" &&
      mailbox.lastSyncAt &&
      sandboxPollLog &&
      syncSuccessLog &&
      attachmentSuccessCount === 3
    ) {
      return {
        mailbox,
        logs,
        sandboxPollLog,
        syncSuccessLog,
      };
    }
    await sleep(500);
  }
  throw new Error("Timed out waiting for mailbox sandbox poll completion");
}

async function seedClioSandboxRecognitionSnapshot(params: {
  caseId: string;
  caseNumber: string;
  documentId: string;
}) {
  const claimNumber = "CLM-SMOKE-4242";
  const policyNumber = "POL-SMOKE-7788";
  const insuranceCompany = "Safe Harbor Insurance";
  await prisma.document.update({
    where: { id: params.documentId },
    data: {
      extractedFields: {
        claimNumber,
        policyNumber,
        insurerName: insuranceCompany,
        docType: "insurance_letter",
      } as Prisma.InputJsonValue,
      confidence: 0.98,
    },
  });

  await pgPool.query(
    `
    insert into document_recognition
      (document_id, text_excerpt, doc_type, client_name, case_number, suggested_case_id, confidence, match_confidence, match_reason, insurance_fields, updated_at)
    values
      ($1, $2, 'insurance_letter', 'Riley Carter', $3, $4, 0.98, 0.98, 'Local CASE_API sandbox smoke routing snapshot.', $5::jsonb, now())
    on conflict (document_id) do update set
      text_excerpt = excluded.text_excerpt,
      doc_type = excluded.doc_type,
      client_name = excluded.client_name,
      case_number = excluded.case_number,
      suggested_case_id = excluded.suggested_case_id,
      confidence = excluded.confidence,
      match_confidence = excluded.match_confidence,
      match_reason = excluded.match_reason,
      insurance_fields = excluded.insurance_fields,
      updated_at = now()
    `,
    [
      params.documentId,
      [
        "Insurance Letter",
        "Client: Riley Carter",
        `Case Number: ${params.caseNumber}`,
        "Carrier: Safe Harbor Insurance",
        "Claim Number: CLM-SMOKE-4242",
        "Policy Number: POL-SMOKE-7788",
        "Date of Loss: 02/14/2026",
      ].join("\n"),
      params.caseNumber,
      params.caseId,
      JSON.stringify({
        claimNumber,
        policyNumber,
        insuranceCompany,
      }),
    ]
  );
}

async function callJson(
  token: string,
  method: string,
  pathName: string,
  body?: unknown
) {
  const response = await fetch(`${baseUrl}${pathName}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = await response.json().catch(() => ({}));
  return { response, json };
}

async function waitForDemandJob(jobId: string, timeoutMs = 60_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      select: { status: true, lastError: true },
    });
    if (job?.status === JobStatus.done) return job;
    if (job?.status === JobStatus.failed) {
      throw new Error(`Demand job failed: ${job.lastError ?? "unknown error"}`);
    }
    await sleep(1000);
  }
  throw new Error(`Timed out waiting for demand job ${jobId}`);
}

async function waitForClioSandboxAudit(documentId: string, timeoutMs = 60_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const rows = await prisma.documentAuditEvent.findMany({
      where: {
        documentId,
        action: { in: ["clio_sandbox_document_pushed", "clio_sandbox_writeback"] },
      },
      orderBy: { createdAt: "asc" },
      select: {
        action: true,
        metaJson: true,
      },
    });
    const pushEvent = rows.find((row) => row.action === "clio_sandbox_document_pushed") ?? null;
    const writeBackEvent = rows.find((row) => row.action === "clio_sandbox_writeback") ?? null;
    if (pushEvent && writeBackEvent) {
      return { pushEvent, writeBackEvent };
    }
    await sleep(500);
  }
  throw new Error(`Timed out waiting for Clio sandbox audit events for ${documentId}`);
}

async function main() {
  let apiProcess: ChildProcess | null = null;
  let jobWorkerProcess: ChildProcess | null = null;
  let integrationSyncProcess: ChildProcess | null = null;

  try {
    killStaleIntegrationSyncWorkers();
    const queueCleanup = await clearLocalSmokeQueueState();

    const seeded = await seedSmokeFirm();
    const clioSandbox = await seedSmokeCaseApiSandboxIntegration({
      firmId: seeded.firmId,
      caseId: seeded.caseId,
    });
    const mailboxSandbox = await seedSmokeMailboxSandbox({
      firmId: seeded.firmId,
    });
    const smokeStartedAt = new Date();

    apiProcess = spawnManagedProcess("api", "node", ["dist/http/server.js"], {});
    jobWorkerProcess = spawnManagedProcess("job-worker", "node", ["dist/workers/jobQueueWorker.js"], {
      JOB_POLL_MS: "500",
    });
    integrationSyncProcess = spawnManagedProcess(
      "integration-sync",
      "node",
      ["dist/workers/integrationSyncWorker.js"],
      {
        INTEGRATION_SYNC_INTERVAL_MS: "600000",
        INTEGRATION_SYNC_MAILBOX_ID: mailboxSandbox.mailboxId,
        INTEGRATION_SYNC_FIRM_ID: seeded.firmId,
      }
    );
    await waitForHttp(`${baseUrl}/health`);

    const token = await loginAndGetJwt();
    const s3 = createS3Client();
    await ensureDocsBucketExists(s3);

    const mailboxPollState = await waitForMailboxSandboxPoll({
      mailboxId: mailboxSandbox.mailboxId,
      integrationId: mailboxSandbox.integrationId,
    });
    const mailboxDocs = await waitForMailboxDocuments({
      firmId: seeded.firmId,
      originalNames: [
        "smoke-strong-record.pdf",
        "smoke-ambiguous-note.pdf",
        "smoke-clio-routing-letter.pdf",
      ],
    });
    const recentlySyncedMailboxes = await prisma.mailboxConnection.findMany({
      where: {
        active: true,
        lastSyncAt: { gte: smokeStartedAt },
        integration: {
          is: {
            type: IntegrationType.EMAIL,
            provider: IntegrationProvider.GENERIC,
          },
        },
      },
      select: {
        id: true,
        firmId: true,
        emailAddress: true,
      },
      orderBy: { id: "asc" },
    });
    assert.equal(
      recentlySyncedMailboxes.length,
      1,
      `Expected only one mailbox to sync during smoke, got ${recentlySyncedMailboxes.length}: ${recentlySyncedMailboxes
        .map((row) => row.id)
        .join(", ")}`
    );
    assert.equal(
      recentlySyncedMailboxes[0]?.id,
      mailboxSandbox.mailboxId,
      "Expected only the smoke mailbox to be polled."
    );
    const firmEmailDocumentCount = await prisma.document.count({
      where: { firmId: seeded.firmId, source: "email" },
    });
    assert.equal(
      firmEmailDocumentCount,
      3,
      `Expected exactly 3 email documents from the scoped mailbox poll, got ${firmEmailDocumentCount}`
    );
    const strongDoc = { documentId: mailboxDocs.strongDocumentId };
    const ambiguousDoc = { documentId: mailboxDocs.ambiguousDocumentId };
    const clioDoc = { documentId: mailboxDocs.clioDocumentId };
    const allowedDeferredDocumentIds = new Set([
      strongDoc.documentId,
      ambiguousDoc.documentId,
      clioDoc.documentId,
    ]);
    const mailboxSandboxLogs = mailboxPollState.logs;
    const sandboxPollLog = mailboxPollState.sandboxPollLog;
    assert.ok(sandboxPollLog, "Expected mailbox sandbox poll log entry.");
    assert.match(
      sandboxPollLog.message ?? "",
      /realNetworkCall=false/,
      "Expected mailbox sandbox log to prove there was no IMAP network call."
    );
    assert.equal(
      mailboxSandboxLogs.filter((row) => row.eventType === "attachment_ingested" && row.status === "success").length,
      3,
      "Expected three attachment_ingested success logs from mailbox poll."
    );

    await prisma.caseTimelineEvent.create({
      data: {
        firmId: seeded.firmId,
        caseId: seeded.caseId,
        documentId: strongDoc.documentId,
        track: "medical",
        eventType: "physical_therapy",
        provider: seeded.providerName,
        diagnosis: "Cervical strain",
        procedure: "Physical therapy",
        amount: "18500",
      },
    });

    const strongRecognize = await callJson(token, "POST", `/documents/${strongDoc.documentId}/recognize`);
    assert.equal(strongRecognize.response.status, 200, `Strong recognize failed: ${JSON.stringify(strongRecognize.json)}`);

    const strongRematch = await callJson(token, "POST", `/documents/${strongDoc.documentId}/rematch`);
    assert.equal(strongRematch.response.status, 200, `Strong rematch failed: ${JSON.stringify(strongRematch.json)}`);
    assert.equal(strongRematch.json.caseId, seeded.caseId, "Expected strong document to match the seeded case.");

    const strongApprove = await callJson(token, "POST", `/documents/${strongDoc.documentId}/approve`, {});
    assert.equal(strongApprove.response.status, 200, `Strong approve failed: ${JSON.stringify(strongApprove.json)}`);

    const ambiguousRecognize = await callJson(token, "POST", `/documents/${ambiguousDoc.documentId}/recognize`);
    assert.equal(ambiguousRecognize.response.status, 200, `Ambiguous recognize failed: ${JSON.stringify(ambiguousRecognize.json)}`);

    const ambiguousRematch = await callJson(token, "POST", `/documents/${ambiguousDoc.documentId}/rematch`);
    assert.equal(ambiguousRematch.response.status, 200, `Ambiguous rematch failed: ${JSON.stringify(ambiguousRematch.json)}`);
    assert.ok(Array.isArray(ambiguousRematch.json.reviewReasons), "Expected ambiguous rematch to include reviewReasons.");

    const ambiguousReject = await callJson(token, "POST", `/documents/${ambiguousDoc.documentId}/reject`, {});
    assert.equal(ambiguousReject.response.status, 200, `Ambiguous reject failed: ${JSON.stringify(ambiguousReject.json)}`);

    const clioRecognize = await callJson(token, "POST", `/documents/${clioDoc.documentId}/recognize`);
    assert.equal(clioRecognize.response.status, 200, `Clio recognize failed: ${JSON.stringify(clioRecognize.json)}`);
    await seedClioSandboxRecognitionSnapshot({
      caseId: seeded.caseId,
      caseNumber: seeded.caseNumber,
      documentId: clioDoc.documentId,
    });
    const clioRoute = await callJson(token, "POST", `/documents/${clioDoc.documentId}/route`, {
      caseId: seeded.caseId,
      reason: "Local CASE_API sandbox smoke route",
    });
    assert.equal(clioRoute.response.status, 200, `Clio route failed: ${JSON.stringify(clioRoute.json)}`);
    const clioSandboxAudit = await waitForClioSandboxAudit(clioDoc.documentId);
    const clioSandboxLogs = await prisma.integrationSyncLog.findMany({
      where: {
        integrationId: clioSandbox.integrationId,
        eventType: { in: ["clio_sandbox_document_pushed", "clio_sandbox_writeback"] },
      },
      orderBy: { createdAt: "asc" },
      select: {
        eventType: true,
        status: true,
        message: true,
      },
    });
    const clioPushMeta = asRecord(clioSandboxAudit.pushEvent.metaJson);
    const clioWriteBackMeta = asRecord(clioSandboxAudit.writeBackEvent.metaJson);
    assert.equal(
      clioSandboxLogs.length,
      2,
      `Expected two sandbox integration logs, got ${clioSandboxLogs.length}`
    );
    assert.equal(clioPushMeta?.realNetworkCall, false, "Expected sandbox push to avoid real network.");
    assert.equal(clioWriteBackMeta?.realNetworkCall, false, "Expected sandbox write-back to avoid real network.");
    assert.equal(
      clioWriteBackMeta?.claimNumberStatus,
      "updated",
      `Expected sandbox claim number update, got ${String(clioWriteBackMeta?.claimNumberStatus ?? "missing")}`
    );
    assert.equal(clioWriteBackMeta?.claimNumberCandidate, "CLM-SMOKE-4242");
    assert.equal(clioWriteBackMeta?.policyNumberCandidate, "POL-SMOKE-7788");
    assert.equal(clioWriteBackMeta?.insuranceCarrierCandidate, "Safe Harbor Insurance");

    const caseResponse = await callJson(token, "GET", `/cases/${seeded.caseId}`);
    assert.equal(caseResponse.response.status, 200, `Expected case read 200, got ${caseResponse.response.status}`);

    const demandCreate = await callJson(token, "POST", `/cases/${seeded.caseId}/demand-packages`, {});
    assert.equal(demandCreate.response.status, 202, `Demand create failed: ${JSON.stringify(demandCreate.json)}`);
    assert.ok(typeof demandCreate.json.jobId === "string", "Expected demand create jobId.");
    assert.ok(Array.isArray(demandCreate.json.limitations?.warnings), "Expected limitations warnings array.");

    await waitForDemandJob(demandCreate.json.jobId);

    const demandPackage = await prisma.demandPackage.findFirstOrThrow({
      where: { id: demandCreate.json.item.id, firmId: seeded.firmId },
      select: {
        id: true,
        generatedDocId: true,
        generatedAt: true,
        summaryText: true,
        damagesText: true,
        treatmentText: true,
      },
    });

    assert.ok(demandPackage.generatedDocId, "Expected generated demand document id.");
    assert.ok(demandPackage.generatedAt, "Expected generatedAt on demand package.");
    assert.ok(demandPackage.summaryText?.trim(), "Expected non-empty demand summary text.");
    assert.ok(demandPackage.damagesText?.includes("Medical bills"), "Expected deterministic damages text to include medical bills.");

    const sectionSources = await prisma.demandPackageSectionSource.findMany({
      where: { demandPackageId: demandPackage.id, firmId: seeded.firmId },
      select: { sourceType: true, sourceMeta: true },
      orderBy: { createdAt: "asc" },
    });
    const generatedDoc = await prisma.document.findFirstOrThrow({
      where: { id: demandPackage.generatedDocId!, firmId: seeded.firmId },
      select: { id: true, spacesKey: true, status: true, routedCaseId: true },
    });

    await s3.send(new HeadObjectCommand({
      Bucket: "docs",
      Key: generatedDoc.spacesKey,
    }));

    const routingFeedbackRows = await prisma.routingFeedback.findMany({
      where: { firmId: seeded.firmId },
      orderBy: { createdAt: "asc" },
      select: {
        documentId: true,
        wasAccepted: true,
        finalCaseId: true,
        finalStatus: true,
      },
    });
    const deferredTelemetryRows = await pgPool.query<{
      firmId: string | null;
      caseId: string | null;
      documentId: string | null;
      jobType: string;
    }>(
      `
      select "firmId", "caseId", "documentId", "jobType"
      from "DeferredJobTelemetry"
      where "createdAt" >= $1
      order by "createdAt" asc
      `,
      [smokeStartedAt]
    );
    const unexpectedDeferredTelemetry = deferredTelemetryRows.rows.filter((row) =>
      row.firmId !== seeded.firmId
      || (row.caseId != null && row.caseId !== seeded.caseId)
      || (row.documentId != null && !allowedDeferredDocumentIds.has(row.documentId))
    );
    assert.equal(
      unexpectedDeferredTelemetry.length,
      0,
      `Expected only current smoke deferred jobs after queue cleanup, got ${JSON.stringify(unexpectedDeferredTelemetry)}`
    );

    const firm = await prisma.firm.findUniqueOrThrow({
      where: { id: seeded.firmId },
      select: { plan: true },
    });
    const clioGateSource = getPostRouteClioAutoUpdateGateSource({
      clioAutoUpdateEnabled: canUseClioAutoUpdate(firm.plan),
      legacyClioSyncEnabled: await hasFeature(seeded.firmId, "crm_sync"),
    });
    const finalQueueRedis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");
    const finalQueueState = await getLocalSmokeQueueState(finalQueueRedis);
    await finalQueueRedis.quit().catch(() => undefined);
    console.log("[smoke] local queue final state", finalQueueState);
    assert.equal(finalQueueState.queueDepth, 0, "Expected doc_jobs queue to drain completely by the end of smoke.");
    assert.equal(finalQueueState.stateKeyCount, 0, "Expected no doc_job_state markers after smoke.");
    assert.equal(finalQueueState.slotKeyCount, 0, "Expected no doc_job_firm_slot markers after smoke.");

    const summary: SmokeSummary = {
      localSmokeEnv: {
        firmCreated: true,
        adminUserCreated: true,
        caseCreated: true,
        encryptionKeySet: Boolean(localEncryptionKey),
        firmId: seeded.firmId,
        adminUserId: seeded.adminUserId,
        caseId: seeded.caseId,
      },
      mailbox: {
        realMailboxSmoke: false,
        blocker: "No real internal mailbox credentials are configured locally; the smoke used a local-only IMAP sandbox fixture through the real mailbox polling entrypoint.",
        sandboxHarness: {
          ok: true,
          method: "Local mailbox sandbox fixture through the real integration sync worker with explicit INTEGRATION_SYNC_MAILBOX_ID and INTEGRATION_SYNC_FIRM_ID scoping, then the normal document recognition/rematch routes.",
          mailboxId: mailboxSandbox.mailboxId,
          integrationId: mailboxSandbox.integrationId,
          fixtureId: mailboxSandbox.fixtureId,
          realNetworkCall: false,
          documentIds: [strongDoc.documentId, ambiguousDoc.documentId, clioDoc.documentId],
        },
      },
      clio: {
        realClioSmoke: false,
        blocker: "No real local Clio sandbox credentials are configured; the smoke used a local-only CASE_API sandbox stub with network disabled.",
        sandboxStub: {
          ok:
            Boolean(clioPushMeta) &&
            Boolean(clioWriteBackMeta) &&
            clioWriteBackMeta?.claimNumberStatus === "updated" &&
            clioPushMeta?.realNetworkCall === false &&
            clioWriteBackMeta?.realNetworkCall === false,
          gateSource: clioGateSource,
          integrationId: clioSandbox.integrationId,
          pushEventAction: clioSandboxAudit.pushEvent.action,
          writeBackEventAction: clioSandboxAudit.writeBackEvent.action,
          claimNumberStatus:
            typeof clioWriteBackMeta?.claimNumberStatus === "string"
              ? clioWriteBackMeta.claimNumberStatus
              : null,
          claimNumberCandidate:
            typeof clioWriteBackMeta?.claimNumberCandidate === "string"
              ? clioWriteBackMeta.claimNumberCandidate
              : null,
          policyNumberCandidate:
            typeof clioWriteBackMeta?.policyNumberCandidate === "string"
              ? clioWriteBackMeta.policyNumberCandidate
              : null,
          insuranceCarrierCandidate:
            typeof clioWriteBackMeta?.insuranceCarrierCandidate === "string"
              ? clioWriteBackMeta.insuranceCarrierCandidate
              : null,
          realNetworkCall:
            Boolean(clioPushMeta?.realNetworkCall) || Boolean(clioWriteBackMeta?.realNetworkCall),
          reason:
            "Local CASE_API sandbox stub captured document push and write-back payloads while CLIO_API_BASE_URL was intentionally set to an unreachable local address, proving the sandbox branch handled the sync without a real external network call.",
        },
      },
      productSmoke: {
        ingestion: "PASS",
        assignmentOrReviewFallback:
          strongRematch.json.caseId === seeded.caseId &&
          Array.isArray(ambiguousRematch.json.reviewReasons) &&
          ambiguousRematch.json.reviewReasons.length > 0
            ? "PASS"
            : "FAIL",
        demandCreation: demandCreate.response.status === 202 ? "PASS" : "FAIL",
        demandStorage:
          demandPackage.generatedDocId != null && sectionSources.length > 0 ? "PASS" : "FAIL",
        feedbackStorage:
          routingFeedbackRows.length >= 2 &&
          routingFeedbackRows.some((row) => row.documentId === strongDoc.documentId && row.wasAccepted) &&
          routingFeedbackRows.some((row) => row.documentId === ambiguousDoc.documentId && row.finalCaseId == null)
            ? "PASS"
            : "FAIL",
        clioBehavior:
          clioSandboxLogs.length === 2 &&
          clioWriteBackMeta?.claimNumberStatus === "updated" &&
          clioPushMeta?.realNetworkCall === false &&
          clioWriteBackMeta?.realNetworkCall === false
            ? "PASS"
            : "FAIL",
        details: {
          strongDocumentId: strongDoc.documentId,
          ambiguousDocumentId: ambiguousDoc.documentId,
          clioDocumentId: clioDoc.documentId,
          strongAssignedCaseId: strongRematch.json.caseId ?? null,
          ambiguousReviewReasons: Array.isArray(ambiguousRematch.json.reviewReasons)
            ? ambiguousRematch.json.reviewReasons.map((value: unknown) => String(value))
            : [],
          demandPackageId: demandPackage.id,
          generatedDocumentId: demandPackage.generatedDocId ?? null,
          limitations: Array.isArray(demandCreate.json.limitations?.warnings)
            ? demandCreate.json.limitations.warnings.map((value: unknown) => String(value))
            : [],
          routingFeedbackCount: routingFeedbackRows.length,
          demandSectionSourceTypes: [...new Set(sectionSources.map((row) => row.sourceType))],
        },
      },
    };

    console.log("[smoke] local queue cleanup proof", queueCleanup);
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await stopManagedProcess(integrationSyncProcess);
    await stopManagedProcess(jobWorkerProcess);
    await stopManagedProcess(apiProcess);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await Promise.race([
      Promise.allSettled([prisma.$disconnect(), pgPool.end()]),
      sleep(1_000),
    ]);
  });
