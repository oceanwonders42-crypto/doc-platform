#!/usr/bin/env node
/**
 * Seed demo data for dev/testing. Idempotent: safe to rerun (replaces demo firm data).
 * Creates: 1 firm, 5 case ids, 10 documents (mixed statuses), 3 providers, 2 records requests, 20 audit events.
 */
import "dotenv/config";
import { prisma } from "../src/db/prisma";
import { pgPool } from "../src/db/pg";

const DEMO_FIRM_NAME = "Demo Firm";
const CASE_IDS = ["demo-case-1", "demo-case-2", "demo-case-3", "demo-case-4", "demo-case-5"];

async function main() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    console.error("DATABASE_URL not set. Add to apps/api/.env");
    process.exit(1);
  }

  let firm = await prisma.firm.findFirst({ where: { name: DEMO_FIRM_NAME } });
  if (!firm) {
    firm = await prisma.firm.create({ data: { name: DEMO_FIRM_NAME } });
    console.log("Created firm:", firm.id);
  } else {
    console.log("Using existing demo firm:", firm.id);
    const docIds = await prisma.document.findMany({ where: { firmId: firm.id }, select: { id: true } }).then((d) => d.map((x) => x.id));
    if (docIds.length > 0) {
      await prisma.documentAuditEvent.deleteMany({ where: { documentId: { in: docIds } } });
      await prisma.document.deleteMany({ where: { firmId: firm.id } });
    }
    await prisma.recordsRequest.deleteMany({ where: { firmId: firm.id } });
  }

  const firmId = firm.id;

  const providers = await ensureProviders();
  const docIds: string[] = [];
  const now = new Date();

  const documentData = [
    { status: "UPLOADED" as const, routedCaseId: CASE_IDS[0], routedSystem: "manual", confidence: 0.95, caseNumber: CASE_IDS[0], clientName: "Alice Smith" },
    { status: "UPLOADED" as const, routedCaseId: CASE_IDS[1], routedSystem: "manual", confidence: 0.88, caseNumber: CASE_IDS[1], clientName: "Bob Jones" },
    { status: "NEEDS_REVIEW" as const, routedCaseId: null, routedSystem: null, confidence: 0.92, caseNumber: CASE_IDS[2], clientName: "Carol Lee" },
    { status: "NEEDS_REVIEW" as const, routedCaseId: null, routedSystem: null, confidence: 0.75, caseNumber: CASE_IDS[3], clientName: "Dan Brown" },
    { status: "NEEDS_REVIEW" as const, routedCaseId: null, routedSystem: null, confidence: 0.65, caseNumber: null, clientName: null },
    { status: "NEEDS_REVIEW" as const, routedCaseId: null, routedSystem: null, confidence: null, caseNumber: null, clientName: null },
    { status: "NEEDS_REVIEW" as const, routedCaseId: null, routedSystem: null, confidence: 0.80, caseNumber: CASE_IDS[4], clientName: "Eve Wilson" },
    { status: "UPLOADED" as const, routedCaseId: CASE_IDS[2], routedSystem: "manual", confidence: 0.90, caseNumber: CASE_IDS[2], clientName: "Frank Doe" },
    { status: "NEEDS_REVIEW" as const, routedCaseId: null, routedSystem: null, confidence: null, caseNumber: null, clientName: null },
    { status: "NEEDS_REVIEW" as const, routedCaseId: null, routedSystem: null, confidence: 0.70, caseNumber: null, clientName: "Grace Hill" },
  ];

  for (let i = 0; i < documentData.length; i++) {
    const d = documentData[i];
    const doc = await prisma.document.create({
      data: {
        firmId,
        source: "seed",
        spacesKey: `demo/seed-${i + 1}.pdf`,
        originalName: `demo-doc-${i + 1}.pdf`,
        mimeType: "application/pdf",
        pageCount: 1,
        status: d.status,
        routedCaseId: d.routedCaseId,
        routedSystem: d.routedSystem,
        confidence: d.confidence,
        extractedFields: d.caseNumber || d.clientName ? { caseNumber: d.caseNumber, clientName: d.clientName } : null,
        processedAt: d.status === "UPLOADED" ? now : null,
      },
    });
    docIds.push(doc.id);
    if (d.caseNumber || d.clientName) {
      try {
        await pgPool.query(
          `insert into document_recognition (document_id, case_number, client_name, confidence, updated_at)
           values ($1, $2, $3, $4, now())
           on conflict (document_id) do update set case_number = $2, client_name = $3, confidence = $4, updated_at = now()`,
          [doc.id, d.caseNumber, d.clientName, d.confidence ?? 0.5]
        );
      } catch {
        // table may not exist; Document.extractedFields is enough for review queue
      }
    }
  }

  const auditActions: Array<{ documentIndex: number; action: string; fromCaseId: string | null; toCaseId: string | null }> = [
    { documentIndex: 0, action: "suggested", fromCaseId: null, toCaseId: null },
    { documentIndex: 0, action: "routed", fromCaseId: null, toCaseId: CASE_IDS[0] },
    { documentIndex: 1, action: "suggested", fromCaseId: null, toCaseId: null },
    { documentIndex: 1, action: "routed", fromCaseId: null, toCaseId: CASE_IDS[1] },
    { documentIndex: 2, action: "suggested", fromCaseId: null, toCaseId: null },
    { documentIndex: 3, action: "suggested", fromCaseId: null, toCaseId: null },
    { documentIndex: 3, action: "rejected", fromCaseId: null, toCaseId: null },
    { documentIndex: 4, action: "suggested", fromCaseId: null, toCaseId: null },
    { documentIndex: 5, action: "suggested", fromCaseId: null, toCaseId: null },
    { documentIndex: 5, action: "rejected", fromCaseId: null, toCaseId: null },
    { documentIndex: 6, action: "suggested", fromCaseId: null, toCaseId: null },
    { documentIndex: 7, action: "suggested", fromCaseId: null, toCaseId: null },
    { documentIndex: 7, action: "routed", fromCaseId: null, toCaseId: CASE_IDS[2] },
    { documentIndex: 8, action: "suggested", fromCaseId: null, toCaseId: null },
    { documentIndex: 8, action: "claimed", fromCaseId: null, toCaseId: null },
    { documentIndex: 9, action: "suggested", fromCaseId: null, toCaseId: null },
    { documentIndex: 0, action: "approved", fromCaseId: CASE_IDS[0], toCaseId: CASE_IDS[0] },
    { documentIndex: 2, action: "claimed", fromCaseId: null, toCaseId: null },
    { documentIndex: 2, action: "unclaimed", fromCaseId: null, toCaseId: null },
    { documentIndex: 4, action: "routed", fromCaseId: null, toCaseId: CASE_IDS[0] },
  ];

  for (const a of auditActions) {
    await prisma.documentAuditEvent.create({
      data: {
        firmId,
        documentId: docIds[a.documentIndex],
        actor: "demo-seed",
        action: a.action,
        fromCaseId: a.fromCaseId,
        toCaseId: a.toCaseId,
      },
    });
  }

  const prov1 = providers[0];
  const prov2 = providers[1];
  await prisma.recordsRequest.createMany({
    data: [
      { firmId, caseId: CASE_IDS[0], providerName: prov1.name, providerContact: `${prov1.address}\n${prov1.city}, ${prov1.state}`, status: "Draft" },
      { firmId, caseId: CASE_IDS[1], providerName: prov2.name, providerContact: `${prov2.address}\n${prov2.city}, ${prov2.state}`, status: "Sent" },
    ],
  });

  console.log("\nDemo data seeded.");
  console.log("Firm ID:    ", firmId);
  console.log("Case IDs:   ", CASE_IDS.slice(0, 3).join(", "), "...");
  console.log("Doc IDs:    ", docIds.slice(0, 3).join(", "), "...");
  console.log("Providers:  ", providers.length);
  console.log("Audit events: 20");
}

async function ensureProviders() {
  const names = ["Demo Provider A", "Demo Provider B", "Demo Provider C"];
  const existing = await prisma.provider.findMany({ where: { name: { in: names } } });
  const toCreate = names.filter((n) => !existing.some((p) => p.name === n));
  if (toCreate.length > 0) {
    await prisma.provider.createMany({
      data: toCreate.map((name, i) => ({
        name,
        address: `${100 + i} Demo St`,
        city: "Demo City",
        state: "CA",
        phone: "555-0100",
        email: `demo${i + 1}@example.com`,
        specialtiesJson: (i % 2 === 0 ? ["General"] : ["Specialty"]),
      })),
    });
  }
  return prisma.provider.findMany({ where: { name: { in: names } } });
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
