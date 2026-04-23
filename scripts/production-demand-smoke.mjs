import { appendFile, mkdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

import { printFail, printPass, repoRoot } from "./deploy-lib.mjs";
import { resolveProductionReleaseConfig } from "./production-release-config.mjs";

const config = resolveProductionReleaseConfig({ repoRoot });
const DEFAULT_PUBLIC_WEB_URL = "https://onyxintels.com";
const DEFAULT_PUBLIC_API_URL = "https://api.onyxintels.com";
const DEFAULT_LOCAL_WEB_URL = "http://127.0.0.1:3000";
const DEFAULT_LOCAL_API_URL = "http://127.0.0.1:4000";
const DEFAULT_LOG_PATH = path.join(config.smokeLogRoot, "demand-narrative-smoke.log");

const apiRequire = createRequire(path.join(repoRoot, "apps", "api", "package.json"));
const jwt = apiRequire("jsonwebtoken");
const { PrismaClient, Role } = apiRequire("@prisma/client");
const { PrismaPg } = apiRequire("@prisma/adapter-pg");

function printUsage() {
  console.log(
    "Usage: node scripts/production-demand-smoke.mjs [--public-web-url <url>] [--public-api-url <url>] [--local-web-url <url>] [--local-api-url <url>] [--log-path <path>]"
  );
}

function parseArgs(rawArgs) {
  const options = {
    publicWebUrl: process.env.DEMAND_SMOKE_PUBLIC_WEB_URL?.trim() || DEFAULT_PUBLIC_WEB_URL,
    publicApiUrl: process.env.DEMAND_SMOKE_PUBLIC_API_URL?.trim() || DEFAULT_PUBLIC_API_URL,
    localWebUrl: process.env.DEMAND_SMOKE_LOCAL_WEB_URL?.trim() || DEFAULT_LOCAL_WEB_URL,
    localApiUrl: process.env.DEMAND_SMOKE_LOCAL_API_URL?.trim() || DEFAULT_LOCAL_API_URL,
    logPath: process.env.DEMAND_SMOKE_LOG_PATH?.trim() || DEFAULT_LOG_PATH,
  };

  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];
    if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    }
    if (arg === "--public-web-url") {
      options.publicWebUrl = rawArgs[index + 1] ?? options.publicWebUrl;
      index += 1;
      continue;
    }
    if (arg === "--public-api-url") {
      options.publicApiUrl = rawArgs[index + 1] ?? options.publicApiUrl;
      index += 1;
      continue;
    }
    if (arg === "--local-web-url") {
      options.localWebUrl = rawArgs[index + 1] ?? options.localWebUrl;
      index += 1;
      continue;
    }
    if (arg === "--local-api-url") {
      options.localApiUrl = rawArgs[index + 1] ?? options.localApiUrl;
      index += 1;
      continue;
    }
    if (arg === "--log-path") {
      options.logPath = rawArgs[index + 1] ?? options.logPath;
      index += 1;
    }
  }

  return options;
}

async function loadEnvFile(filePath) {
  let raw = "";
  try {
    raw = await readFile(filePath, "utf8");
  } catch {
    return;
  }

  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (!match) continue;
    let [, key, value] = match;
    key = key.trim();
    value = value.trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function resolveJwtSecret() {
  return (
    process.env.JWT_SECRET?.trim() ||
    process.env.SESSION_SECRET?.trim() ||
    process.env.API_SECRET?.trim() ||
    null
  );
}

function buildToken(payload, jwtSecret) {
  return jwt.sign(payload, jwtSecret, {
    algorithm: "HS256",
    expiresIn: "15m",
  });
}

function joinUrl(base, pathname) {
  const url = new URL(base);
  url.pathname = pathname;
  url.search = "";
  url.hash = "";
  return url.toString();
}

function snippet(value, limit = 220) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > limit ? `${text.slice(0, limit)}...` : text;
}

