import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import net from "node:net";
import { fileURLToPath, pathToFileURL } from "node:url";

import { collectPm2State, discoverTesseract, reloadPm2App, restartPm2App } from "./production-guard-actions.mjs";
import { fetchVersionInfo, resolveGitState } from "./deploy-lib.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.dirname(scriptDir);
const reportsDir = path.join(repoRoot, "reports", "production-guard");
const allowedPm2Apps = ["doc-platform-api", "doc-platform-web", "doc-platform-worker"];
const apiEnvFiles = [path.join(repoRoot, "apps", "api", ".env"), path.join(repoRoot, "apps", "api", ".env.local")];

const rawArgs = new Set(process.argv.slice(2));
const flags = {
  dryRun: rawArgs.has("--dry-run"),
  noFix: rawArgs.has("--no-fix"),
  verbose: rawArgs.has("--verbose"),
};

function nowIso() {
  return new Date().toISOString();
}

function slugIso(value) {
  return value.replace(/[:]/g, "-").replace(/\.\d{3}Z$/, "Z");
}

function trim(value, max = 1200) {
  if (typeof value !== "string") return value;
  const cleaned = value.trim();
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, max)}...`;
}

function plainError(error) {
  if (!error) return null;
  return {
    name: error.name ?? "Error",
    message: error.message ?? String(error),
  };
}

function printVerbose(message, data) {
  if (!flags.verbose) return;
  if (data === undefined) {
    console.log(`[guard] ${message}`);
    return;
  }
  console.log(`[guard] ${message}`, data);
}

function buildCommandString(command, args) {
  return [command, ...args]
    .map((part) => (typeof part === "string" && /\s/.test(part) ? `"${part}"` : String(part)))
    .join(" ");
}

function runNodeScript(scriptName, args = []) {
  const command = process.execPath;
  const scriptPath = path.join(repoRoot, "scripts", scriptName);
  const result = spawnSync(command, [scriptPath, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    windowsHide: true,
    env: process.env,
  });

  return {
    command: buildCommandString(command, [scriptPath, ...args]),
    success: result.status === 0 && !result.error,
    evidence: {
      exitCode: result.status,
      signal: result.signal ?? null,
      stdout: trim(result.stdout),
      stderr: trim(result.stderr),
      error: plainError(result.error),
      timedOut: result.error?.code === "ETIMEDOUT",
    },
  };
}

function parseEnvLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;

  const match = trimmed.match(/^([\w.-]+)\s*=\s*(.*)$/);
  if (!match) return null;

  let [, key, value] = match;
  value = value.trim();

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }

  return [key, value];
}

async function loadApiRuntimeEnv() {
  const filesLoaded = [];
  const fileValues = {};

  for (const filePath of apiEnvFiles) {
    try {
      const raw = await readFile(filePath, "utf8");
      filesLoaded.push(filePath);
      for (const line of raw.split(/\r?\n/)) {
        const parsed = parseEnvLine(line);
        if (!parsed) continue;
        const [key, value] = parsed;
        fileValues[key] = value;
      }
    } catch (error) {
      if (error?.code !== "ENOENT") {
        throw error;
      }
    }
  }

  return {
    env: {
      ...fileValues,
      ...process.env,
    },
    filesLoaded,
  };
}

function getStorageConfig(apiRuntimeEnv) {
  const env = apiRuntimeEnv.env;
  return {
    endpoint: env.S3_ENDPOINT?.trim() ?? "",
    accessKeyId: env.S3_ACCESS_KEY?.trim() ?? "",
    secretAccessKey: env.S3_SECRET_KEY?.trim() ?? "",
    bucket: env.S3_BUCKET?.trim() ?? "",
    region: env.S3_REGION?.trim() || "us-east-1",
    filesLoaded: apiRuntimeEnv.filesLoaded,
  };
}

function isLoopbackHost(hostname) {
  if (!hostname) return false;
  const normalized = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
}

function parseStorageEndpoint(storageConfig) {
  if (!storageConfig.endpoint) {
    return {
      valid: false,
      error: "S3_ENDPOINT is missing.",
      endpoint: storageConfig.endpoint,
    };
  }

  try {
    const parsed = new URL(storageConfig.endpoint);
    const port = parsed.port
      ? Number(parsed.port)
      : parsed.protocol === "https:"
        ? 443
        : parsed.protocol === "http:"
          ? 80
          : null;

    return {
      valid: Boolean(parsed.hostname && port),
      endpoint: storageConfig.endpoint,
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      port,
      isLoopback: isLoopbackHost(parsed.hostname),
      error: parsed.hostname && port ? null : "S3_ENDPOINT did not include a usable host/port.",
    };
  } catch (error) {
    return {
      valid: false,
      endpoint: storageConfig.endpoint,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function createApiRequire() {
  return createRequire(path.join(repoRoot, "apps", "api", "package.json"));
}

function buildStorageClient(storageConfig) {
  const apiRequire = createApiRequire();
  const { S3Client, HeadBucketCommand, PutObjectCommand, DeleteObjectCommand, HeadObjectCommand } = apiRequire("@aws-sdk/client-s3");
  const client = new S3Client({
    region: storageConfig.region,
    endpoint: storageConfig.endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: storageConfig.accessKeyId,
      secretAccessKey: storageConfig.secretAccessKey,
    },
  });

  return {
    client,
    HeadBucketCommand,
    PutObjectCommand,
    DeleteObjectCommand,
    HeadObjectCommand,
  };
}

function buildPgClient(apiRuntimeEnv) {
  const apiRequire = createApiRequire();
  const { Client } = apiRequire("pg");
  return new Client({
    connectionString: apiRuntimeEnv.env.DATABASE_URL,
  });
}

async function collectRecognitionCacheHealth(apiRuntimeEnv) {
  if (!apiRuntimeEnv.env.DATABASE_URL) {
    return {
      status: "fail",
      evidence: {
        databaseUrlPresent: false,
      },
      manualActionRequired: true,
      manualAction: "DATABASE_URL is missing; cache health cannot be inspected.",
    };
  }

  const client = buildPgClient(apiRuntimeEnv);

  try {
    await client.connect();
    const tableCheck = await client.query(`select to_regclass('public.document_recognition') as table_name`);
    if (!tableCheck.rows[0]?.table_name) {
      return {
        status: "fail",
        evidence: {
          tablePresent: false,
        },
        manualActionRequired: true,
        manualAction: "document_recognition table is missing, so cache health cannot be inspected.",
      };
    }

    const aggregate = await client.query(`
      with cache_rows as (
        select
          extracted_json->'taskCache' as task_cache,
          case
            when jsonb_typeof(extracted_json->'taskCache') = 'object'
            then (
              select count(*)::int
              from jsonb_object_keys(extracted_json->'taskCache')
            )
            else 0
          end as task_count
        from document_recognition
      )
      select
        count(*)::int as total_rows,
        count(*) filter (
          where jsonb_typeof(task_cache) = 'object'
        )::int as rows_with_task_cache,
        count(*) filter (
          where task_count > 0
        )::int as rows_with_nonempty_task_cache,
        coalesce(max(task_count), 0)::int as max_task_entries,
        coalesce(avg(task_count), 0)::float as avg_task_entries
      from cache_rows
    `);
    const recent = await client.query(`
      select
        document_id,
        (
          select count(*)::int
          from jsonb_object_keys(extracted_json->'taskCache')
        ) as task_count,
        updated_at
      from document_recognition
      where jsonb_typeof(extracted_json->'taskCache') = 'object'
      order by updated_at desc
      limit 5
    `);

    const totals = aggregate.rows[0] ?? {
      total_rows: 0,
      rows_with_task_cache: 0,
      rows_with_nonempty_task_cache: 0,
      max_task_entries: 0,
      avg_task_entries: 0,
    };
    const totalRows = Number(totals.total_rows ?? 0);
    const rowsWithTaskCache = Number(totals.rows_with_task_cache ?? 0);
    const rowsWithNonemptyTaskCache = Number(totals.rows_with_nonempty_task_cache ?? 0);
    const maxTaskEntries = Number(totals.max_task_entries ?? 0);
    const avgTaskEntries = Number(totals.avg_task_entries ?? 0);
    const cacheBeingUsed = rowsWithNonemptyTaskCache > 0;
    const status = totalRows === 0 ? "skip" : maxTaskEntries > 64 ? "fail" : "pass";

    return {
      status,
      evidence: {
        tablePresent: true,
        totalRows,
        rowsWithTaskCache,
        rowsWithNonemptyTaskCache,
        cacheBeingUsed,
        cacheUtilizationRatio: totalRows > 0 ? Number((rowsWithNonemptyTaskCache / totalRows).toFixed(4)) : 0,
        maxTaskEntries,
        avgTaskEntries: Number(avgTaskEntries.toFixed(2)),
        recentRows: recent.rows,
      },
      manualActionRequired: status === "fail",
      manualAction:
        status === "fail"
          ? "document_recognition.taskCache is growing beyond the bounded size threshold and should be reviewed."
          : null,
    };
  } catch (error) {
    return {
      status: "fail",
      evidence: {
        error: plainError(error),
      },
      manualActionRequired: true,
      manualAction: "Failed to inspect document recognition cache health from the production database.",
    };
  } finally {
    await client.end().catch(() => {});
  }
}

function normalizeStorageCheck({ name, status, evidence, manualAction = null, manualActionRequired = false, severity = "normal" }) {
  return {
    name,
    status,
    evidence,
    remediationAttempted: false,
    remediationAction: null,
    remediationResult: null,
    after: null,
    manualActionRequired,
    manualAction,
    severity,
  };
}

async function probeStorageListener(endpointInfo) {
  if (!endpointInfo.valid) {
    return {
      status: "fail",
      evidence: endpointInfo,
      manualActionRequired: true,
      manualAction: "Fix S3_ENDPOINT before running storage-dependent production paths.",
    };
  }

  return new Promise((resolve) => {
    const startedAt = Date.now();
    const socket = net.createConnection({
      host: endpointInfo.hostname,
      port: endpointInfo.port,
    });

    const finalize = (payload) => {
      socket.removeAllListeners();
      if (!socket.destroyed) {
        socket.destroy();
      }
      resolve(payload);
    };

    socket.setTimeout(3_000);

    socket.once("connect", () => {
      finalize({
        status: "pass",
        evidence: {
          endpoint: endpointInfo.endpoint,
          hostname: endpointInfo.hostname,
          port: endpointInfo.port,
          connected: true,
          durationMs: Date.now() - startedAt,
        },
        manualActionRequired: false,
        manualAction: null,
      });
    });

    socket.once("timeout", () => {
      finalize({
        status: "fail",
        evidence: {
          endpoint: endpointInfo.endpoint,
          hostname: endpointInfo.hostname,
          port: endpointInfo.port,
          connected: false,
          timeoutMs: 3_000,
        },
        manualActionRequired: true,
        manualAction: "Storage endpoint listener timed out from the production host.",
      });
    });

    socket.once("error", (error) => {
      finalize({
        status: "fail",
        evidence: {
          endpoint: endpointInfo.endpoint,
          hostname: endpointInfo.hostname,
          port: endpointInfo.port,
          connected: false,
          error: plainError(error),
        },
        manualActionRequired: true,
        manualAction: "Storage endpoint could not be reached from the production host.",
      });
    });
  });
}

function probeLocalStorageService(endpointInfo) {
  if (!endpointInfo.valid || !endpointInfo.isLoopback) {
    return {
      status: "skip",
      evidence: {
        endpoint: endpointInfo.endpoint,
        reason: "Configured storage endpoint is not local to the production host.",
      },
      manualActionRequired: false,
      manualAction: null,
    };
  }

  if (process.platform !== "linux") {
    return {
      status: "skip",
      evidence: {
        endpoint: endpointInfo.endpoint,
        reason: "systemctl service status is only checked on Linux hosts.",
      },
      manualActionRequired: false,
      manualAction: null,
    };
  }

  const result = spawnSync("systemctl", ["is-active", "minio"], {
    cwd: repoRoot,
    env: process.env,
    encoding: "utf8",
    timeout: 10_000,
    windowsHide: true,
  });

  const stdout = trim(result.stdout);
  const stderr = trim(result.stderr);
  const active = result.status === 0 && stdout === "active";

  return {
    status: active ? "pass" : "fail",
    evidence: {
      endpoint: endpointInfo.endpoint,
      service: "minio",
      exitCode: result.status,
      stdout,
      stderr,
      error: plainError(result.error),
    },
    manualActionRequired: !active,
    manualAction: active ? null : "Local MinIO service is not active on the production host.",
  };
}

async function probeStorageBucket(storageConfig) {
  const requiredValues = [storageConfig.endpoint, storageConfig.accessKeyId, storageConfig.secretAccessKey, storageConfig.bucket];
  if (requiredValues.some((value) => !value)) {
    return {
      status: "fail",
      evidence: {
        endpoint: storageConfig.endpoint || null,
        bucket: storageConfig.bucket || null,
        region: storageConfig.region,
        accessKeyPresent: Boolean(storageConfig.accessKeyId),
        secretAccessKeyPresent: Boolean(storageConfig.secretAccessKey),
      },
      manualActionRequired: true,
      manualAction: "Storage environment is incomplete; bucket reachability cannot be verified.",
    };
  }

  try {
    const { client, HeadBucketCommand } = buildStorageClient(storageConfig);
    await client.send(new HeadBucketCommand({ Bucket: storageConfig.bucket }));
    return {
      status: "pass",
      evidence: {
        endpoint: storageConfig.endpoint,
        bucket: storageConfig.bucket,
        region: storageConfig.region,
        readOnly: true,
      },
      manualActionRequired: false,
      manualAction: null,
    };
  } catch (error) {
    return {
      status: "fail",
      evidence: {
        endpoint: storageConfig.endpoint,
        bucket: storageConfig.bucket,
        region: storageConfig.region,
        error: plainError(error),
        readOnly: true,
      },
      manualActionRequired: true,
      manualAction: `Bucket ${storageConfig.bucket || "unknown"} is not reachable from the production host.`,
    };
  }
}

async function probeStorageWriteRoundTrip(storageConfig) {
  const requiredValues = [storageConfig.endpoint, storageConfig.accessKeyId, storageConfig.secretAccessKey, storageConfig.bucket];
  if (requiredValues.some((value) => !value)) {
    return {
      status: "fail",
      evidence: {
        endpoint: storageConfig.endpoint || null,
        bucket: storageConfig.bucket || null,
        region: storageConfig.region,
        accessKeyPresent: Boolean(storageConfig.accessKeyId),
        secretAccessKeyPresent: Boolean(storageConfig.secretAccessKey),
        phase: "config",
      },
      manualActionRequired: true,
      manualAction: "Storage environment is incomplete; write probe cannot run.",
      severity: "critical",
    };
  }

  const key = `guard/probe/${Date.now()}-${process.pid}.txt`;
  const startedAt = Date.now();

  try {
    const { client, PutObjectCommand, HeadObjectCommand, DeleteObjectCommand } = buildStorageClient(storageConfig);
    await client.send(
      new PutObjectCommand({
        Bucket: storageConfig.bucket,
        Key: key,
        Body: Buffer.from("onyx-production-guard-probe", "utf8"),
        ContentType: "text/plain",
      })
    );

    await client.send(
      new HeadObjectCommand({
        Bucket: storageConfig.bucket,
        Key: key,
      })
    );

    await client.send(
      new DeleteObjectCommand({
        Bucket: storageConfig.bucket,
        Key: key,
      })
    );

    return {
      status: "pass",
      evidence: {
        endpoint: storageConfig.endpoint,
        bucket: storageConfig.bucket,
        region: storageConfig.region,
        key,
        durationMs: Date.now() - startedAt,
        readOnly: false,
      },
      manualActionRequired: false,
      manualAction: null,
      severity: "critical",
    };
  } catch (error) {
    return {
      status: "fail",
      evidence: {
        endpoint: storageConfig.endpoint,
        bucket: storageConfig.bucket,
        region: storageConfig.region,
        key,
        durationMs: Date.now() - startedAt,
        error: plainError(error),
        readOnly: false,
      },
      manualActionRequired: true,
      manualAction: "Storage write probe failed. Treat this as a critical production issue and investigate object storage immediately.",
      severity: "critical",
    };
  }
}

async function collectStorageChecks(apiRuntimeEnv) {
  const storageConfig = getStorageConfig(apiRuntimeEnv);
  const endpointInfo = parseStorageEndpoint(storageConfig);

  const config = {
    status:
      storageConfig.endpoint && storageConfig.accessKeyId && storageConfig.secretAccessKey && storageConfig.bucket
        ? "pass"
        : "fail",
    evidence: {
      filesLoaded: storageConfig.filesLoaded,
      endpoint: storageConfig.endpoint || null,
      bucket: storageConfig.bucket || null,
      region: storageConfig.region,
      accessKeyPresent: Boolean(storageConfig.accessKeyId),
      secretAccessKeyPresent: Boolean(storageConfig.secretAccessKey),
    },
    manualActionRequired: !(
      storageConfig.endpoint &&
      storageConfig.accessKeyId &&
      storageConfig.secretAccessKey &&
      storageConfig.bucket
    ),
    manualAction: null,
  };
  if (config.manualActionRequired) {
    config.manualAction = "Storage configuration is incomplete in the API runtime env files.";
  }

  const service = probeLocalStorageService(endpointInfo);
  const listener = await probeStorageListener(endpointInfo);
  const bucket = await probeStorageBucket(storageConfig);
  const writeProbe = await probeStorageWriteRoundTrip(storageConfig);

  return {
    config,
    endpointInfo,
    readOnlyChecks: {
      service,
      listener,
      bucket,
    },
    writeProbe,
  };
}

async function fetchText(url, init = {}) {
  const response = await fetch(url, {
    redirect: "manual",
    ...init,
    headers: {
      Accept: "application/json, text/plain, */*",
      ...(init.headers ?? {}),
    },
  });
  const contentType = response.headers.get("content-type") ?? "";
  const text = await response.text();
  let json = null;
  if (contentType.includes("application/json")) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }
  return {
    url,
    status: response.status,
    ok: response.ok,
    redirected: response.redirected,
    contentType,
    text: trim(text, 3000),
    json,
  };
}

function normalizeCheckResult({
  name,
  status,
  evidence,
  remediationAttempted = false,
  remediationAction = null,
  remediationResult = null,
  after = null,
  manualActionRequired = false,
  manualAction = null,
}) {
  return {
    name,
    status,
    evidence,
    remediationAttempted,
    remediationAction,
    remediationResult,
    after,
    manualActionRequired,
    manualAction,
  };
}

function summarizeHealthStatus(status, evidence) {
  const okStatuses = new Set([200]);
  return okStatuses.has(status)
    ? { status: "pass", evidence }
    : { status: "fail", evidence, manualActionRequired: true };
}

function summarizeReachableRoute(status, evidence) {
  const passStatuses = new Set([200, 301, 302, 303, 307, 308, 401, 403]);
  return passStatuses.has(status)
    ? { status: "pass", evidence }
    : { status: "fail", evidence, manualActionRequired: true };
}

async function probeVersion(url) {
  try {
    const info = await fetchVersionInfo(url);
    return {
      status: "pass",
      evidence: info,
    };
  } catch (error) {
    return {
      status: "fail",
      evidence: {
        url,
        error: plainError(error),
      },
      manualActionRequired: true,
    };
  }
}

async function probeApiHealth() {
  try {
    const response = await fetchText("http://127.0.0.1:4000/health");
    return summarizeHealthStatus(response.status, response);
  } catch (error) {
    return {
      status: "fail",
      evidence: { error: plainError(error) },
      manualActionRequired: true,
      manualAction: "Investigate the API health endpoint.",
    };
  }
}

async function probeWebHealth() {
  try {
    const response = await fetchText("http://127.0.0.1:3000/healthz");
    return summarizeHealthStatus(response.status, response);
  } catch (error) {
    return {
      status: "fail",
      evidence: { error: plainError(error) },
      manualActionRequired: true,
      manualAction: "Investigate the web health endpoint.",
    };
  }
}

async function probeDemoLogin() {
  try {
    const response = await fetchText("http://127.0.0.1:4000/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "demo@example.com", password: "demo" }),
    });

    const blocked = response.status === 401 || response.status === 403;
    return {
      status: blocked ? "pass" : "fail",
      evidence: response,
      manualActionRequired: !blocked,
      manualAction: blocked ? null : "Demo login still succeeds in production and must remain blocked.",
    };
  } catch (error) {
    return {
      status: "fail",
      evidence: { error: plainError(error) },
      manualActionRequired: true,
      manualAction: "Investigate the production auth route before assuming demo login is blocked.",
    };
  }
}

async function probeDemoSeedEndpoint() {
  const urls = [
    "http://127.0.0.1:4000/admin/demo/seed",
    "http://127.0.0.1:3000/api/admin/demo/seed",
  ];

  const attempts = [];
  for (const url of urls) {
    try {
      const response = await fetchText(url, { method: "POST" });
      attempts.push(response);
      if (response.status === 403 || response.status === 404) {
        return {
          status: "pass",
          evidence: { attempts },
          manualActionRequired: false,
          manualAction: null,
        };
      }
    } catch (error) {
      attempts.push({ url, error: plainError(error) });
    }
  }

  return {
    status: "fail",
    evidence: { attempts },
    manualActionRequired: true,
    manualAction: "Demo seed endpoint still appears reachable in production and must be disabled.",
  };
}

async function probeDashboardRoute() {
  try {
    const response = await fetchText("http://127.0.0.1:3000/dashboard");
    return summarizeReachableRoute(response.status, response);
  } catch (error) {
    return {
      status: "fail",
      evidence: { error: plainError(error) },
      manualActionRequired: true,
      manualAction: "Investigate the live dashboard route.",
    };
  }
}

async function probeReviewQueue(authToken) {
  if (!authToken) {
    return {
      status: "skip",
      evidence: { reason: "No PRODUCTION_GUARD_AUTH_TOKEN provided." },
      remediationAttempted: false,
      remediationAction: null,
      remediationResult: null,
      after: null,
      manualActionRequired: false,
      manualAction: null,
    };
  }

  try {
    const response = await fetchText("http://127.0.0.1:4000/me/review-queue?limit=1", {
      headers: { authorization: `Bearer ${authToken}` },
    });
    if (!response.ok) {
      return {
        status: "fail",
        evidence: response,
        manualActionRequired: true,
        manualAction: "Authenticated review queue did not return a successful response.",
      };
    }

    const items = Array.isArray(response.json?.items) ? response.json.items : [];
    return {
      status: "pass",
      evidence: {
        response,
        itemCount: items.length,
        firstItemId: items[0]?.id ?? null,
      },
      manualActionRequired: false,
      manualAction: null,
    };
  } catch (error) {
    return {
      status: "fail",
      evidence: { error: plainError(error) },
      manualActionRequired: true,
      manualAction: "Investigate the authenticated review queue route.",
    };
  }
}

async function probeRecognition(authToken, reviewQueueResult) {
  const itemId = reviewQueueResult?.evidence?.firstItemId ?? null;
  if (!authToken || !itemId) {
    return {
      status: "skip",
      evidence: {
        reason: !authToken
          ? "No PRODUCTION_GUARD_AUTH_TOKEN provided."
          : "No review queue item available for recognition probing.",
      },
      remediationAttempted: false,
      remediationAction: null,
      remediationResult: null,
      after: null,
      manualActionRequired: false,
      manualAction: null,
    };
  }

  try {
    const response = await fetchText(`http://127.0.0.1:4000/documents/${encodeURIComponent(itemId)}/recognition`, {
      headers: { authorization: `Bearer ${authToken}` },
    });
    if (!response.ok) {
      return {
        status: "fail",
        evidence: response,
        manualActionRequired: true,
        manualAction: "Recognition route did not return a successful response.",
      };
    }

    return {
      status: "pass",
      evidence: {
        response,
        targetDocumentId: itemId,
      },
      manualActionRequired: false,
      manualAction: null,
    };
  } catch (error) {
    return {
      status: "fail",
      evidence: { error: plainError(error), targetDocumentId: itemId },
      manualActionRequired: true,
      manualAction: "Investigate the document recognition route.",
    };
  }
}

