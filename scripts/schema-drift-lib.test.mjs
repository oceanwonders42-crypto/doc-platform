import assert from "node:assert/strict";

import { criticalSchemaInvariants, evaluateSchemaDrift } from "./schema-drift-lib.mjs";

async function main() {
  const passResult = evaluateSchemaDrift({
    invariants: criticalSchemaInvariants,
    appliedMigrationNames: criticalSchemaInvariants.map((invariant) => invariant.migrationName),
    existingColumns: criticalSchemaInvariants.flatMap((invariant) =>
      invariant.columns.map((column_name) => ({
        table_name: invariant.table,
        column_name,
      }))
    ),
  });

  assert.equal(passResult.ok, true);
  assert.equal(passResult.status, "PASS");
  assert.equal(passResult.checks.length, criticalSchemaInvariants.length);
  for (const check of passResult.checks) {
    assert.equal(check.status, "PASS");
    assert.deepEqual(check.missingColumns, []);
  }

  const mailboxInvariant = criticalSchemaInvariants.find((invariant) => invariant.key === "mailbox_connections_runtime");
  assert.ok(mailboxInvariant, "Expected mailbox_connections_runtime invariant to exist.");
  const failResult = evaluateSchemaDrift({
    invariants: criticalSchemaInvariants,
    appliedMigrationNames: criticalSchemaInvariants.map((invariant) => invariant.migrationName),
    existingColumns: criticalSchemaInvariants.flatMap((invariant) =>
      invariant.columns
        .filter(
          (column_name) =>
            !(
              invariant.key === "mailbox_connections_runtime" &&
              ["last_sync_at", "last_error"].includes(column_name)
            )
        )
        .map((column_name) => ({
          table_name: invariant.table,
          column_name,
        }))
    ),
  });

  assert.equal(failResult.ok, false);
  assert.equal(failResult.status, "FAIL");
  const failedMailboxCheck = failResult.checks.find((check) => check.key === "mailbox_connections_runtime");
  assert.ok(failedMailboxCheck, "Expected mailbox_connections_runtime to fail when columns are missing.");
  assert.equal(failedMailboxCheck.status, "FAIL");
  assert.equal(failedMailboxCheck.issueCode, "MIGRATION_RECORDED_SCHEMA_MISSING");
  assert.deepEqual(failedMailboxCheck.missingColumns, ["last_sync_at", "last_error"]);
  assert.ok(
    failResult.failures.some((entry) =>
      entry.includes("migration 20260309000000_mailbox_email_tables is recorded as applied") &&
      entry.includes("table mailbox_connections") &&
      entry.includes("last_sync_at, last_error")
    )
  );

  console.log("Schema drift evaluation checks passed", {
    invariantCount: criticalSchemaInvariants.length,
    passStatus: passResult.status,
    failStatus: failResult.status,
    failIssueCode: failedMailboxCheck.issueCode,
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
