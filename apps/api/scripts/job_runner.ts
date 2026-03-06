#!/usr/bin/env node
/**
 * Job runner: processes Job table with exponential backoff.
 * Run: pnpm job:runner
 */
import "dotenv/config";
import { runJobLoop } from "../src/services/jobRunner";

async function main() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    console.error("DATABASE_URL not set. Add to apps/api/.env");
    process.exit(1);
  }

  console.log("[job-runner] Started. Polling for jobs...");
  await runJobLoop(2000);
}

main().catch((e) => {
  console.error("[job-runner] Fatal error:", e);
  process.exit(1);
});
