#!/usr/bin/env node
/**
 * Bootstrap dev: run Prisma migrations, then seed local demo rows and matching MinIO objects.
 */
import "dotenv/config";
import { spawn } from "child_process";

const root = process.cwd();

function run(cmd: string, args: string[]): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd: root, stdio: "inherit", shell: true });
    child.on("close", (code) => resolve(code ?? 0));
    child.on("error", () => resolve(1));
  });
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    console.log("DATABASE_URL not set. Add it to apps/api/.env, then run again:");
    console.log("  pnpm run bootstrap:dev");
    process.exit(1);
  }

  console.log("Running Prisma migrations (deploy)...\n");
  const migrateCode = await run("pnpm", ["exec", "prisma", "migrate", "deploy"]);
  if (migrateCode !== 0) {
    console.log("\nMigration failed. Try: pnpm exec prisma migrate dev");
    process.exit(1);
  }

  console.log("\nSeeding local demo data and storage objects...\n");
  const seedCode = await run("pnpm", ["run", "seed:demo"]);
  if (seedCode !== 0) {
    console.log("\nDemo seed failed. Ensure local MinIO/S3 env vars are set and storage is reachable.");
    process.exit(1);
  }

  console.log("\n--- Next steps ---");
  console.log("1. Start API:  cd apps/api && pnpm dev");
  console.log("2. Use demo login: demo@example.com / demo");
  console.log("3. Open demo-case-1 in the dashboard and verify packet export contents");
  console.log("4. Rerun tests: cd apps/api && pnpm run test:system");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
