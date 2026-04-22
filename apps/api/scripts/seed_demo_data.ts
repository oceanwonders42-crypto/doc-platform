#!/usr/bin/env node
/**
 * Seed demo data for dev/testing. Idempotent: safe to rerun (replaces demo firm data).
 * Creates: 1 firm, 5 case ids, 10 documents (mixed statuses), 3 providers, 2 records requests, 20 audit events.
 */
import "dotenv/config";
import { prisma } from "../src/db/prisma";
import { pgPool } from "../src/db/pg";
import { ensureDemoSeedObjects } from "../src/dev/demoSeedObjects";
import { createFirmWithDefaults } from "../src/services/firmOnboarding";

const DEMO_FIRM_NAME = "Demo Firm";
const DEMO_USERS: { email: string; role: "PLATFORM_ADMIN" | "FIRM_ADMIN" | "PARALEGAL" | "STAFF" }[] = [
  { email: "owner@onyxintel.com", role: "PLATFORM_ADMIN" },
  { email: "admin@demo.com", role: "FIRM_ADMIN" },
  { email: "paralegal@demo.com", role: "PARALEGAL" },
  { email: "demo@example.com", role: "STAFF" },
];
const CASE_IDS = ["demo-case-1", "demo-case-2", "demo-case-3", "demo-case-4", "demo-case-5"];
const DEMO_CLIENT_NAMES = ["Alice Smith", "Bob Jones", "Carol Wilson", "Dan Brown", "Eve Wilson"];

function splitName(fullName: string): { firstName: string | null; lastName: string | null } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: null, lastName: null };
  if (parts.length === 1) return { firstName: null, lastName: parts[0] };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

