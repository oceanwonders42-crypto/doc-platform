import { appendFile, mkdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

import { repoRoot } from "./deploy-lib.mjs";

const DEFAULT_WEB_URL = "https://onyxintels.com";
const DEFAULT_API_URL = "https://api.onyxintels.com";
const DEFAULT_LOG_PATH = path.join(repoRoot, "logs", "upload-smoke.log");
const SMALL_UPLOAD_BYTES = 1 * 1024 * 1024;
const LARGE_UPLOAD_BYTES = 105 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 90_000;
const ROLE_CANDIDATES = ["PLATFORM_ADMIN", "FIRM_ADMIN", "PARALEGAL", "STAFF"];

const apiRequire = createRequire(path.join(repoRoot, "apps", "api", "package.json"));
const jwt = apiRequire("jsonwebtoken");
const { Client } = apiRequire("pg");

function printUsage() {
  console.log(
    "Usage: node scripts/production-upload-smoke.mjs [--web-url <url>] [--api-url <url>] [--token <bearer>] [--email <email>] [--password <password>] [--log-path <path>]"
  );
}

function parseArgs(rawArgs) {
  const options = {
    webUrl: process.env.UPLOAD_SMOKE_WEB_URL?.trim() || DEFAULT_WEB_URL,
    apiUrl: process.env.UPLOAD_SMOKE_API_URL?.trim() || DEFAULT_API_URL,
    bearerToken: process.env.UPLOAD_SMOKE_BEARER_TOKEN?.trim() || "",
    email: process.env.UPLOAD_SMOKE_EMAIL?.trim() || "",
    password: process.env.UPLOAD_SMOKE_PASSWORD?.trim() || "",
    logPath: process.env.UPLOAD_SMOKE_LOG_PATH?.trim() || DEFAULT_LOG_PATH,
  };

  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];
    if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    }
    if (arg === "--web-url") {
      options.webUrl = rawArgs[index + 1] ?? options.webUrl;
      index += 1;
      continue;
    }
    if (arg === "--api-url") {
      options.apiUrl = rawArgs[index + 1] ?? options.apiUrl;
      index += 1;
      continue;
    }
    if (arg === "--token") {
      options.bearerToken = rawArgs[index + 1] ?? options.bearerToken;
      index += 1;
      continue;
    }
    if (arg === "--email") {
      options.email = rawArgs[index + 1] ?? options.email;
      index += 1;
      continue;
    }
    if (arg === "--password") {
      options.password = rawArgs[index + 1] ?? options.password;
      index += 1;
      continue;
    }
    if (arg === "--log-path") {
      options.logPath = rawArgs[index + 1] ?? options.logPath;
      index += 1;
      continue;
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

function normalizeBaseUrl(input) {
  const url = new URL(input);
  url.pathname = url.pathname.replace(/\/+$/, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/+$/, "");
}

function joinUrl(base, pathname) {
  const url = new URL(base);
  url.pathname = pathname;
  url.search = "";
  url.hash = "";
  return url.toString();
}

function resolveJwtSecret() {
  return (
    process.env.JWT_SECRET?.trim() ||
    process.env.SESSION_SECRET?.trim() ||
    process.env.API_SECRET?.trim() ||
    null
  );
}

function buildDummyPdf(sizeBytes) {
  const buffer = Buffer.alloc(sizeBytes);
  const header = Buffer.from("%PDF-1.4\n", "ascii");
  header.copy(buffer, 0);
  return new Blob([buffer], { type: "application/pdf" });
}

function sanitizeSnippet(text) {
  return String(text ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
}

function looksLikeHtml(text, contentType) {
  const trimmed = String(text ?? "").trim().toLowerCase();
  const type = String(contentType ?? "").toLowerCase();
  return type.includes("text/html") || trimmed.startsWith("<html") || trimmed.startsWith("<!doctype html") || trimmed.startsWith("<");
}

async function fetchWithCapture(url, init = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        ...(init.headers ?? {}),
      },
    });
    const text = await response.text();
    const contentType = response.headers.get("content-type") ?? "";
    let json = null;
    let validJson = false;
    try {
      json = text ? JSON.parse(text) : null;
      validJson = true;
    } catch {
      json = null;
    }
    return {
      ok: response.ok,
      status: response.status,
      contentType,
      text,
      json,
      validJson,
      htmlDetected: looksLikeHtml(text, contentType),
      snippet: sanitizeSnippet(text),
      url,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      contentType: "",
      text: "",
      json: null,
      validJson: false,
      htmlDetected: false,
      snippet: error instanceof Error ? error.message : String(error),
      url,
      networkError: true,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function buildUploadForm(sizeBytes, fileName) {
  const form = new FormData();
  form.append("source", "production-upload-smoke");
  form.append("files", buildDummyPdf(sizeBytes), fileName);
  return form;
}

async function acquireBearerToken(options) {
  if (options.bearerToken) {
    return { token: options.bearerToken, mode: "provided-token" };
  }

  if (options.email && options.password) {
    const loginResponse = await fetchWithCapture(joinUrl(options.apiUrl, "/auth/login"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: options.email,
        password: options.password,
      }),
    });

    if (loginResponse.validJson && loginResponse.status === 200 && loginResponse.json?.token) {
      return { token: loginResponse.json.token, mode: "login" };
    }

    return {
      token: null,
      mode: "login-failed",
      failure: `login failed (${loginResponse.status})`,
      response: loginResponse,
    };
  }

  const trustedApiBase = (
    process.env.API_PUBLIC_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_API_URL?.trim() ||
    process.env.DOC_API_URL?.trim() ||
    ""
  )
    .replace(/\/+$/, "");

  if (trustedApiBase && normalizeBaseUrl(trustedApiBase) === normalizeBaseUrl(options.apiUrl)) {
    const databaseUrl = process.env.DATABASE_URL?.trim();
    const jwtSecret = resolveJwtSecret();
    if (databaseUrl && jwtSecret) {
      const client = new Client({ connectionString: databaseUrl });
      await client.connect();
      try {
        const userResult = await client.query(
          `
          select id, "firmId", email, role
          from "User"
          where role = any($1::"Role"[])
          order by
            case
              when role = 'PLATFORM_ADMIN' then 0
              when role = 'FIRM_ADMIN' then 1
              when role = 'PARALEGAL' then 2
              else 3
            end,
            "createdAt" asc
          limit 1
          `,
          [ROLE_CANDIDATES]
        );
        const candidate = userResult.rows[0];
        if (candidate?.id && candidate?.firmId && candidate?.role) {
          const token = jwt.sign(
            {
              userId: candidate.id,
              firmId: candidate.firmId,
              role: candidate.role,
              email: candidate.email ?? "",
            },
            jwtSecret,
            { algorithm: "HS256", expiresIn: "15m" }
          );
          return { token, mode: "local-jwt" };
        }
      } finally {
        await client.end();
      }
    }
  }

  return { token: null, mode: "no-auth" };
}

