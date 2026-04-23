import { printFail, printPass } from "./deploy-lib.mjs";
import { runSchemaDriftCheck } from "./schema-drift-lib.mjs";

const result = await runSchemaDriftCheck();

if (result.ok) {
  printPass(`schema drift check passed (${result.checks.length} invariant group${result.checks.length === 1 ? "" : "s"})`);
  for (const check of result.checks) {
    printPass(`${check.table}: required columns present (${check.requiredColumns.join(", ")})`);
  }
  process.exit(0);
}

for (const failure of result.failures) {
  printFail(failure, "Repair the missing schema invariant, then rerun node scripts/check-schema-drift.mjs.");
}

for (const check of result.checks) {
  if (check.status === "FAIL") {
    printFail(
      `${check.table}: migration ${check.migrationName ?? "unknown"} missing ${check.missingColumns.join(", ")}`,
      check.migrationRecorded
        ? `Migration ${check.migrationName} is already recorded as applied; verify the physical schema on the target database.`
        : "Verify the target database is using the expected migrations and schema."
    );
  }
}

process.exit(1);
