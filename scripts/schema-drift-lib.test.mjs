import assert from "node:assert/strict";

import { evaluateSchemaDrift } from "./schema-drift-lib.mjs";

async function main() {
  const passResult = evaluateSchemaDrift({
    invariants: [
      {
        key: "email_messages_fax_client",
        migrationName: "20260325000000_email_messages_fax_client",
        table: "email_messages",
        columns: ["is_fax", "client_name_extracted"],
      },
    ],
    appliedMigrationNames: ["20260325000000_email_messages_fax_client"],
    existingColumns: [
      { table_name: "email_messages", column_name: "is_fax" },
      { table_name: "email_messages", column_name: "client_name_extracted" },
    ],
  });

  assert.equal(passResult.ok, true);
  assert.equal(passResult.status, "PASS");
  assert.equal(passResult.checks[0].status, "PASS");
  assert.deepEqual(passResult.checks[0].missingColumns, []);

  const failResult = evaluateSchemaDrift({
    invariants: [
      {
        key: "email_messages_fax_client",
        migrationName: "20260325000000_email_messages_fax_client",
        table: "email_messages",
        columns: ["is_fax", "client_name_extracted"],
      },
    ],
    appliedMigrationNames: ["20260325000000_email_messages_fax_client"],
    existingColumns: [{ table_name: "email_messages", column_name: "is_fax" }],
  });

  assert.equal(failResult.ok, false);
  assert.equal(failResult.status, "FAIL");
  assert.equal(failResult.checks[0].status, "FAIL");
  assert.equal(failResult.checks[0].issueCode, "MIGRATION_RECORDED_SCHEMA_MISSING");
  assert.deepEqual(failResult.checks[0].missingColumns, ["client_name_extracted"]);
  assert.ok(
    failResult.failures.some((entry) =>
      entry.includes("migration 20260325000000_email_messages_fax_client is recorded as applied")
    )
  );

  console.log("Schema drift evaluation checks passed", {
    passStatus: passResult.status,
    failStatus: failResult.status,
    failIssueCode: failResult.checks[0].issueCode,
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
