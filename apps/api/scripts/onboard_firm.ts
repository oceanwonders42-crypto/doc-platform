#!/usr/bin/env node
import "dotenv/config";

import { bootstrapFirmOnboarding } from "../src/services/firmOnboarding";
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

function requireArg(args: Record<string, string>, key: string, label: string): string {
  const value = args[key]?.trim();
  if (!value) {
    throw new Error(`${label} is required (--${key})`);
  }
  return value;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const name = requireArg(args, "name", "Firm name");
  const adminEmail = requireArg(args, "admin-email", "Admin email");
  const adminPassword = requireArg(args, "admin-password", "Admin password");
  const plan = args["plan"]?.trim() || undefined;
  const apiKeyName = args["api-key-name"]?.trim() || "Primary ingest key";

  const result = await bootstrapFirmOnboarding({
    name,
    plan,
    adminEmail,
    adminPassword,
    apiKeyName,
  });

  console.log(JSON.stringify({
    ok: true,
    firm: result.firm,
    adminUser: result.user,
    apiKey: {
      id: result.apiKey.id,
      keyPrefix: result.apiKey.keyPrefix,
      scopes: result.apiKey.scopes,
      plaintext: result.apiKey.apiKey,
    },
    verification: {
      loginEmail: result.user.email,
      uploadReady: true,
      storagePrefixExample: `${result.firm.id}/_unrouted/<documentId>/`,
      routingRuleReady: true,
    },
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