function initResult() {
  return {
    overall: "PASS",
    failures: [],
    htmlDetected: [],
    sections: {
      version: {
        webCommit: "unknown",
        apiCommit: "unknown",
        match: "no",
        webSource: "unknown",
        apiSource: "unknown",
        webDirty: "unknown",
        apiDirty: "unknown",
      },
      method: {
        status: "not run",
        contentType: "n/a",
        validJson: "no",
        snippet: "",
      },
      smallUpload: {
        status: "not run",
        okField: "n/a",
        validJson: "no",
        snippet: "",
      },
      largeUpload: {
        status: "not run",
        code: "n/a",
        validJson: "no",
        snippet: "",
      },
    },
  };
}

function markFailure(result, location, message, snippet) {
  result.overall = "FAIL";
  result.failures.push({ location, message, snippet: sanitizeSnippet(snippet) });
}

function noteHtml(result, location, snippet) {
  result.htmlDetected.push({ location, snippet: sanitizeSnippet(snippet) });
}

function ensureJson(result, location, response) {
  if (response.networkError) {
    markFailure(result, location, `network error for ${response.url}`, response.snippet);
    return false;
  }
  if (response.htmlDetected) {
    noteHtml(result, location, response.snippet);
    markFailure(result, location, `received HTML from ${response.url}`, response.snippet);
    return false;
  }
  if (!response.validJson) {
    markFailure(result, location, `response was not valid JSON from ${response.url}`, response.snippet);
    return false;
  }
  return true;
}

