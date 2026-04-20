import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

import { printFail, printPass, repoRoot } from "./deploy-lib.mjs";

const apiRequire = createRequire(path.join(repoRoot, "apps", "api", "package.json"));
const jwt = apiRequire("jsonwebtoken");
const { Client } = apiRequire("pg");

function printUsage() {
  console.log("Usage: node scripts/deploy-smoke.mjs [--base-url <url>]");
}

function parseArgs(rawArgs) {
  let baseUrl = "http://127.0.0.1:4000";

  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];
    if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    }
    if (arg === "--base-url") {
      baseUrl = rawArgs[index + 1] ?? baseUrl;
      index += 1;
    }
  }

  return { baseUrl };
}

async function loadEnvFile(filePath) {
  let raw;
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

async function fetchJson(url, init = {}) {
  const started = Date.now();
  const response = await fetch(url, init);
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return {
    status: response.status,
    elapsedMs: Date.now() - started,
    body,
  };
}

function buildSmokePdf() {
  return Buffer.from(
    "%PDF-1.4\n" +
      "1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n" +
      "2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj\n" +
      "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 144]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n" +
      "4 0 obj<</Length 87>>stream\n" +
      "BT /F1 18 Tf 36 96 Td (Deploy smoke upload route approve) Tj ET\n" +
      "endstream\n" +
      "endobj\n" +
      "5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\n" +
      "xref\n" +
      "0 6\n" +
      "0000000000 65535 f \n" +
      "0000000010 00000 n \n" +
      "0000000053 00000 n \n" +
      "0000000110 00000 n \n" +
      "0000000217 00000 n \n" +
      "0000000355 00000 n \n" +
      "trailer<</Root 1 0 R/Size 6>>\n" +
      "startxref\n" +
      "425\n" +
      "%%EOF"
  );
}

async function main() {
  const { baseUrl } = parseArgs(process.argv.slice(2));
  await loadEnvFile(path.join(repoRoot, "apps", "api", ".env"));
  await loadEnvFile(path.join(repoRoot, "apps", "api", ".env.local"));

  const databaseUrl = process.env.DATABASE_URL?.trim();
  const jwtSecret = resolveJwtSecret();

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is missing; cannot run deploy smoke");
  }
  if (!jwtSecret) {
    throw new Error("JWT/SESSION/API secret is missing; cannot sign deploy smoke token");
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    const candidateQuery = await client.query(
      `
      select
        u.id as "userId",
        u."firmId" as "firmId",
        u.email,
        u.role,
        c.id as "caseId"
      from "User" u
      join "Case" c on c."firmId" = u."firmId"
      where u.role in ('PLATFORM_ADMIN', 'FIRM_ADMIN', 'STAFF', 'PARALEGAL')
      order by
        case
          when u.role = 'PLATFORM_ADMIN' then 0
          when u.role = 'FIRM_ADMIN' then 1
          else 2
        end,
        u."createdAt" asc,
        c."createdAt" asc
      limit 1
      `
    );

    const candidate = candidateQuery.rows[0];
    if (!candidate) {
      throw new Error("No user/case pair was available for deploy smoke");
    }

    const token = jwt.sign(
      {
        userId: candidate.userId,
        firmId: candidate.firmId,
        role: candidate.role,
        email: candidate.email ?? "",
      },
      jwtSecret,
      { algorithm: "HS256", expiresIn: "15m" }
    );

    const form = new FormData();
    form.append("file", new Blob([buildSmokePdf()], { type: "application/pdf" }), "deploy-smoke.pdf");

    const upload = await fetchJson(`${baseUrl}/cases/${encodeURIComponent(candidate.caseId)}/documents/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });

    if (upload.status !== 201 || !upload.body?.documentId) {
      throw new Error(`upload failed (${upload.status}): ${JSON.stringify(upload.body)}`);
    }

    const documentId = String(upload.body.documentId);
    const documentRow = await client.query(
      `
      select id, "spacesKey", "routedCaseId", status, "processingStage"
      from "Document"
      where id = $1
      `,
      [documentId]
    );

    const persisted = documentRow.rows[0];
    if (!persisted?.spacesKey) {
      throw new Error(`upload persisted without spacesKey for ${documentId}`);
    }
    if (persisted.routedCaseId !== candidate.caseId) {
      throw new Error(
        `upload persisted routedCaseId ${persisted.routedCaseId ?? "null"} instead of ${candidate.caseId}`
      );
    }

    const route = await fetchJson(`${baseUrl}/documents/${encodeURIComponent(documentId)}/route`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ caseId: candidate.caseId }),
    });

    if (route.status !== 200) {
      throw new Error(`route failed (${route.status}): ${JSON.stringify(route.body)}`);
    }

    const approve = await fetchJson(`${baseUrl}/documents/${encodeURIComponent(documentId)}/approve`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });

    if (approve.status !== 200) {
      throw new Error(`approve failed (${approve.status}): ${JSON.stringify(approve.body)}`);
    }

    printPass(
      `deploy smoke passed (upload=${upload.elapsedMs}ms, route=${route.elapsedMs}ms, approve=${approve.elapsedMs}ms, documentId=${documentId})`
    );
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  printFail(
    error instanceof Error ? error.message : String(error),
    "Fix the runtime before marking this deploy successful."
  );
  process.exit(1);
});