function evaluateVersionParity(localGit, apiVersion, webVersion) {
  const failures = [];
  const evidence = {
    localGit,
    apiVersion,
    webVersion,
  };

  if (!apiVersion || !webVersion) {
    return {
      status: "fail",
      evidence,
      manualActionRequired: true,
      manualAction: "One or both version endpoints were unavailable.",
    };
  }

  if (apiVersion.commitHash !== webVersion.commitHash) {
    failures.push(`API and web commitHash differ (${apiVersion.commitHash} vs ${webVersion.commitHash})`);
  }
  if (apiVersion.shortCommitHash !== webVersion.shortCommitHash) {
    failures.push(`API and web shortCommitHash differ (${apiVersion.shortCommitHash} vs ${webVersion.shortCommitHash})`);
  }
  if (apiVersion.versionLabel !== webVersion.versionLabel) {
    failures.push(`API and web versionLabel differ (${apiVersion.versionLabel} vs ${webVersion.versionLabel})`);
  }
  if (apiVersion.commitHash !== localGit.sha) {
    failures.push(`API commit ${apiVersion.commitHash} does not match local HEAD ${localGit.sha}`);
  }
  if (webVersion.commitHash !== localGit.sha) {
    failures.push(`web commit ${webVersion.commitHash} does not match local HEAD ${localGit.sha}`);
  }
  if (apiVersion.shortCommitHash !== localGit.shortSha) {
    failures.push(`API shortCommitHash ${apiVersion.shortCommitHash} does not match local short SHA ${localGit.shortSha}`);
  }
  if (webVersion.shortCommitHash !== localGit.shortSha) {
    failures.push(`web shortCommitHash ${webVersion.shortCommitHash} does not match local short SHA ${localGit.shortSha}`);
  }

  const status = failures.length === 0 ? "pass" : "fail";
  return {
    status,
    evidence: {
      ...evidence,
      failures,
    },
    manualActionRequired: failures.length > 0,
    manualAction: failures.length > 0 ? "Redeploy or roll back until local, API, and web all report the same clean version." : null,
  };
}