async function fetchJson(url, init = {}) {
  const response = await fetch(url, init);
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return {
    ok: response.ok,
    status: response.status,
    body,
    text,
    headers: response.headers,
  };
}

async function fetchText(url, init = {}) {
  const response = await fetch(url, init);
  return {
    ok: response.ok,
    status: response.status,
    text: await response.text(),
    headers: response.headers,
  };
}

function assertCondition(condition, message, details) {
  if (!condition) {
    const suffix = details ? ` (${details})` : "";
    throw new Error(`${message}${suffix}`);
  }
}

function isoNowSlug() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function appendLog(logPath, payload) {
  await mkdir(path.dirname(logPath), { recursive: true });
  await appendFile(logPath, `${JSON.stringify(payload)}\n`, "utf8");
}

async function findDemandEnabledCandidate(prisma, jwtSecret, apiBase) {
  const candidates = await prisma.user.findMany({
    where: {
      role: { in: [Role.FIRM_ADMIN, Role.PARALEGAL, Role.STAFF] },
    },
    select: {
      id: true,
      email: true,
      role: true,
      firmId: true,
    },
    orderBy: [{ createdAt: "asc" }],
    take: 25,
  });

  for (const candidate of candidates) {
    if (!candidate.firmId) {
      continue;
    }
    const token = buildToken(
      {
        userId: candidate.id,
        firmId: candidate.firmId,
        role: candidate.role,
        email: candidate.email ?? "",
      },
      jwtSecret
    );
    const featureResponse = await fetchJson(joinUrl(apiBase, "/me/features"), {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (featureResponse.ok && featureResponse.body?.demand_narratives === true) {
      return { candidate, token };
    }
  }

  throw new Error("No firm user with demand_narratives enabled was available for production smoke.");
}

async function createSmokeFixtures(prisma, input) {
  const createdIds = {
    contactId: null,
    caseId: null,
    caseSummaryId: null,
    caseFinancialId: null,
    eventIds: [],
    demandDocumentIds: [],
    demandSectionIds: [],
    draftId: null,
    runId: null,
  };

  const smokeSuffix = isoNowSlug();
  const commonText = [
    "Florida rear-end collision demand.",
    "Client suffered cervical disc herniation and lumbar radiculopathy.",
    "MRI confirmed injuries.",
    "Pain management injection provided relief.",
    "Physical therapy continued for twelve weeks.",
    "Settlement demand reflects ongoing neck and back pain.",
  ].join(" ");

  const contact = await prisma.contact.create({
    data: {
      firmId: input.firmId,
      fullName: `Production Smoke ${smokeSuffix}`,
      firstName: "Production",
      lastName: `Smoke ${smokeSuffix.slice(-6)}`,
      email: `production-smoke-${smokeSuffix.slice(-12)}@onyxintel.invalid`,
    },
    select: { id: true, fullName: true },
  });
  createdIds.contactId = contact.id;

  const legalCase = await prisma.legalCase.create({
    data: {
      firmId: input.firmId,
      title: `Production Smoke Demand ${smokeSuffix}`,
      caseNumber: `SMOKE-${smokeSuffix.slice(-12)}`,
      clientName: contact.fullName,
      clientContactId: contact.id,
      status: "open",
      notes: commonText,
    },
    select: { id: true },
  });
  createdIds.caseId = legalCase.id;

  const caseSummary = await prisma.caseSummary.create({
    data: {
      firmId: input.firmId,
      caseId: legalCase.id,
      body: commonText,
    },
    select: { id: true },
  });
  createdIds.caseSummaryId = caseSummary.id;

  const caseFinancial = await prisma.caseFinancial.create({
    data: {
      firmId: input.firmId,
      caseId: legalCase.id,
      medicalBillsTotal: 18000,
      liensTotal: 0,
      settlementOffer: 0,
    },
    select: { id: true },
  });
  createdIds.caseFinancialId = caseFinancial.id;

  const events = await prisma.$transaction([
    prisma.caseTimelineEvent.create({
      data: {
        firmId: input.firmId,
        caseId: legalCase.id,
        eventDate: new Date("2026-01-15T00:00:00.000Z"),
        eventType: "collision",
        track: "legal",
        provider: "Scene report",
        diagnosis: "Rear-end collision",
        procedure: "Incident documented",
        amount: null,
        documentId: `smoke-doc-collision-${smokeSuffix}`,
      },
      select: { id: true },
    }),
    prisma.caseTimelineEvent.create({
      data: {
        firmId: input.firmId,
        caseId: legalCase.id,
        eventDate: new Date("2026-01-20T00:00:00.000Z"),
        eventType: "treatment",
        track: "medical",
        provider: "Onyx Rehab",
        diagnosis: "Cervical disc herniation and lumbar radiculopathy",
        procedure: "MRI, pain management injection, physical therapy",
        amount: "$18,000",
        documentId: `smoke-doc-treatment-${smokeSuffix}`,
      },
      select: { id: true },
    }),
  ]);
  createdIds.eventIds = events.map((event) => event.id);

  const visibleDemand = await prisma.demandBankDocument.create({
    data: {
      firmId: input.firmId,
      title: `Production Smoke Visible Example ${smokeSuffix}`,
      originalText: commonText,
      redactedText: commonText,
      summary: commonText,
      jurisdiction: "Florida",
      caseType: "auto_collision",
      liabilityType: "rear_end_collision",
      injuryTags: ["disc injury", "pain syndrome"],
      treatmentTags: ["physical therapy", "pain management", "imaging", "injection"],
      bodyPartTags: ["neck", "back"],
      mriPresent: true,
      injectionsPresent: true,
      surgeryPresent: false,
      totalBillsAmount: 18000,
      demandAmount: 65000,
      templateFamily: "pre_suit_demand",
      toneStyle: "assertive",
      qualityScore: 85,
      approvedForReuse: true,
      blockedForReuse: false,
      reviewStatus: "approved",
      reviewedBy: input.reviewerUserId,
      reviewedAt: new Date(),
      createdBy: input.staffUserId,
    },
    select: { id: true, title: true },
  });
  createdIds.demandDocumentIds.push(visibleDemand.id);

  const visibleSection = await prisma.demandBankSection.create({
    data: {
      demandBankDocumentId: visibleDemand.id,
      sectionType: "treatment_chronology",
      heading: "TREATMENT CHRONOLOGY",
      originalText: commonText,
      redactedText: commonText,
      qualityScore: 90,
      approvedForReuse: true,
    },
    select: { id: true },
  });
  createdIds.demandSectionIds.push(visibleSection.id);

  const hiddenDemand = await prisma.demandBankDocument.create({
    data: {
      firmId: input.firmId,
      title: `Production Smoke Hidden Example ${smokeSuffix}`,
      originalText: commonText,
      redactedText: commonText,
      summary: commonText,
      jurisdiction: "Florida",
      caseType: "auto_collision",
      liabilityType: "rear_end_collision",
      injuryTags: ["disc injury", "pain syndrome"],
      treatmentTags: ["physical therapy", "pain management", "imaging", "injection"],
      bodyPartTags: ["neck", "back"],
      mriPresent: true,
      injectionsPresent: true,
      surgeryPresent: false,
      totalBillsAmount: 19000,
      demandAmount: 70000,
      templateFamily: "pre_suit_demand",
      toneStyle: "assertive",
      qualityScore: 82,
      approvedForReuse: true,
      blockedForReuse: false,
      reviewStatus: "approved",
      reviewedBy: input.reviewerUserId,
      reviewedAt: new Date(),
      createdBy: input.staffUserId,
    },
    select: { id: true, title: true },
  });
  createdIds.demandDocumentIds.push(hiddenDemand.id);

  const hiddenSection = await prisma.demandBankSection.create({
    data: {
      demandBankDocumentId: hiddenDemand.id,
      sectionType: "liability",
      heading: "LIABILITY",
      originalText: commonText,
      redactedText: commonText,
      qualityScore: 88,
      approvedForReuse: true,
    },
    select: { id: true },
  });
  createdIds.demandSectionIds.push(hiddenSection.id);

  return {
    createdIds,
    caseId: legalCase.id,
    visibleDemand,
    visibleSection,
    hiddenDemand,
    hiddenSection,
  };
}

async function cleanupFixtures(prisma, createdIds) {
  if (!createdIds) return;
  if (createdIds.draftId) {
    await prisma.demandNarrativeDraft.deleteMany({ where: { id: createdIds.draftId } });
  }
  if (createdIds.runId) {
    await prisma.demandBankRun.deleteMany({ where: { id: createdIds.runId } });
  }
  if (createdIds.eventIds.length > 0) {
    await prisma.caseTimelineEvent.deleteMany({ where: { id: { in: createdIds.eventIds } } });
  }
  if (createdIds.caseFinancialId) {
    await prisma.caseFinancial.deleteMany({ where: { id: createdIds.caseFinancialId } });
  }
  if (createdIds.caseSummaryId) {
    await prisma.caseSummary.deleteMany({ where: { id: createdIds.caseSummaryId } });
  }
  if (createdIds.caseId) {
    await prisma.legalCase.deleteMany({ where: { id: createdIds.caseId } });
  }
  if (createdIds.contactId) {
    await prisma.contact.deleteMany({ where: { id: createdIds.contactId } });
  }
  if (createdIds.demandSectionIds.length > 0) {
    await prisma.demandBankSection.deleteMany({ where: { id: { in: createdIds.demandSectionIds } } });
  }
  if (createdIds.demandDocumentIds.length > 0) {
    await prisma.demandBankDocument.deleteMany({ where: { id: { in: createdIds.demandDocumentIds } } });
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  await loadEnvFile(path.join(repoRoot, "apps", "api", ".env"));
  await loadEnvFile(path.join(repoRoot, "apps", "api", ".env.local"));

  const jwtSecret = resolveJwtSecret();
  if (!jwtSecret) {
    throw new Error("JWT/SESSION/API secret is missing; cannot sign narrative smoke tokens.");
  }
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error("DATABASE_URL is missing; cannot run narrative smoke against production data.");
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const startedAt = new Date().toISOString();
  const result = {
    startedAt,
    publicPage: null,
    generation: null,
    retrievalPreview: null,
    feedback: null,
    approval: null,
    release: null,
    cleanup: "not_run",
  };
  let createdIds = null;

  try {
    const { candidate: staffCandidate, token: staffToken } = await findDemandEnabledCandidate(prisma, jwtSecret, options.localApiUrl);
    const reviewerCandidate =
      (await prisma.user.findFirst({
        where: { role: Role.PLATFORM_ADMIN },
        select: { id: true, email: true },
        orderBy: [{ createdAt: "asc" }],
      })) ?? {
        id: staffCandidate.id,
        email: staffCandidate.email ?? "",
      };

    const reviewerToken = buildToken(
      {
        userId: reviewerCandidate.id,
        firmId: staffCandidate.firmId,
        role: Role.PLATFORM_ADMIN,
        email: reviewerCandidate.email ?? "",
      },
      jwtSecret
    );

    const fixtures = await createSmokeFixtures(prisma, {
      firmId: staffCandidate.firmId,
      staffUserId: staffCandidate.id,
      reviewerUserId: reviewerCandidate.id,
    });
    createdIds = fixtures.createdIds;

    const publicPage = await fetchText(joinUrl(options.publicWebUrl, `/cases/${encodeURIComponent(fixtures.caseId)}/narrative`));
    assertCondition(publicPage.ok, "narrative page did not return HTTP 200", `status=${publicPage.status}`);
    assertCondition(
      /Demand Narrative Assistant|Loading feature access/i.test(publicPage.text),
      "narrative page did not render expected content",
      snippet(publicPage.text)
    );
    result.publicPage = { status: publicPage.status, snippet: snippet(publicPage.text) };

    const generateResponse = await fetchJson(joinUrl(options.localApiUrl, `/cases/${encodeURIComponent(fixtures.caseId)}/narrative`), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${staffToken}`,
      },
      body: JSON.stringify({
        type: "demand_rationale",
        tone: "assertive",
        notes: "production-deploy-smoke",
      }),
    });
    assertCondition(generateResponse.ok, "narrative generation failed", JSON.stringify(generateResponse.body));
    result.generation = { status: generateResponse.status };

    const draftList = await fetchJson(
      joinUrl(options.localApiUrl, `/cases/${encodeURIComponent(fixtures.caseId)}/demand-narratives`),
      { headers: { Authorization: `Bearer ${reviewerToken}` } }
    );
    assertCondition(draftList.ok, "failed to load generated drafts", JSON.stringify(draftList.body));
    const draft = Array.isArray(draftList.body?.items) ? draftList.body.items[0] : null;
    assertCondition(draft?.id, "generated draft was not returned in demand review list");
    createdIds.draftId = draft.id;
    assertCondition(typeof draft.text === "string" && draft.text.trim().length > 40, "generated draft text was empty");
    assertCondition(!draft.text.includes("[Error:"), "generated draft returned an error placeholder", draft.text);
    assertCondition(
      !Array.isArray(draft.warnings) || !draft.warnings.some((warning) => String(warning).includes("OPENAI_API_KEY")),
      "generated draft still reported OPENAI key warnings"
    );

    await prisma.demandBankDocument.update({
      where: { id: fixtures.hiddenDemand.id },
      data: {
        approvedForReuse: false,
        blockedForReuse: true,
        reviewStatus: "blocked",
      },
    });

    const retrievalPreview = await fetchJson(
      joinUrl(
        options.localApiUrl,
        `/cases/${encodeURIComponent(fixtures.caseId)}/demand-narratives/${encodeURIComponent(draft.id)}/retrieval-preview`
      ),
      { headers: { Authorization: `Bearer ${reviewerToken}` } }
    );
    assertCondition(retrievalPreview.ok, "retrieval preview failed", JSON.stringify(retrievalPreview.body));
    const preview = retrievalPreview.body?.preview;
    createdIds.runId = preview?.runId ?? null;
    assertCondition(preview?.available === true, "retrieval preview was unavailable", JSON.stringify(preview));
    assertCondition(
      Array.isArray(preview?.retrievedExamples) && preview.retrievedExamples.some((item) => item.id === fixtures.visibleDemand.id),
      "approved retrieval example did not appear in preview"
    );
    assertCondition(
      Array.isArray(preview?.retrievedSections) && preview.retrievedSections.some((item) => item.id === fixtures.visibleSection.id),
      "approved retrieval section did not appear in preview"
    );
    assertCondition(
      Number(preview?.hiddenCounts?.examples ?? 0) >= 1 && Number(preview?.hiddenCounts?.sections ?? 0) >= 1,
      "blocked retrieval example/section were not counted as hidden"
    );
    assertCondition(
      !preview.retrievedExamples.some((item) => item.id === fixtures.hiddenDemand.id),
      "blocked retrieval example remained visible"
    );
    result.retrievalPreview = {
      visibleExamples: preview.retrievedExamples.length,
      visibleSections: preview.retrievedSections.length,
      hiddenExamples: preview.hiddenCounts.examples,
      hiddenSections: preview.hiddenCounts.sections,
    };

    const feedbackDocument = await fetchJson(
      joinUrl(
        options.localApiUrl,
        `/cases/${encodeURIComponent(fixtures.caseId)}/demand-narratives/${encodeURIComponent(draft.id)}/retrieval-feedback`
      ),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${reviewerToken}`,
        },
        body: JSON.stringify({
          itemType: "document",
          itemId: fixtures.visibleDemand.id,
          usefulness: "useful",
        }),
      }
    );
    assertCondition(feedbackDocument.ok, "document retrieval feedback failed", JSON.stringify(feedbackDocument.body));

    const feedbackSection = await fetchJson(
      joinUrl(
        options.localApiUrl,
        `/cases/${encodeURIComponent(fixtures.caseId)}/demand-narratives/${encodeURIComponent(draft.id)}/retrieval-feedback`
      ),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${reviewerToken}`,
        },
        body: JSON.stringify({
          itemType: "section",
          itemId: fixtures.visibleSection.id,
          usefulness: "not_useful",
          removed: true,
        }),
      }
    );
    assertCondition(feedbackSection.ok, "section retrieval feedback failed", JSON.stringify(feedbackSection.body));

    const refreshedPreview = await fetchJson(
      joinUrl(
        options.localApiUrl,
        `/cases/${encodeURIComponent(fixtures.caseId)}/demand-narratives/${encodeURIComponent(draft.id)}/retrieval-preview`
      ),
      { headers: { Authorization: `Bearer ${reviewerToken}` } }
    );
    assertCondition(refreshedPreview.ok, "refreshed retrieval preview failed", JSON.stringify(refreshedPreview.body));
    const refreshed = refreshedPreview.body?.preview;
    const refreshedDocument = Array.isArray(refreshed?.retrievedExamples)
      ? refreshed.retrievedExamples.find((item) => item.id === fixtures.visibleDemand.id)
      : null;
    const refreshedSection = Array.isArray(refreshed?.retrievedSections)
      ? refreshed.retrievedSections.find((item) => item.id === fixtures.visibleSection.id)
      : null;
    assertCondition(refreshedDocument?.feedback?.usefulness === "useful", "document feedback did not persist");
    assertCondition(refreshedSection?.feedback?.usefulness === "not_useful", "section usefulness did not persist");
    assertCondition(refreshedSection?.feedback?.removed === true, "section removal flag did not persist");
    result.feedback = {
      documentUsefulness: refreshedDocument.feedback.usefulness,
      sectionUsefulness: refreshedSection.feedback.usefulness,
      sectionRemoved: refreshedSection.feedback.removed,
    };

    const approveResponse = await fetchJson(
      joinUrl(
        options.localApiUrl,
        `/cases/${encodeURIComponent(fixtures.caseId)}/demand-narratives/${encodeURIComponent(draft.id)}/approve`
      ),
      {
        method: "POST",
        headers: { Authorization: `Bearer ${reviewerToken}` },
      }
    );
    assertCondition(approveResponse.ok, "approve failed", JSON.stringify(approveResponse.body));
    result.approval = { status: approveResponse.status };

    const releaseResponse = await fetchJson(
      joinUrl(
        options.localApiUrl,
        `/cases/${encodeURIComponent(fixtures.caseId)}/demand-narratives/${encodeURIComponent(draft.id)}/release`
      ),
      {
        method: "POST",
        headers: { Authorization: `Bearer ${reviewerToken}` },
      }
    );
    assertCondition(releaseResponse.ok, "release failed", JSON.stringify(releaseResponse.body));
    result.release = { status: releaseResponse.status };

    printPass(
      `production demand smoke passed (caseId=${fixtures.caseId}, draftId=${draft.id}, runId=${createdIds.runId ?? "none"})`
    );
  } finally {
    try {
      await cleanupFixtures(prisma, createdIds);
      result.cleanup = "ok";
    } catch (cleanupError) {
      result.cleanup = `failed: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`;
    }
    await prisma.$disconnect();
    await appendLog(options.logPath, {
      status: result.release?.status === 200 ? "PASS" : "FAIL",
      ...result,
    }).catch(() => {});
  }
}

main().catch(async (error) => {
  await appendLog(DEFAULT_LOG_PATH, {
    status: "FAIL",
    error: error instanceof Error ? error.message : String(error),
  }).catch(() => {});
  printFail(
    error instanceof Error ? error.message : String(error),
    "Fix the narrative smoke failure before treating the production deploy as healthy."
  );
  process.exit(1);
});