function isLocalObjectStorageUnavailable(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code?: unknown }).code ?? "")
      : "";
  const nestedErrors =
    typeof error === "object" && error !== null && "errors" in error && Array.isArray((error as { errors?: unknown }).errors)
      ? ((error as { errors: unknown[] }).errors as unknown[])
      : [];

  return (
    code === "ECONNREFUSED" ||
    message.includes("ECONNREFUSED") ||
    message.includes("connect ECONNREFUSED") ||
    nestedErrors.some((nested) => isLocalObjectStorageUnavailable(nested))
  );
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    console.error("DATABASE_URL not set. Add to apps/api/.env");
    process.exit(1);
  }

  let firm = await prisma.firm.findFirst({ where: { name: DEMO_FIRM_NAME } });
  if (!firm) {
    const createdFirm = await createFirmWithDefaults({ name: DEMO_FIRM_NAME });
    firm = await prisma.firm.findUnique({ where: { id: createdFirm.id } });
    if (!firm) {
      throw new Error("Failed to load newly created demo firm");
    }
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

  // Ensure all demo users exist with correct roles (no passwordHash => password "demo" in non-production)
  for (const { email, role } of DEMO_USERS) {
    await prisma.user.upsert({
      where: { email },
      create: { email, firmId, role },
      update: { firmId, role },
    });
  }

  // Ensure LegalCase rows exist so /dashboard/cases and document routing work
  const caseTitles = ["Smith v. State Farm", "Jones Medical Records", "Wilson PI Claim", "Brown Insurance", "Demo Case 5"];
  for (let i = 0; i < CASE_IDS.length; i++) {
    const clientName = DEMO_CLIENT_NAMES[i];
    const { firstName, lastName } = splitName(clientName);
    const contactId = `demo-contact-${i + 1}`;
    await prisma.contact.upsert({
      where: { id: contactId },
      create: {
        id: contactId,
        firmId,
        firstName,
        lastName,
        fullName: clientName,
      },
      update: {
        firmId,
        firstName,
        lastName,
        fullName: clientName,
      },
    });
    await prisma.legalCase.upsert({
      where: { id: CASE_IDS[i] },
      create: {
        id: CASE_IDS[i],
        firmId,
        title: caseTitles[i],
        caseNumber: `DEMO-00${i + 1}`,
        clientName,
        clientContactId: contactId,
      },
      update: {
        firmId,
        title: caseTitles[i],
        caseNumber: `DEMO-00${i + 1}`,
        clientName,
        clientContactId: contactId,
      },
    });
  }

  const providers = await ensureProviders(firmId);
  const docIds: string[] = [];
  const now = new Date();

  const toSuggestedCaseId = (caseNumber: string | null): string | null =>
    caseNumber === "DEMO-001"
      ? CASE_IDS[0]
      : caseNumber === "DEMO-002"
        ? CASE_IDS[1]
        : caseNumber === "DEMO-003"
          ? CASE_IDS[2]
          : null;

  const documentData: Array<{
    status: "UPLOADED" | "NEEDS_REVIEW";
    routedCaseId: string | null;
    routedSystem: string | null;
    confidence: number | null;
    caseNumber: string | null;
    clientName: string | null;
    hasOffer: boolean;
    hasMatch: boolean;
  }> = [
    { status: "UPLOADED", routedCaseId: CASE_IDS[0], routedSystem: "manual", confidence: 0.95, caseNumber: "DEMO-001", clientName: "Alice Smith", hasOffer: true, hasMatch: false },
    { status: "UPLOADED", routedCaseId: CASE_IDS[1], routedSystem: "manual", confidence: 0.88, caseNumber: "DEMO-002", clientName: "Bob Jones", hasOffer: true, hasMatch: false },
    { status: "NEEDS_REVIEW", routedCaseId: null, routedSystem: null, confidence: 0.92, caseNumber: "DEMO-003", clientName: "Carol Wilson", hasOffer: false, hasMatch: true },
    { status: "NEEDS_REVIEW", routedCaseId: null, routedSystem: null, confidence: 0.75, caseNumber: "DEMO-001", clientName: "Alice Smith", hasOffer: false, hasMatch: true },
    { status: "NEEDS_REVIEW", routedCaseId: null, routedSystem: null, confidence: 0.65, caseNumber: null, clientName: null, hasOffer: false, hasMatch: false },
    { status: "UPLOADED", routedCaseId: CASE_IDS[2], routedSystem: "manual", confidence: 0.90, caseNumber: "DEMO-003", clientName: "Carol Wilson", hasOffer: true, hasMatch: false },
    { status: "NEEDS_REVIEW", routedCaseId: null, routedSystem: null, confidence: 0.80, caseNumber: "DEMO-002", clientName: "Bob Jones", hasOffer: false, hasMatch: true },
    { status: "UPLOADED", routedCaseId: CASE_IDS[0], routedSystem: "manual", confidence: 0.85, caseNumber: "DEMO-001", clientName: "Alice Smith", hasOffer: false, hasMatch: false },
    { status: "NEEDS_REVIEW", routedCaseId: null, routedSystem: null, confidence: 0.70, caseNumber: null, clientName: "Grace Hill", hasOffer: false, hasMatch: false },
    { status: "UPLOADED", routedCaseId: CASE_IDS[1], routedSystem: "manual", confidence: 0.92, caseNumber: "DEMO-002", clientName: "Bob Jones", hasOffer: false, hasMatch: false },
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

    try {
      const matchConfidence = d.hasMatch && d.caseNumber ? 0.85 : null;
      const matchReason = d.hasMatch && d.caseNumber ? "Case number match" : null;
      const insuranceFields = d.hasOffer ? JSON.stringify({ settlementOffer: 50000 }) : null;
      const suggestedCaseId = toSuggestedCaseId(d.caseNumber);
      await pgPool.query(
        `insert into document_recognition (document_id, case_number, client_name, suggested_case_id, confidence, match_confidence, match_reason, insurance_fields, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, now())
         on conflict (document_id) do update set
           case_number = excluded.case_number,
           client_name = excluded.client_name,
           suggested_case_id = excluded.suggested_case_id,
           confidence = excluded.confidence,
           match_confidence = excluded.match_confidence,
           match_reason = excluded.match_reason,
           insurance_fields = coalesce(excluded.insurance_fields, document_recognition.insurance_fields),
           updated_at = now()`,
        [doc.id, d.caseNumber ?? null, d.clientName ?? null, suggestedCaseId, d.confidence ?? 0.5, matchConfidence, matchReason, insuranceFields]
      );
    } catch {
      // table may not exist; Document.extractedFields is enough for review queue
    }
  }

  try {
    await ensureDemoSeedObjects(
      documentData.map((d, index) => ({
        spacesKey: `demo/seed-${index + 1}.pdf`,
        originalName: `demo-doc-${index + 1}.pdf`,
        caseNumber: d.caseNumber,
        clientName: d.clientName,
        routedCaseId: d.routedCaseId,
        status: d.status,
        hasOffer: d.hasOffer,
      }))
    );
  } catch (error) {
    if (process.env.NODE_ENV !== "production" && isLocalObjectStorageUnavailable(error)) {
      console.warn("Local object storage is unavailable; continuing demo seed without uploading demo PDFs.");
    } else {
      throw error;
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
      {
        firmId,
        caseId: CASE_IDS[0],
        providerName: prov1.name,
        providerContact: `${prov1.address}\n${prov1.city}, ${prov1.state}`,
        status: "DRAFT",
      },
      {
        firmId,
        caseId: CASE_IDS[1],
        providerName: prov2.name,
        providerContact: `${prov2.address}\n${prov2.city}, ${prov2.state}`,
        status: "SENT",
        sentAt: now,
        requestDate: now,
      },
    ],
  });

  // Traffic demo: one clean citation, one that needs review (for /dashboard/traffic)
  const trafficMatters = await prisma.trafficMatter.findMany({ where: { firmId }, select: { id: true } });
  if (trafficMatters.length === 0) {
    await prisma.trafficMatter.createMany({
      data: [
        {
          firmId,
          status: "NEW_CITATION",
          documentTypeOfOrigin: "citation",
          defendantName: "Jane Doe",
          citationNumber: "FL-2024-001234",
          statuteCodeRaw: "316.1925(1)",
          statuteCodeNormalized: "Fla. Stat. § 316.1925(1)",
          chargeDescriptionRaw: "Reckless driving",
          jurisdictionState: "FL",
          jurisdictionCounty: "Miami-Dade",
          courtName: "Miami-Dade County Court",
          courtType: "County",
          issueDate: new Date("2024-02-15"),
          dueDate: new Date("2024-03-20"),
          hearingDate: new Date("2024-03-25"),
          routingConfidence: 0.92,
          reviewRequired: false,
          extractionConfidenceJson: { citationNumber: 0.95, defendantName: 0.9, jurisdictionState: 0.85 },
        },
        {
          firmId,
          status: "REVIEW_REQUIRED",
          documentTypeOfOrigin: "traffic_hearing_notice",
          defendantName: "John Smith",
          citationNumber: null,
          statuteCodeRaw: "Sec. 46-102",
          statuteCodeNormalized: "Sec. 46-102",
          chargeDescriptionRaw: "Speeding",
          jurisdictionState: "FL",
          jurisdictionCounty: null,
          courtName: null,
          courtType: null,
          issueDate: null,
          dueDate: new Date("2024-04-01"),
          hearingDate: null,
          routingConfidence: 0.62,
          reviewRequired: true,
          extractionConfidenceJson: { defendantName: 0.7, dueDate: 0.8 },
        },
      ],
    });
    console.log("Created 2 demo traffic matters (clean + review-required).");
  }

  console.log("\nDemo data seeded.");
  console.log("Firm ID:    ", firmId);
  console.log("Demo logins (password: demo):");
  DEMO_USERS.forEach(({ email, role }) => console.log("  ", email, "→", role));
  console.log("Case IDs:   ", CASE_IDS.slice(0, 3).join(", "), "...");
  console.log("Doc IDs:    ", docIds.slice(0, 3).join(", "), "...");
  console.log("Providers:  ", providers.length);
  console.log("Audit events: 20");
}

async function ensureProviders(firmId: string) {
  const names = ["Demo Provider A", "Demo Provider B", "Demo Provider C"];
  const existing = await prisma.provider.findMany({ where: { firmId, name: { in: names } } });
  const toCreate = names.filter((n) => !existing.some((p) => p.name === n));
  if (toCreate.length > 0) {
    await prisma.provider.createMany({
      data: toCreate.map((name, i) => ({
        firmId,
        name,
        address: `${100 + i} Demo St`,
        city: "Demo City",
        state: "CA",
        phone: "555-0100",
        email: `demoprov${i + 1}@example.com`,
        specialtiesJson: (i % 2 === 0 ? ["General"] : ["Specialty"]),
      })),
    });
  }
  return prisma.provider.findMany({ where: { firmId, name: { in: names } } });
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
