#!/usr/bin/env node
/**
 * Database integrity check: valid firmId, routed docs have caseId, audit refs, etc.
 * Checks table existence before querying optional tables; SKIP with message if missing.
 * Hard-fail only for core tables (Document, Firm) or missing DATABASE_URL.
 */
import "dotenv/config";

async function run(): Promise<{ warnings: { check: string; message: string; count?: number }[]; pass: boolean; coreFailed: boolean; skipped: string[] }> {
  const warnings: { check: string; message: string; count?: number }[] = [];
  const skipped: string[] = [];

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl || databaseUrl.trim() === "") {
    console.log("FAIL  DATABASE_URL not set. Add to apps/api/.env (e.g. postgresql://user:pass@localhost:5432/dbname)");
    return { warnings, pass: false, coreFailed: true, skipped: [] };
  }

  let prisma: import("@prisma/client").PrismaClient;
  let pgPool: import("pg").Pool;
  try {
    const prismaMod = await import("../src/db/prisma");
    const pgMod = await import("../src/db/pg");
    prisma = prismaMod.prisma;
    pgPool = pgMod.pgPool;
  } catch (e: unknown) {
    console.log("FAIL  Could not connect to database: " + (e instanceof Error ? e.message : String(e)));
    return { warnings, pass: false, coreFailed: true, skipped: [] };
  }

  async function tableExists(tableName: string): Promise<boolean> {
    try {
      const r = await pgPool.query<{ exists: boolean }>(
        `select (to_regclass($1) is not null) as exists`,
        [`public."${tableName}"`]
      );
      return r.rows[0]?.exists === true;
    } catch {
      return false;
    }
  }

  // Core tables required for app
  const documentExists = await tableExists("Document");
  const firmExists = await tableExists("Firm");

  if (!documentExists || !firmExists) {
    console.log(
      "FAIL  Core table missing (Document or Firm). Run: cd apps/api && pnpm exec prisma migrate dev"
    );
    return { warnings, pass: false, coreFailed: true, skipped: [] };
  }

  // 1) No documents exist without firmId
  try {
    const docsNoFirm = await prisma.document.count({
      where: { firmId: "" },
    });
    if (docsNoFirm > 0) {
      warnings.push({
        check: "documents_without_firmId",
        message: "Documents exist with empty firmId",
        count: docsNoFirm,
      });
    }
  } catch (e: any) {
    warnings.push({
      check: "documents_without_firmId",
      message: "Query failed: " + (e?.message || String(e)),
    });
  }

  // 2) Routed documents have routedCaseId
  try {
    const routedNoCase = await prisma.document.count({
      where: {
        status: "UPLOADED",
        routedSystem: { not: null },
        routedCaseId: null,
      },
    });
    if (routedNoCase > 0) {
      warnings.push({
        check: "routed_docs_missing_caseId",
        message: "Documents marked as routed have no routedCaseId",
        count: routedNoCase,
      });
    }
  } catch (e: any) {
    warnings.push({
      check: "routed_docs_missing_caseId",
      message: "Query failed: " + (e?.message || String(e)),
    });
  }

  // Optional: DocumentAuditEvent
  const auditEventExists = await tableExists("DocumentAuditEvent");
  if (!auditEventExists) {
    skipped.push("DocumentAuditEvent");
    console.log('SKIP  DocumentAuditEvent missing (run prisma migrate dev/deploy)');
  } else {
    try {
      const { rows: orphanAudit } = await pgPool.query(
        `
        select e.id, e."documentId"
        from "DocumentAuditEvent" e
        left join "Document" d on d.id = e."documentId"
        where d.id is null
        limit 100
        `
      );
      if (orphanAudit.length > 0) {
        warnings.push({
          check: "audit_events_orphan_document",
          message: "Audit events reference non-existent documents",
          count: orphanAudit.length,
        });
      }
    } catch (e: any) {
      warnings.push({
        check: "audit_events_orphan_document",
        message: "Query failed: " + (e?.message || String(e)),
      });
    }
  }

  // Optional: Provider
  const providerExists = await tableExists("Provider");
  if (!providerExists) {
    skipped.push("Provider");
    console.log('SKIP  Provider missing (run prisma migrate dev/deploy)');
  }

  // Optional: document_recognition (OCR/classification persistence; created by migration 20260304500000)
  const recognitionExists = await tableExists("document_recognition");
  if (!recognitionExists) {
    skipped.push("document_recognition");
    console.log('SKIP  document_recognition missing — run: pnpm exec prisma migrate deploy');
  }

  // Optional: RecordsRequest
  const recordsRequestExists = await tableExists("RecordsRequest");
  if (!recordsRequestExists) {
    skipped.push("RecordsRequest");
    console.log('SKIP  RecordsRequest missing (run prisma migrate dev/deploy)');
  } else {
    try {
      const rrNoCase = await prisma.recordsRequest.count({
        where: { caseId: "" },
      });
      if (rrNoCase > 0) {
        warnings.push({
          check: "records_requests_empty_caseId",
          message: "Records requests exist with empty caseId",
          count: rrNoCase,
        });
      }
    } catch (e: any) {
      warnings.push({
        check: "records_requests_empty_caseId",
        message: "Query failed: " + (e?.message || String(e)),
      });
    }
  }

  for (const w of warnings) {
    console.log(
      `WARN  [${w.check}] ${w.message}${w.count != null ? ` (count=${w.count})` : ""}`
    );
  }
  if (warnings.length === 0 && skipped.length === 0) {
    console.log("PASS  DB integrity — no inconsistencies found");
  } else if (warnings.length === 0) {
    console.log("PASS  DB integrity — core checks passed (some optional tables skipped)");
  }
  return {
    warnings,
    pass: warnings.length === 0,
    coreFailed: false,
    skipped,
  };
}

run()
  .then(({ pass, coreFailed }) => process.exit(coreFailed || !pass ? 1 : 0))
  .catch((err) => {
    console.error("DB integrity check error:", err);
    process.exit(1);
  });