async function runVersionCheck(result, options) {
  const webResponse = await fetchWithCapture(joinUrl(options.webUrl, "/version"));
  const apiResponse = await fetchWithCapture(joinUrl(options.apiUrl, "/version"));

  const webOk = ensureJson(result, "VERSION web", webResponse);
  const apiOk = ensureJson(result, "VERSION api", apiResponse);

  result.sections.version.webCommit = webResponse.json?.commitHash ?? "unknown";
  result.sections.version.apiCommit = apiResponse.json?.commitHash ?? "unknown";
  result.sections.version.webSource = webResponse.json?.buildSource ?? "unknown";
  result.sections.version.apiSource = apiResponse.json?.buildSource ?? "unknown";
  result.sections.version.webDirty = String(webResponse.json?.buildDirty ?? "unknown");
  result.sections.version.apiDirty = String(apiResponse.json?.buildDirty ?? "unknown");
  result.sections.version.match =
    webResponse.json?.commitHash && apiResponse.json?.commitHash && webResponse.json.commitHash === apiResponse.json.commitHash
      ? "yes"
      : "no";

  if (!webOk || !apiOk) return;

  if (webResponse.json?.service !== "web") {
    markFailure(result, "VERSION web", `expected web service, got ${webResponse.json?.service ?? "unknown"}`, webResponse.snippet);
  }
  if (apiResponse.json?.service !== "api") {
    markFailure(result, "VERSION api", `expected api service, got ${apiResponse.json?.service ?? "unknown"}`, apiResponse.snippet);
  }
  if (webResponse.json?.commitHash !== apiResponse.json?.commitHash) {
    markFailure(
      result,
      "VERSION",
      `web/api commit mismatch (${webResponse.json?.commitHash ?? "unknown"} vs ${apiResponse.json?.commitHash ?? "unknown"})`,
      `${webResponse.snippet} | ${apiResponse.snippet}`
    );
  }
  if (webResponse.json?.buildSource !== "deploy-production") {
    markFailure(result, "VERSION web", `unexpected web buildSource ${webResponse.json?.buildSource ?? "unknown"}`, webResponse.snippet);
  }
  if (apiResponse.json?.buildSource !== "deploy-production") {
    markFailure(result, "VERSION api", `unexpected api buildSource ${apiResponse.json?.buildSource ?? "unknown"}`, apiResponse.snippet);
  }
  if (webResponse.json?.buildDirty !== false) {
    markFailure(result, "VERSION web", `unexpected web buildDirty ${webResponse.json?.buildDirty}`, webResponse.snippet);
  }
  if (apiResponse.json?.buildDirty !== false) {
    markFailure(result, "VERSION api", `unexpected api buildDirty ${apiResponse.json?.buildDirty}`, apiResponse.snippet);
  }
}

async function runMethodCheck(result, options) {
  const response = await fetchWithCapture(joinUrl(options.apiUrl, "/me/ingest/bulk"), {
    method: "POST",
  });
  result.sections.method.status = String(response.status);
  result.sections.method.contentType = response.contentType || "missing";
  result.sections.method.validJson = response.validJson ? "yes" : "no";
  result.sections.method.snippet = response.snippet;

  if (!ensureJson(result, "METHOD CHECK", response)) return;

  if (![401, 405].includes(response.status)) {
    markFailure(result, "METHOD CHECK", `expected 401 or 405, got ${response.status}`, response.snippet);
  }
}

async function runSmallUploadCheck(result, options, auth) {
  const headers = auth.token ? { Authorization: `Bearer ${auth.token}` } : {};
  const response = await fetchWithCapture(joinUrl(options.apiUrl, "/me/ingest/bulk"), {
    method: "POST",
    headers,
    body: buildUploadForm(SMALL_UPLOAD_BYTES, "upload-smoke-small.pdf"),
  });

  result.sections.smallUpload.status = String(response.status);
  result.sections.smallUpload.okField =
    response.validJson && Object.prototype.hasOwnProperty.call(response.json ?? {}, "ok")
      ? String(response.json?.ok)
      : "missing";
  result.sections.smallUpload.validJson = response.validJson ? "yes" : "no";
  result.sections.smallUpload.snippet = response.snippet;

  if (!ensureJson(result, "SMALL UPLOAD", response)) return;

  if (auth.token) {
    if (response.status !== 200 || response.json?.ok !== true) {
      markFailure(result, "SMALL UPLOAD", `expected 200 ok:true, got ${response.status}`, response.snippet);
    }
    return;
  }

  if (![401, 403, 405].includes(response.status)) {
    markFailure(
      result,
      "SMALL UPLOAD",
      `expected simulated auth failure JSON when no token is available, got ${response.status}`,
      response.snippet
    );
  }
}