function evaluateDirtyFlag(apiVersion, webVersion) {
  const evidence = { apiVersion, webVersion };
  if (!apiVersion || !webVersion) {
    return {
      status: "fail",
      evidence,
      manualActionRequired: true,
      manualAction: "Version endpoints were unavailable, so dirty flags could not be trusted.",
    };
  }

  const dirtyValues = [apiVersion.buildDirty, webVersion.buildDirty];
  const hasDirty = dirtyValues.some((value) => value === true);
  return {
    status: hasDirty ? "fail" : "pass",
    evidence: {
      ...evidence,
      dirtyValues,
    },
    manualActionRequired: hasDirty,
    manualAction: hasDirty ? "Live build metadata still reports dirty=true." : null,
  };
}

async function runDeployCheckScript(scriptName, args = []) {
  const result = runNodeScript(scriptName, args);
  return {
    name: scriptName,
    status: result.success ? "pass" : "fail",
    evidence: {
      command: result.command,
      ...result.evidence,
    },
    manualActionRequired: !result.success,
    manualAction: result.success ? null : `Fix the failing ${scriptName} check and rerun the guard.`,
  };
}

async function probeTesseract() {
  const result = await discoverTesseract({ env: process.env });
  return {
    status: result.success ? "pass" : "fail",
    evidence: result,
    manualActionRequired: !result.success,
    manualAction: result.success ? null : "Tesseract is not discoverable in production.",
  };
}

