#!/usr/bin/env node
import "dotenv/config";

import {
  inspectFirmBootstrapRemoval,
  removeFirmBootstrapArtifacts,
} from "../src/services/firmOnboarding";
import { prisma } from "../src/db/prisma";

function parseArgs(argv: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (!current.startsWith("--")) {
      continue;
    }
    const key = current.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      result[key] = "true";
      continue;
    }
    result[key] = next;
    index += 1;
  }
  return result;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const firmId = args["firm-id"]?.trim();
  if (!firmId) {
    throw new Error("Firm id is required (--firm-id)");
  }

  const dryRun = args["dry-run"] === "true";
  const inspection = await inspectFirmBootstrapRemoval(firmId);
  if (!inspection.firm) {
    throw new Error("Firm not found");
  }

  if (dryRun || !inspection.safeToRemove) {
    console.log(JSON.stringify({
      ok: inspection.safeToRemove,
      dryRun,
      firm: inspection.firm,
      safeToRemove: inspection.safeToRemove,
      counts: inspection.counts,
      blockers: inspection.blockingCounts,
    }, null, 2));
    if (!inspection.safeToRemove) {
      process.exitCode = 1;
    }
    return;
  }

  const removed = await removeFirmBootstrapArtifacts(firmId);
  console.log(JSON.stringify({
    ok: true,
    removedFirm: removed.firm,
    countsBeforeRemoval: removed.counts,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(String((error as Error)?.message ?? error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => {});
  });