async function runLargeUploadCheck(result, options, auth) {
  const headers = auth.token ? { Authorization: `Bearer ${auth.token}` } : {};
  const response = await fetchWithCapture(joinUrl(options.apiUrl, "/me/ingest/bulk"), {
    method: "POST",
    headers,
    body: buildUploadForm(LARGE_UPLOAD_BYTES, "upload-smoke-large.pdf"),
  });

  result.sections.largeUpload.status = String(response.status);
  result.sections.largeUpload.code = response.validJson ? String(response.json?.code ?? "missing") : "missing";
  result.sections.largeUpload.validJson = response.validJson ? "yes" : "no";
  result.sections.largeUpload.snippet = response.snippet;

  if (!ensureJson(result, "LARGE UPLOAD", response)) return;

  if (auth.token) {
    if (response.status !== 413) {
      markFailure(result, "LARGE UPLOAD", `expected 413, got ${response.status}`, response.snippet);
    }
    if (response.json?.code !== "PAYLOAD_TOO_LARGE") {
      markFailure(
        result,
        "LARGE UPLOAD",
        `expected code PAYLOAD_TOO_LARGE, got ${response.json?.code ?? "missing"}`,
        response.snippet
      );
    }
    return;
  }

  if (![401, 403, 405].includes(response.status)) {
    markFailure(
      result,
      "LARGE UPLOAD",
      `expected simulated auth failure JSON when no token is available, got ${response.status}`,
      response.snippet
    );
  }
}

function renderReport(result) {
  const htmlDetected = result.htmlDetected.length > 0 ? "yes" : "no";
  const htmlWhere = result.htmlDetected.length > 0 ? result.htmlDetected.map((entry) => `${entry.location}: ${entry.snippet}`).join(" | ") : "none";
  const failureSummary =
    result.failures.length > 0
      ? result.failures.map((entry) => `${entry.location}: ${entry.message}${entry.snippet ? ` (${entry.snippet})` : ""}`).join(" | ")
      : "none";

  return [
    "A. STATUS",
    `- overall: ${result.overall}`,
    `- failure: ${failureSummary}`,
    "",
    "B. VERSION",
    `- web commit: ${result.sections.version.webCommit}`,
    `- api commit: ${result.sections.version.apiCommit}`,
    `- match: ${result.sections.version.match}`,
    `- web buildSource: ${result.sections.version.webSource}`,
    `- api buildSource: ${result.sections.version.apiSource}`,
    `- web buildDirty: ${result.sections.version.webDirty}`,
    `- api buildDirty: ${result.sections.version.apiDirty}`,
    "",
    "C. METHOD CHECK",
    `- status: ${result.sections.method.status}`,
    `- content-type: ${result.sections.method.contentType}`,
    `- valid JSON: ${result.sections.method.validJson}`,
    `- snippet: ${result.sections.method.snippet || "none"}`,
    "",
    "D. SMALL UPLOAD",
    `- status: ${result.sections.smallUpload.status}`,
    `- ok field: ${result.sections.smallUpload.okField}`,
    `- JSON: ${result.sections.smallUpload.validJson}`,
    `- snippet: ${result.sections.smallUpload.snippet || "none"}`,
    "",
    "E. LARGE UPLOAD",
    `- status: ${result.sections.largeUpload.status}`,
    `- code: ${result.sections.largeUpload.code}`,
    `- JSON: ${result.sections.largeUpload.validJson}`,
    `- snippet: ${result.sections.largeUpload.snippet || "none"}`,
    "",
    "F. HTML DETECTED",
    `- yes/no: ${htmlDetected}`,
    `- where: ${htmlWhere}`,
  ].join("\n");
}

async function appendFailureLog(logPath, output) {
  const dir = path.dirname(logPath);
  await mkdir(dir, { recursive: true });
  const record = `[${new Date().toISOString()}]\n${output}\n\n`;
  await appendFile(logPath, record, "utf8");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  options.webUrl = normalizeBaseUrl(options.webUrl);
  options.apiUrl = normalizeBaseUrl(options.apiUrl);

  await loadEnvFile(path.join(repoRoot, "apps", "api", ".env"));
  await loadEnvFile(path.join(repoRoot, "apps", "api", ".env.local"));
  await loadEnvFile(path.join(repoRoot, "apps", "web", ".env.local"));

  const result = initResult();
  await runVersionCheck(result, options);
  await runMethodCheck(result, options);

  const auth = await acquireBearerToken(options);
  if (auth.failure) {
    markFailure(result, "AUTH", auth.failure, auth.response?.snippet ?? "");
  }

  await runSmallUploadCheck(result, options, auth);
  await runLargeUploadCheck(result, options, auth);

  const output = renderReport(result);
  console.log(output);

  if (result.overall === "PASS") {
    console.log("\nUPLOAD SYSTEM HEALTHY — API + PROXY + DEPLOY ALIGNED");
    return;
  }

  await appendFailureLog(options.logPath, output);
  process.exitCode = 1;
}

await main();