function choosePm2Action(appName, healthFailed, appState) {
  if (!appState || appState.status !== "online") {
    return "restart";
  }
  if (healthFailed) {
    return "reload";
  }
  return null;
}

function pm2AppsHealthy(pm2Summary) {
  return allowedPm2Apps.every((appName) => pm2Summary.apps?.[appName]?.status === "online");
}

function hasApiReloadableFailure(baseline) {
  return (
    baseline.apiHealth.status === "fail" ||
    baseline.apiVersion.status === "fail" ||
    baseline.versionParity.status === "fail" ||
    baseline.dirtyFlag.status === "fail" ||
    baseline.deployVerify.status === "fail" ||
    baseline.deployStatus.status === "fail"
  );
}

function hasWebReloadableFailure(baseline) {
  return (
    baseline.webHealth.status === "fail" ||
    baseline.webVersion.status === "fail" ||
    baseline.dashboard.status === "fail" ||
    baseline.versionParity.status === "fail" ||
    baseline.dirtyFlag.status === "fail" ||
    baseline.deployVerify.status === "fail" ||
    baseline.deployStatus.status === "fail"
  );
}

async function remediatePm2App(appName, action, stateBefore) {
  if (!action) {
    return {
      attempted: false,
      action: null,
      result: null,
      stateBefore,
      stateAfter: null,
    };
  }

  if (flags.dryRun || flags.noFix) {
    return {
      attempted: false,
      action,
      result: {
        success: false,
        skipped: true,
        reason: flags.dryRun ? "dry-run mode" : "--no-fix mode",
      },
      stateBefore,
      stateAfter: stateBefore,
    };
  }

  const options = { updateEnv: true };
  const result =
    action === "restart"
      ? await restartPm2App(appName, options)
      : await reloadPm2App(appName, options);

  return {
    attempted: true,
    action,
    result,
    stateBefore,
    stateAfter: result.state ?? null,
  };
}

