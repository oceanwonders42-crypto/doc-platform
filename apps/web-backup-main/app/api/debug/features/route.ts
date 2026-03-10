import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

const EXPECTED_MODELS = [
  "Firm",
  "User",
  "ApiKey",
  "Document",
  "RoutingRule",
  "DocumentAuditEvent",
  "UsageMonthly",
  "Provider",
  "RecordsRequest",
  "LegalCase",
  "CaseTimelineEvent",
  "Notification",
  "SystemErrorLog",
];

export async function GET() {
  const notes: string[] = [];
  const cwd = process.cwd();

  // 1) Detect key routes/pages exist
  const appDir = path.join(cwd, "app");
  const webChecks: Record<string, boolean> = {
    dashboard: existsSync(path.join(appDir, "dashboard", "page.tsx")),
    mailboxes: existsSync(path.join(appDir, "mailboxes", "page.tsx")),
    providers: existsSync(path.join(appDir, "providers", "page.tsx")),
    cases: existsSync(path.join(appDir, "cases", "[id]", "page.tsx")),
    documents: existsSync(path.join(appDir, "documents", "[id]", "page.tsx")),
    admin: existsSync(path.join(appDir, "admin", "debug", "page.tsx")),
  };

  // 2) Read Prisma schema and detect models
  const dbChecks: Record<string, boolean> = {};
  for (const model of EXPECTED_MODELS) {
    dbChecks[model] = false;
  }

  const schemaPaths = [
    path.join(cwd, "..", "api", "prisma", "schema.prisma"),
    path.join(cwd, "..", "..", "apps", "api", "prisma", "schema.prisma"),
    path.join(cwd, "apps", "api", "prisma", "schema.prisma"),
  ];

  let schemaContent: string | null = null;
  for (const schemaPath of schemaPaths) {
    try {
      schemaContent = await readFile(schemaPath, "utf-8");
      break;
    } catch {
      continue;
    }
  }

  if (schemaContent) {
    const modelRegex = /^model\s+(\w+)\s*\{/gm;
    const foundModels = new Set<string>();
    let m;
    while ((m = modelRegex.exec(schemaContent)) !== null) {
      foundModels.add(m[1]);
    }
    for (const model of EXPECTED_MODELS) {
      dbChecks[model] = foundModels.has(model);
    }
  } else {
    notes.push("Prisma schema not found at expected paths");
  }

  return NextResponse.json({
    ok: true,
    web: webChecks,
    db: dbChecks,
    notes,
  });
}
