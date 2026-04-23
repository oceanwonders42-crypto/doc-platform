import path from "node:path";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

import { readString, repoRoot } from "./deploy-lib.mjs";

export const criticalSchemaInvariants = [
  {
    key: "email_messages_fax_client",
    migrationName: "20260325000000_email_messages_fax_client",
    table: "email_messages",
    columns: ["is_fax", "client_name_extracted"],
  },
];

const apiEnvFiles = [path.join(repoRoot, "apps", "api", ".env"), path.join(repoRoot, "apps", "api", ".env.local")];

export function parseEnvLine(line) {
  const trimmed = String(line ?? "").trim();
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

export async function loadApiRuntimeEnv() {
  const fileValues = {};
  const filesLoaded = [];

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

export function getSchemaDriftDatabaseUrl(runtimeEnv) {
  return readString(runtimeEnv?.env?.DATABASE_URL);
}

export function evaluateSchemaDrift({
  invariants = criticalSchemaInvariants,
  appliedMigrationNames = [],
  existingColumns = [],
} = {}) {
  const appliedSet = new Set(
    (Array.isArray(appliedMigrationNames) ? appliedMigrationNames : [])
      .map((value) => readString(value))
      .filter(Boolean)
  );

  const existingSet = new Set(
    (Array.isArray(existingColumns) ? existingColumns : [])
      .map((entry) => {
        const tableName = readString(entry?.tableName ?? entry?.table_name ?? entry?.table);
        const columnName = readString(entry?.columnName ?? entry?.column_name ?? entry?.column);
        if (!tableName || !columnName) return null;
        return `${tableName}.${columnName}`;
      })
      .filter(Boolean)
  );

  const checks = invariants.map((invariant) => {
    const missingColumns = invariant.columns.filter((columnName) => !existingSet.has(`${invariant.table}.${columnName}`));
    const migrationRecorded = invariant.migrationName ? appliedSet.has(invariant.migrationName) : null;
    const ok = missingColumns.length === 0;

    return {
      key: invariant.key,
      table: invariant.table,
      requiredColumns: [...invariant.columns],
      missingColumns,
      migrationName: invariant.migrationName ?? null,
      migrationRecorded,
      status: ok ? "PASS" : "FAIL",
      issueCode: ok
        ? null
        : migrationRecorded
          ? "MIGRATION_RECORDED_SCHEMA_MISSING"
          : "SCHEMA_MISSING",
    };
  });

  const failures = checks
    .filter((check) => check.status === "FAIL")
    .map((check) => {
      const qualifiedColumns = check.missingColumns.map((columnName) => `${check.table}.${columnName}`).join(", ");
      if (check.migrationRecorded) {
        return `migration ${check.migrationName} is recorded as applied but missing ${qualifiedColumns}`;
      }
      return `required schema columns are missing: ${qualifiedColumns}`;
    });

  return {
    ok: failures.length === 0,
    status: failures.length === 0 ? "PASS" : "FAIL",
    checks,
    failures,
  };
}

function createApiRequire() {
  return createRequire(path.join(repoRoot, "apps", "api", "package.json"));
}

function buildPgClient(databaseUrl) {
  const apiRequire = createApiRequire();
  const { Client } = apiRequire("pg");
  return new Client({ connectionString: databaseUrl });
}

async function fetchAppliedMigrationNames(client, migrationNames) {
  const filtered = migrationNames.map((value) => readString(value)).filter(Boolean);
  if (filtered.length === 0) return [];

  const result = await client.query(
    `
      select migration_name
      from "_prisma_migrations"
      where finished_at is not null
        and migration_name = any($1::text[])
    `,
    [filtered]
  );

  return result.rows.map((row) => row.migration_name).filter(Boolean);
}

async function fetchExistingColumns(client, invariants) {
  const tableNames = [...new Set(invariants.map((invariant) => invariant.table).filter(Boolean))];
  if (tableNames.length === 0) return [];

  const result = await client.query(
    `
      select table_name, column_name
      from information_schema.columns
      where table_schema = 'public'
        and table_name = any($1::text[])
    `,
    [tableNames]
  );

  return result.rows;
}

export async function runSchemaDriftCheck(options = {}) {
  const invariants = Array.isArray(options.invariants) && options.invariants.length > 0
    ? options.invariants
    : criticalSchemaInvariants;
  const runtimeEnv = options.runtimeEnv ?? (await loadApiRuntimeEnv());
  const databaseUrl = options.databaseUrl ?? getSchemaDriftDatabaseUrl(runtimeEnv);

  if (!databaseUrl) {
    return {
      ok: false,
      status: "FAIL",
      checkedAt: new Date().toISOString(),
      filesLoaded: runtimeEnv.filesLoaded ?? [],
      checks: [],
      failures: ["DATABASE_URL is missing; schema drift cannot be checked."],
    };
  }

  const client = buildPgClient(databaseUrl);
  try {
    await client.connect();
    const [appliedMigrationNames, existingColumns] = await Promise.all([
      fetchAppliedMigrationNames(
        client,
        invariants.map((invariant) => invariant.migrationName).filter(Boolean)
      ),
      fetchExistingColumns(client, invariants),
    ]);

    const evaluation = evaluateSchemaDrift({
      invariants,
      appliedMigrationNames,
      existingColumns,
    });

    return {
      ...evaluation,
      checkedAt: new Date().toISOString(),
      filesLoaded: runtimeEnv.filesLoaded ?? [],
    };
  } catch (error) {
    return {
      ok: false,
      status: "FAIL",
      checkedAt: new Date().toISOString(),
      filesLoaded: runtimeEnv.filesLoaded ?? [],
      checks: [],
      failures: [
        `schema drift check failed: ${error instanceof Error ? error.message : String(error)}`,
      ],
    };
  } finally {
    await client.end().catch(() => {});
  }
}