async function main() {
  const timestamp = nowIso();
  const gitState = resolveGitState();
  const reportStem = slugIso(timestamp);
  const reportBase = path.join(reportsDir, `${reportStem}-${gitState.shortSha || "unknown"}`);
  await mkdir(reportsDir, { recursive: true });

  const report = {
    timestamp,
    environment: {
      nodeEnv: process.env.NODE_ENV ?? null,
      platform: process.platform,
      arch: process.arch,
      hostname: os.hostname(),
      cwd: process.cwd(),
      repoRoot,
      pid: process.pid,
      flags,
    },
    commit: gitState,
    checks: [],
    storage: null,
    cache: null,
    remediation: {
      attempted: false,
      actions: [],
      results: [],
    },
    alertingRecommendations: [
      {
        name: "storage-endpoint-down",
        trigger: "Configured storage endpoint listener probe fails or the local MinIO service is not active.",
        severity: "critical",
        action: "Page the operator immediately and restore storage reachability before more uploads are attempted.",
      },
      {
        name: "storage-bucket-missing",
        trigger: "HeadBucket fails for the configured docs bucket.",
        severity: "critical",
        action: "Restore the docs bucket and verify API credentials before resuming uploads.",
      },
      {
        name: "storage-write-probe-failure",
        trigger: "The bounded put/head/delete storage probe fails.",
        severity: "critical",
        action: "Treat as a production outage; do not trust upload success until the probe passes again.",
      },
      {
        name: "missing-object-count-rising",
        trigger: "Historical object audit finds more missing DB-backed objects than the last known baseline.",
        severity: "high",
        action: "Investigate object retention/backups and identify the affected upload date range.",
      },
      {
        name: "document-recognition-cache-unhealthy",
        trigger: "document_recognition.taskCache is missing on active rows or per-row cache entry counts exceed the bounded threshold.",
        severity: "high",
        action: "Inspect cache metadata rollout and clear malformed taskCache entries before they cause repeated recompute or row bloat.",
      },
    ],
    summary: {
      healthy: false,
      autoFixedIssues: [],
      manualActionRequiredIssues: [],
      skippedChecks: [],
    },
  };

  printVerbose("resolved git state", gitState);
  const apiRuntimeEnv = await loadApiRuntimeEnv();

  const baseline = {
    pm2: await collectPm2State({ cwd: repoRoot }),
    tesseract: await probeTesseract(),
    apiHealth: null,
    webHealth: null,
    apiVersion: null,
    webVersion: null,
    dashboard: null,
    demoLogin: null,
    demoSeed: null,
    reviewQueue: null,
    recognition: null,
    deployVerify: null,
    deployStatus: null,
    versionParity: null,
    dirtyFlag: null,
    storage: null,
    cache: null,
  };

  baseline.apiHealth = await probeApiHealth();
  baseline.webHealth = await probeWebHealth();

  baseline.apiVersion = await probeVersion("http://127.0.0.1:4000");
  baseline.webVersion = await probeVersion("http://127.0.0.1:3000");
  baseline.dashboard = await probeDashboardRoute();
  baseline.demoLogin = await probeDemoLogin();
  baseline.demoSeed = await probeDemoSeedEndpoint();
  baseline.reviewQueue = await probeReviewQueue(process.env.PRODUCTION_GUARD_AUTH_TOKEN ?? null);
  baseline.recognition = await probeRecognition(
    process.env.PRODUCTION_GUARD_AUTH_TOKEN ?? null,
    baseline.reviewQueue.status === "pass" ? baseline.reviewQueue : null
  );
  baseline.deployVerify = await runDeployCheckScript("check-running-version.mjs", [
    "--require-services",
    "api,web",
    "http://127.0.0.1:4000",
    "http://127.0.0.1:3000",
  ]);
  baseline.deployStatus = await runDeployCheckScript("deploy-status.mjs");
  baseline.versionParity = evaluateVersionParity(gitState, baseline.apiVersion.evidence, baseline.webVersion.evidence);
  baseline.dirtyFlag = evaluateDirtyFlag(baseline.apiVersion.evidence, baseline.webVersion.evidence);
  baseline.storage = await collectStorageChecks(apiRuntimeEnv);
  baseline.cache = await collectRecognitionCacheHealth(apiRuntimeEnv);

  const initial = structuredClone(baseline);

  const remediationTargets = [];
  for (const appName of ["doc-platform-api", "doc-platform-web", "doc-platform-worker"]) {
    const appState = baseline.pm2.apps?.[appName] ?? null;
    const appHealthFailed =
      (appName === "doc-platform-api" && hasApiReloadableFailure(baseline)) ||
      (appName === "doc-platform-web" && hasWebReloadableFailure(baseline));
    const action = choosePm2Action(appName, appHealthFailed, appState);
    if (action) {
      remediationTargets.push({ appName, action, appState, healthFailed: appHealthFailed });
    }
  }

  if (remediationTargets.length > 0 && !flags.dryRun && !flags.noFix) {
    report.remediation.attempted = true;
    for (const target of remediationTargets) {
      printVerbose(`attempting remediation for ${target.appName}`, target);
      const remediation = await remediatePm2App(target.appName, target.action, target.appState);
      report.remediation.actions.push({
        appName: target.appName,
        action: target.action,
        attempted: remediation.attempted,
        skipped: Boolean(remediation.result?.skipped),
        reason: remediation.result?.reason ?? null,
      });
      report.remediation.results.push({
        appName: target.appName,
        ...remediation.result,
      });

      if (target.appName === "doc-platform-api") {
        baseline.pm2 = await collectPm2State({ cwd: repoRoot });
        baseline.apiHealth = await probeApiHealth();
        baseline.apiVersion = await probeVersion("http://127.0.0.1:4000");
        baseline.dashboard = await probeDashboardRoute();
        baseline.demoLogin = await probeDemoLogin();
        baseline.demoSeed = await probeDemoSeedEndpoint();
        baseline.reviewQueue = await probeReviewQueue(process.env.PRODUCTION_GUARD_AUTH_TOKEN ?? null);
        baseline.recognition = await probeRecognition(
          process.env.PRODUCTION_GUARD_AUTH_TOKEN ?? null,
          baseline.reviewQueue.status === "pass" ? baseline.reviewQueue : null
        );
        baseline.storage = await collectStorageChecks(apiRuntimeEnv);
        baseline.cache = await collectRecognitionCacheHealth(apiRuntimeEnv);
      }

      if (target.appName === "doc-platform-web") {
        baseline.pm2 = await collectPm2State({ cwd: repoRoot });
        baseline.webHealth = await probeWebHealth();
        baseline.webVersion = await probeVersion("http://127.0.0.1:3000");
        baseline.dashboard = await probeDashboardRoute();
      }

      if (target.appName === "doc-platform-worker") {
        baseline.pm2 = await collectPm2State({ cwd: repoRoot });
      }
    }
  }

  baseline.deployVerify = await runDeployCheckScript("check-running-version.mjs", [
    "--require-services",
    "api,web",
    "http://127.0.0.1:4000",
    "http://127.0.0.1:3000",
  ]);
  baseline.deployStatus = await runDeployCheckScript("deploy-status.mjs");
  baseline.versionParity = evaluateVersionParity(gitState, baseline.apiVersion.evidence, baseline.webVersion.evidence);
  baseline.dirtyFlag = evaluateDirtyFlag(baseline.apiVersion.evidence, baseline.webVersion.evidence);
  baseline.storage = await collectStorageChecks(apiRuntimeEnv);
  baseline.cache = await collectRecognitionCacheHealth(apiRuntimeEnv);

  const apiRemediationAttempted = report.remediation.actions.some(
    (item) => item.appName === "doc-platform-api" && item.attempted && !item.skipped
  );
  const webRemediationAttempted = report.remediation.actions.some(
    (item) => item.appName === "doc-platform-web" && item.attempted && !item.skipped
  );
  const workerRemediationAttempted = report.remediation.actions.some(
    (item) => item.appName === "doc-platform-worker" && item.attempted && !item.skipped
  );
  const apiRemediationResult = report.remediation.results.find((item) => item.appName === "doc-platform-api") ?? null;
  const webRemediationResult = report.remediation.results.find((item) => item.appName === "doc-platform-web") ?? null;
  const workerRemediationResult =
    report.remediation.results.find((item) => item.appName === "doc-platform-worker") ?? null;
  const apiRemediationAction =
    report.remediation.actions.find((item) => item.appName === "doc-platform-api")?.action ?? null;
  const webRemediationAction =
    report.remediation.actions.find((item) => item.appName === "doc-platform-web")?.action ?? null;
  const workerRemediationAction =
    report.remediation.actions.find((item) => item.appName === "doc-platform-worker")?.action ?? null;

  const checks = [
    {
      name: "pm2-state",
      status: baseline.pm2.success && pm2AppsHealthy(baseline.pm2) ? "pass" : "fail",
      evidence: { before: initial.pm2, after: baseline.pm2 },
      remediationAttempted: apiRemediationAttempted || webRemediationAttempted || workerRemediationAttempted,
      remediationAction: report.remediation.actions,
      remediationResult: report.remediation.results,
      manualActionRequired: !(baseline.pm2.success && pm2AppsHealthy(baseline.pm2)),
      manualAction:
        baseline.pm2.success && pm2AppsHealthy(baseline.pm2)
          ? null
          : "PM2 state could not be collected or one of the target apps is not healthy.",
    },
    {
      name: "api-health",
      status: baseline.apiHealth.status,
      evidence: { before: initial.apiHealth.evidence, after: baseline.apiHealth.evidence },
      remediationAttempted: apiRemediationAttempted,
      remediationAction: apiRemediationAction,
      remediationResult: apiRemediationResult,
      after: baseline.apiHealth.evidence,
      manualActionRequired: baseline.apiHealth.status === "fail",
      manualAction: baseline.apiHealth.manualAction ?? null,
    },
    {
      name: "web-health",
      status: baseline.webHealth.status,
      evidence: { before: initial.webHealth.evidence, after: baseline.webHealth.evidence },
      remediationAttempted: webRemediationAttempted,
      remediationAction: webRemediationAction,
      remediationResult: webRemediationResult,
      after: baseline.webHealth.evidence,
      manualActionRequired: baseline.webHealth.status === "fail",
      manualAction: baseline.webHealth.manualAction ?? null,
    },
    {
      name: "api-version",
      status: baseline.apiVersion.status,
      evidence: { before: initial.apiVersion.evidence, after: baseline.apiVersion.evidence },
      remediationAttempted: apiRemediationAttempted,
      remediationAction: apiRemediationAction,
      remediationResult: apiRemediationResult,
      after: baseline.apiVersion.evidence,
      manualActionRequired: baseline.apiVersion.status === "fail",
      manualAction: baseline.apiVersion.manualAction ?? null,
    },
    {
      name: "web-version",
      status: baseline.webVersion.status,
      evidence: { before: initial.webVersion.evidence, after: baseline.webVersion.evidence },
      remediationAttempted: webRemediationAttempted,
      remediationAction: webRemediationAction,
      remediationResult: webRemediationResult,
      after: baseline.webVersion.evidence,
      manualActionRequired: baseline.webVersion.status === "fail",
      manualAction: baseline.webVersion.manualAction ?? null,
    },
    {
      name: "deploy-verify",
      status: baseline.deployVerify.status,
      evidence: baseline.deployVerify.evidence,
      remediationAttempted: false,
      remediationAction: null,
      remediationResult: null,
      manualActionRequired: baseline.deployVerify.status === "fail",
      manualAction: baseline.deployVerify.manualAction ?? null,
    },
    {
      name: "deploy-status",
      status: baseline.deployStatus.status,
      evidence: baseline.deployStatus.evidence,
      remediationAttempted: false,
      remediationAction: null,
      remediationResult: null,
      manualActionRequired: baseline.deployStatus.status === "fail",
      manualAction: baseline.deployStatus.manualAction ?? null,
    },
    {
      name: "dashboard-route",
      status: baseline.dashboard.status,
      evidence: { before: initial.dashboard.evidence, after: baseline.dashboard.evidence },
      remediationAttempted: webRemediationAttempted,
      remediationAction: webRemediationAction,
      remediationResult: webRemediationResult,
      manualActionRequired: baseline.dashboard.status === "fail",
      manualAction: baseline.dashboard.manualAction ?? null,
    },
    {
      name: "review-queue",
      status: baseline.reviewQueue.status,
      evidence: { before: initial.reviewQueue.evidence, after: baseline.reviewQueue.evidence },
      remediationAttempted: apiRemediationAttempted,
      remediationAction: apiRemediationAction,
      remediationResult: apiRemediationResult,
      manualActionRequired: baseline.reviewQueue.status === "fail",
      manualAction: baseline.reviewQueue.manualAction ?? null,
    },
    {
      name: "recognition-route",
      status: baseline.recognition.status,
      evidence: { before: initial.recognition.evidence, after: baseline.recognition.evidence },
      remediationAttempted: apiRemediationAttempted,
      remediationAction: apiRemediationAction,
      remediationResult: apiRemediationResult,
      manualActionRequired: baseline.recognition.status === "fail",
      manualAction: baseline.recognition.manualAction ?? null,
    },
    {
      name: "recognition-cache-health",
      status: baseline.cache.status,
      evidence: { before: initial.cache.evidence, after: baseline.cache.evidence },
      remediationAttempted: false,
      remediationAction: null,
      remediationResult: null,
      manualActionRequired: baseline.cache.manualActionRequired,
      manualAction: baseline.cache.manualAction ?? null,
    },
    {
      name: "demo-login-blocked",
      status: baseline.demoLogin.status,
      evidence: { before: initial.demoLogin.evidence, after: baseline.demoLogin.evidence },
      remediationAttempted: false,
      remediationAction: null,
      remediationResult: null,
      manualActionRequired: baseline.demoLogin.status === "fail",
      manualAction: baseline.demoLogin.manualAction ?? null,
    },
    {
      name: "demo-seed-blocked",
      status: baseline.demoSeed.status,
      evidence: { before: initial.demoSeed.evidence, after: baseline.demoSeed.evidence },
      remediationAttempted: false,
      remediationAction: null,
      remediationResult: null,
      manualActionRequired: baseline.demoSeed.status === "fail",
      manualAction: baseline.demoSeed.manualAction ?? null,
    },
    {
      name: "tesseract-discovery",
      status: baseline.tesseract.status,
      evidence: { before: initial.tesseract.evidence, after: baseline.tesseract.evidence },
      remediationAttempted: false,
      remediationAction: null,
      remediationResult: null,
      manualActionRequired: baseline.tesseract.status === "fail",
      manualAction: baseline.tesseract.manualAction ?? null,
    },
    {
      name: "stale-build-version-mismatch",
      status: baseline.versionParity.status,
      evidence: { before: initial.versionParity.evidence, after: baseline.versionParity.evidence },
      remediationAttempted: apiRemediationAttempted || webRemediationAttempted,
      remediationAction: report.remediation.actions.filter((item) =>
        item.appName === "doc-platform-api" || item.appName === "doc-platform-web"
      ),
      remediationResult: report.remediation.results.filter((item) =>
        item.appName === "doc-platform-api" || item.appName === "doc-platform-web"
      ),
      manualActionRequired: baseline.versionParity.status === "fail",
      manualAction: baseline.versionParity.manualAction ?? null,
    },
    {
      name: "dirty-build-flag",
      status: baseline.dirtyFlag.status,
      evidence: { before: initial.dirtyFlag.evidence, after: baseline.dirtyFlag.evidence },
      remediationAttempted: apiRemediationAttempted || webRemediationAttempted,
      remediationAction: report.remediation.actions.filter((item) =>
        item.appName === "doc-platform-api" || item.appName === "doc-platform-web"
      ),
      remediationResult: report.remediation.results.filter((item) =>
        item.appName === "doc-platform-api" || item.appName === "doc-platform-web"
      ),
      manualActionRequired: baseline.dirtyFlag.status === "fail",
      manualAction: baseline.dirtyFlag.manualAction ?? null,
    },
    {
      name: "storage-config",
      status: baseline.storage.config.status,
      evidence: { before: initial.storage.config.evidence, after: baseline.storage.config.evidence },
      remediationAttempted: false,
      remediationAction: null,
      remediationResult: null,
      manualActionRequired: baseline.storage.config.manualActionRequired,
      manualAction: baseline.storage.config.manualAction ?? null,
    },
    {
      name: "storage-service",
      status: baseline.storage.readOnlyChecks.service.status,
      evidence: {
        before: initial.storage.readOnlyChecks.service.evidence,
        after: baseline.storage.readOnlyChecks.service.evidence,
      },
      remediationAttempted: false,
      remediationAction: null,
      remediationResult: null,
      manualActionRequired: baseline.storage.readOnlyChecks.service.manualActionRequired,
      manualAction: baseline.storage.readOnlyChecks.service.manualAction ?? null,
    },
    {
      name: "storage-listener",
      status: baseline.storage.readOnlyChecks.listener.status,
      evidence: {
        before: initial.storage.readOnlyChecks.listener.evidence,
        after: baseline.storage.readOnlyChecks.listener.evidence,
      },
      remediationAttempted: false,
      remediationAction: null,
      remediationResult: null,
      manualActionRequired: baseline.storage.readOnlyChecks.listener.manualActionRequired,
      manualAction: baseline.storage.readOnlyChecks.listener.manualAction ?? null,
    },
    {
      name: "storage-bucket",
      status: baseline.storage.readOnlyChecks.bucket.status,
      evidence: {
        before: initial.storage.readOnlyChecks.bucket.evidence,
        after: baseline.storage.readOnlyChecks.bucket.evidence,
      },
      remediationAttempted: false,
      remediationAction: null,
      remediationResult: null,
      manualActionRequired: baseline.storage.readOnlyChecks.bucket.manualActionRequired,
      manualAction: baseline.storage.readOnlyChecks.bucket.manualAction ?? null,
    },
    {
      name: "storage-write-probe",
      status: baseline.storage.writeProbe.status,
      evidence: { before: initial.storage.writeProbe.evidence, after: baseline.storage.writeProbe.evidence },
      remediationAttempted: false,
      remediationAction: null,
      remediationResult: null,
      manualActionRequired: baseline.storage.writeProbe.manualActionRequired,
      manualAction: baseline.storage.writeProbe.manualAction ?? null,
      severity: baseline.storage.writeProbe.severity ?? "critical",
    },
  ];

  report.checks = checks;
  report.storage = {
    endpoint: baseline.storage.endpointInfo.endpoint ?? null,
    filesLoaded: baseline.storage.config.evidence.filesLoaded ?? [],
    readOnly: {
      service: baseline.storage.readOnlyChecks.service,
      listener: baseline.storage.readOnlyChecks.listener,
      bucket: baseline.storage.readOnlyChecks.bucket,
    },
    writeProbe: baseline.storage.writeProbe,
  };
  report.cache = {
    ...baseline.cache.evidence,
    routeProbe:
      baseline.recognition.status === "pass"
        ? {
            targetDocumentId: baseline.recognition.evidence.targetDocumentId ?? null,
            cacheUsed: baseline.recognition.evidence.response?.json?.cacheUsed ?? null,
            cache: baseline.recognition.evidence.response?.json?.cache ?? null,
          }
        : null,
  };
  report.summary.skippedChecks = checks.filter((check) => check.status === "skip").map((check) => check.name);
  report.summary.autoFixedIssues = checks
    .filter((check) => check.remediationAttempted && check.status === "pass")
    .map((check) => check.name);
  report.summary.manualActionRequiredIssues = checks
    .filter((check) => check.status === "fail" || check.manualActionRequired)
    .map((check) => ({
      name: check.name,
      manualAction: check.manualAction ?? "Manual follow-up required.",
      evidence: check.evidence,
    }));
  report.summary.healthy =
    report.summary.manualActionRequiredIssues.length === 0 &&
    checks.every((check) => check.status === "pass" || check.status === "skip");

  const reportJsonPath = `${reportBase}.json`;
  const reportMdPath = `${reportBase}.md`;

  const markdownLines = [];
  markdownLines.push(`# Production Guard Report`);
  markdownLines.push("");
  markdownLines.push(`- timestamp: ${timestamp}`);
  markdownLines.push(`- environment: ${process.env.NODE_ENV ?? "unknown"}`);
  markdownLines.push(`- commit: ${gitState.sha}`);
  markdownLines.push(`- versionLabel: ${gitState.versionLabel}`);
  markdownLines.push(`- healthy: ${report.summary.healthy ? "yes" : "no"}`);
  markdownLines.push("");
  markdownLines.push(`## Storage`);
  markdownLines.push("");
  markdownLines.push(`- endpoint: ${report.storage.endpoint ?? "unknown"}`);
  markdownLines.push(`- env files: ${report.storage.filesLoaded.length > 0 ? report.storage.filesLoaded.join(", ") : "none"}`);
  markdownLines.push(
    `- read-only checks: service=${report.storage.readOnly.service.status}, listener=${report.storage.readOnly.listener.status}, bucket=${report.storage.readOnly.bucket.status}`
  );
  markdownLines.push(`- active write probe: ${report.storage.writeProbe.status}`);
  markdownLines.push("");
  markdownLines.push(`## Recognition Cache`);
  markdownLines.push("");
  markdownLines.push(`- status: ${baseline.cache.status}`);
  markdownLines.push(`- total rows: ${report.cache.totalRows ?? "n/a"}`);
  markdownLines.push(`- rows with taskCache: ${report.cache.rowsWithTaskCache ?? "n/a"}`);
  markdownLines.push(`- rows with non-empty taskCache: ${report.cache.rowsWithNonemptyTaskCache ?? "n/a"}`);
  markdownLines.push(`- cache being used: ${report.cache.cacheBeingUsed ?? "n/a"}`);
  markdownLines.push(`- max task entries per row: ${report.cache.maxTaskEntries ?? "n/a"}`);
  markdownLines.push(
    `- live recognition probe cacheUsed: ${
      report.cache.routeProbe?.cacheUsed == null ? "n/a" : report.cache.routeProbe.cacheUsed ? "true" : "false"
    }`
  );
  markdownLines.push("");
  markdownLines.push(`## Alerting Recommendations`);
  markdownLines.push("");
  for (const recommendation of report.alertingRecommendations) {
    markdownLines.push(
      `- ${recommendation.name} (${recommendation.severity}): ${recommendation.trigger} Action: ${recommendation.action}`
    );
  }
  markdownLines.push("");
  markdownLines.push(`## Checks`);
  markdownLines.push("");
  markdownLines.push(`| Check | Status | Evidence | Remediation |`);
  markdownLines.push(`| --- | --- | --- | --- |`);
  for (const check of checks) {
    const evidencePreview = trim(JSON.stringify(check.evidence), 180);
    const remediationPreview = check.remediationAttempted
      ? trim(JSON.stringify(check.remediationResult ?? check.remediationAction), 120)
      : "none";
    markdownLines.push(
      `| ${check.name} | ${check.status} | ${evidencePreview ? evidencePreview.replace(/\|/g, "\\|") : "n/a"} | ${remediationPreview ? remediationPreview.replace(/\|/g, "\\|") : "none"} |`
    );
  }
  markdownLines.push("");
  markdownLines.push(`## Summary`);
  markdownLines.push("");
  markdownLines.push(`- auto-fixed issues: ${report.summary.autoFixedIssues.length > 0 ? report.summary.autoFixedIssues.join(", ") : "none"}`);
  markdownLines.push(
    `- manual-action-required issues: ${
      report.summary.manualActionRequiredIssues.length > 0
        ? report.summary.manualActionRequiredIssues.map((issue) => issue.name).join(", ")
        : "none"
    }`
  );
  markdownLines.push(`- skipped checks: ${report.summary.skippedChecks.length > 0 ? report.summary.skippedChecks.join(", ") : "none"}`);
  markdownLines.push("");
  if (report.summary.manualActionRequiredIssues.length > 0) {
    markdownLines.push(`## Manual Follow-up`);
    markdownLines.push("");
    for (const issue of report.summary.manualActionRequiredIssues) {
      markdownLines.push(`- ${issue.name}: ${issue.manualAction}`);
    }
    markdownLines.push("");
  }

  await writeFile(reportJsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(reportMdPath, `${markdownLines.join("\n")}\n`, "utf8");

  console.log(`[guard] wrote report: ${reportJsonPath}`);
  console.log(`[guard] wrote report: ${reportMdPath}`);
  console.log(
    `[guard] summary healthy=${report.summary.healthy ? "yes" : "no"} autoFixed=${report.summary.autoFixedIssues.length} manual=${report.summary.manualActionRequiredIssues.length} skipped=${report.summary.skippedChecks.length}`
  );

  if (!report.summary.healthy) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error("[guard] failed:", error instanceof Error ? error.stack ?? error.message : String(error));
    process.exit(1);
  });
}
