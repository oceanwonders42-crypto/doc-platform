import "dotenv/config";
import assert from "node:assert/strict";

import { pgPool } from "../db/pg";
import { prisma } from "../db/prisma";
import {
  ensureEmailMessageExtractionStorage,
  extractStructuredEmailData,
  upsertEmailMessageRecord,
} from "./emailIngestRunner";
import type { EmailMessage } from "./imapPoller";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForDatabaseReady() {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    try {
      await pgPool.query("select 1 as ok");
      await prisma.$queryRawUnsafe("select 1 as ok");
      return;
    } catch (error) {
      lastError = error;
      await sleep(1000);
    }
  }
  throw lastError ?? new Error("Database never became ready for email ingest test");
}

function buildMessage(overrides: Partial<EmailMessage> = {}): EmailMessage {
  return {
    uid: 101,
    providerMessageId: "imap-uid:101",
    fromEmail: "bodilyinjury@progressive.com",
    fromName: "Progressive Claims",
    subject: "Claim Update for Jane Doe",
    bodyText: [
      "Client: Jane Doe",
      "Date of Loss: 01/15/2025",
      "Claim Number: CLM-445566",
      "Policy Number: PL-778899",
      "Insurance Carrier: Progressive",
    ].join("\n"),
    sentAt: new Date("2025-01-20T12:00:00.000Z"),
    receivedAt: new Date("2025-01-20T12:05:00.000Z"),
    attachments: [
      {
        filename: "Jane_Doe_claim_CLM-445566_records.pdf",
        mimeType: "application/pdf",
        content: Buffer.from("pdf"),
      },
    ],
    rawHeaders: {},
    ...overrides,
  };
}

function runExtractionShapeTest() {
  const extraction = extractStructuredEmailData(buildMessage());

  assert.equal(extraction.version, "raw-email-extraction-v1");
  assert.equal(extraction.clientName?.value, "Jane Doe");
  assert.ok((extraction.clientName?.confidence ?? 0) >= 0.84);
  assert.ok(extraction.clientName?.sources.includes("body"));

  assert.equal(extraction.dateOfLoss?.value, "2025-01-15");
  assert.ok((extraction.dateOfLoss?.confidence ?? 0) >= 0.95);
  assert.ok(extraction.dateOfLoss?.sources.includes("body"));

  assert.equal(extraction.claimNumber?.value, "CLM-445566");
  assert.ok((extraction.claimNumber?.confidence ?? 0) >= 0.95);
  assert.ok(extraction.claimNumber?.sources.includes("body"));

  assert.equal(extraction.policyNumber?.value, "PL-778899");
  assert.ok((extraction.policyNumber?.confidence ?? 0) >= 0.95);
  assert.ok(extraction.policyNumber?.sources.includes("body"));

  assert.equal(extraction.insuranceCarrier?.value, "Progressive");
  assert.ok((extraction.insuranceCarrier?.confidence ?? 0) >= 0.82);
  assert.ok(extraction.insuranceCarrier?.sources.includes("body"));
}

async function runPersistenceTest() {
  await waitForDatabaseReady();
  await ensureEmailMessageExtractionStorage();

  const suffix = Date.now().toString();
  const firmId = `email-intel-firm-${suffix}`;
  const mailboxId = `email-intel-mailbox-${suffix}`;

  try {
    await prisma.firm.create({
      data: {
        id: firmId,
        name: "Email Intel Test Firm",
      },
    });

    await pgPool.query(
      `
      insert into mailbox_connections (id, firm_id, provider, status, updated_at)
      values ($1, $2, 'imap', 'active', now())
      `,
      [mailboxId, firmId]
    );

    const firstMessage = buildMessage();
    const firstRecord = await upsertEmailMessageRecord({
      mailboxConnectionId: mailboxId,
      message: firstMessage,
      extraction: extractStructuredEmailData(firstMessage),
    });

    assert.ok(firstRecord.id, "Expected an email_messages id from first upsert");

    const secondMessage = buildMessage({
      bodyText: [
        "Client: Jane Doe",
        "Date of Loss: 01/15/2025",
        "Claim Number: CLM-999000",
        "Policy Number: PL-778899",
        "Insurance Carrier: Progressive",
      ].join("\n"),
    });

    const secondRecord = await upsertEmailMessageRecord({
      mailboxConnectionId: mailboxId,
      message: secondMessage,
      extraction: extractStructuredEmailData(secondMessage),
    });

    assert.equal(
      secondRecord.id,
      firstRecord.id,
      "Expected same email_messages row to be updated for the same mailbox/uid"
    );

    const persisted = await pgPool.query<{
      client_name_extracted: string | null;
      structured_extraction: {
        version: string;
        clientName: { value: string; confidence: number; sources: string[] } | null;
        claimNumber: { value: string; confidence: number; sources: string[] } | null;
      } | null;
    }>(
      `
      select
        client_name_extracted,
        structured_extraction
      from email_messages
      where id = $1
      `,
      [firstRecord.id]
    );

    assert.equal(persisted.rowCount, 1, "Expected one persisted email_messages row");
    assert.equal(persisted.rows[0].client_name_extracted, "Jane Doe");
    assert.equal(persisted.rows[0].structured_extraction?.version, "raw-email-extraction-v1");
    assert.equal(persisted.rows[0].structured_extraction?.clientName?.value, "Jane Doe");
    assert.equal(persisted.rows[0].structured_extraction?.claimNumber?.value, "CLM-999000");

    const count = await pgPool.query<{ count: number }>(
      `
      select count(*)::int as count
      from email_messages
      where mailbox_connection_id = $1
      `,
      [mailboxId]
    );
    assert.equal(count.rows[0]?.count, 1, "Expected one raw email_messages row after upsert");
  } finally {
    await pgPool.query(`delete from email_attachments where email_message_id in (select id from email_messages where mailbox_connection_id = $1)`, [mailboxId]);
    await pgPool.query(`delete from email_messages where mailbox_connection_id = $1`, [mailboxId]);
    await pgPool.query(`delete from mailbox_connections where id = $1`, [mailboxId]);
    await prisma.firm.deleteMany({ where: { id: firmId } });
  }
}

async function main() {
  runExtractionShapeTest();
  await runPersistenceTest();
}

main()
  .then(() => {
    console.log("emailIngestRunner.test.ts passed");
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await Promise.race([
      prisma.$disconnect(),
      new Promise((resolve) => setTimeout(resolve, 500)),
    ]);
    await Promise.race([
      pgPool.end(),
      new Promise((resolve) => setTimeout(resolve, 500)),
    ]);
  });
