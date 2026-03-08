#!/usr/bin/env node
/**
 * Bootstrap dev: run Prisma migrations if DATABASE_URL is set, then print next steps.
 */
import "dotenv/config";
import { spawn } from "child_process";
import path from "path";

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
  const code = await run("pnpm", ["exec", "prisma", "migrate", "deploy"]);
  if (code !== 0) {
    console.log("\nMigration failed. Try: pnpm exec prisma migrate dev");
    process.exit(1);
  }

  console.log("\n--- Next steps ---");
  console.log("1. Start API:  cd apps/api && pnpm dev");
  console.log("2. (Optional) Create firm + API key: POST /dev/create-firm, POST /dev/create-api-key/:firmId");
  console.log("3. Set DOC_API_KEY in apps/api/.env");
  console.log("4. Rerun tests: cd apps/api && pnpm run test:system");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
