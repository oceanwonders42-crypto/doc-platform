#!/usr/bin/env node
/**
 * Retention cleanup: delete documents older than firm.retentionDays.
 * Run manually: pnpm cleanup:run
 * Can be scheduled as a nightly cron.
 */
import "dotenv/config";
import { runRetentionCleanup } from "../src/services/retentionCleanup";

async function main() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    console.error("DATABASE_URL not set. Add to apps/api/.env");
    process.exit(1);
  }

  console.log("[retention-cleanup] Starting...");
  const results = await runRetentionCleanup();
  let totalDeleted = 0;
  for (const r of results) {
    if (r.deleted > 0 || r.errors.length > 0) {
      console.log(`[retention-cleanup] ${r.firmName} (${r.firmId}): deleted ${r.deleted}`);
      if (r.errors.length > 0) {
        for (const err of r.errors) {
          console.error(`  Error: ${err}`);
        }
      }
      totalDeleted += r.deleted;
    }
  }
  console.log(`[retention-cleanup] Done. Total deleted: ${totalDeleted}`);
}

main().catch((e) => {
  console.error("[retention-cleanup] Fatal error:", e);
  process.exit(1);
});
