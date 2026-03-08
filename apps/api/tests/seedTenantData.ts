/**
 * Seed data for tenant isolation tests only.
 * Creates Firm A and Firm B, each with: 1 case, 1 document, 1 provider, 1 notification.
 * Also creates API keys for each firm and writes keys to tests/tenantIsolation/seed-output.json.
 * Run from apps/api: pnpm exec tsx tests/seedTenantData.ts
 */
import "dotenv/config";
import * as path from "path";
import * as fs from "fs";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { prisma } from "../src/db/prisma";

const FIRM_A_NAME = "Tenant Test Firm A";
const FIRM_B_NAME = "Tenant Test Firm B";
const OUTPUT_PATH = path.join(__dirname, "tenantIsolation", "seed-output.json");

async function main() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    console.error("DATABASE_URL not set. Add to apps/api/.env");
    process.exit(1);
  }

  const firmA = await prisma.firm.findFirst({ where: { name: FIRM_A_NAME } });
  const firmB = await prisma.firm.findFirst({ where: { name: FIRM_B_NAME } });
  if (firmA) {
    await deleteFirmData(firmA.id);
    await prisma.firm.delete({ where: { id: firmA.id } });
  }
  if (firmB) {
    await deleteFirmData(firmB.id);
    await prisma.firm.delete({ where: { id: firmB.id } });
  }

  const firmARecord = await prisma.firm.create({
    data: { name: FIRM_A_NAME },
  });
  const firmBRecord = await prisma.firm.create({
    data: { name: FIRM_B_NAME },
  });
  const firmAId = firmARecord.id;
  const firmBId = firmBRecord.id;

  const caseA = await prisma.legalCase.create({
    data: { firmId: firmAId, title: "Case A", caseNumber: "TENANT-A-001", clientName: "Client A" },
  });
  const caseB = await prisma.legalCase.create({
    data: { firmId: firmBId, title: "Case B", caseNumber: "TENANT-B-001", clientName: "Client B" },
  });

  const docA = await prisma.document.create({
    data: {
      firmId: firmAId,
      source: "tenant_test",
      spacesKey: `${firmAId}/tenant-test-doc-a.pdf`,
      originalName: "doc-a.pdf",
      mimeType: "application/pdf",
      pageCount: 1,
      status: "UPLOADED",
      ingestedAt: new Date(),
    },
  });
  const docB = await prisma.document.create({
    data: {
      firmId: firmBId,
      source: "tenant_test",
      spacesKey: `${firmBId}/tenant-test-doc-b.pdf`,
      originalName: "doc-b.pdf",
      mimeType: "application/pdf",
      pageCount: 1,
      status: "UPLOADED",
      ingestedAt: new Date(),
    },
  });

  const providerA = await prisma.provider.create({
    data: {
      firmId: firmAId,
      name: "Provider A",
      address: "123 A St",
      city: "City A",
      state: "ST",
      email: "provider-a@test.example",
    },
  });
  const providerB = await prisma.provider.create({
    data: {
      firmId: firmBId,
      name: "Provider B",
      address: "456 B St",
      city: "City B",
      state: "ST",
      email: "provider-b@test.example",
    },
  });

  await prisma.notification.create({
    data: { firmId: firmAId, type: "test", title: "Notification A", message: "For tenant A" },
  });
  await prisma.notification.create({
    data: { firmId: firmBId, type: "test", title: "Notification B", message: "For tenant B" },
  });

  const rawKeyA = `tk_${crypto.randomBytes(24).toString("hex")}`;
  const rawKeyB = `tk_${crypto.randomBytes(24).toString("hex")}`;
  const keyHashA = await bcrypt.hash(rawKeyA, 10);
  const keyHashB = await bcrypt.hash(rawKeyB, 10);

  await prisma.apiKey.create({
    data: {
      firmId: firmAId,
      name: "Tenant Test Key A",
      keyPrefix: rawKeyA.slice(0, 12),
      keyHash: keyHashA,
      scopes: "ingest",
    },
  });
  await prisma.apiKey.create({
    data: {
      firmId: firmBId,
      name: "Tenant Test Key B",
      keyPrefix: rawKeyB.slice(0, 12),
      keyHash: keyHashB,
      scopes: "ingest",
    },
  });

  const output = {
    firmAId,
    firmBId,
    caseAId: caseA.id,
    caseBId: caseB.id,
    documentAId: docA.id,
    documentBId: docB.id,
    providerAId: providerA.id,
    providerBId: providerB.id,
    apiKeyA: rawKeyA,
    apiKeyB: rawKeyB,
  };

  const outDir = path.dirname(OUTPUT_PATH);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2), "utf8");
  console.log("Tenant test data seeded. Output:", OUTPUT_PATH);
}

async function deleteFirmData(firmId: string) {
  await prisma.apiKey.deleteMany({ where: { firmId } });
  await prisma.notification.deleteMany({ where: { firmId } });
  await prisma.documentAuditEvent.deleteMany({ where: { firmId } });
  await prisma.document.deleteMany({ where: { firmId } });
  await prisma.reviewQueueEvent.deleteMany({ where: { firmId } });
  await prisma.legalCase.deleteMany({ where: { firmId } });
  await prisma.provider.deleteMany({ where: { firmId } });
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
