import "dotenv/config";

import assert from "node:assert/strict";

import { prisma } from "../db/prisma";
import { pgPool } from "../db/pg";
import { getExtractedForRouting, scoreDocumentRouting } from "./routingScorer";

function randomId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForDatabaseReady(): Promise<void> {
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
  throw lastError ?? new Error("Database never became ready for routingScorer tests");
}

async function insertEmailContext(params: {
  firmId: string;
  documentId: string;
  clientName: string;
}): Promise<{ mailboxId: string; messageId: string; attachmentId: string }> {
  const mailboxId = randomId("routing-scorer-mailbox");
  const messageId = randomId("routing-scorer-message");
  const attachmentId = randomId("routing-scorer-attachment");

  await pgPool.query(
    `insert into mailbox_connections (id, firm_id, provider, status) values ($1, $2, 'imap', 'active')`,
    [mailboxId, params.firmId]
  );
  await pgPool.query(
    `
    insert into email_messages
      (id, mailbox_connection_id, provider_message_id, subject, received_at, client_name_extracted)
    values
      ($1, $2, $3, $4, now(), $5)
    `,
    [messageId, mailboxId, randomId("provider-message"), "Re: Morgan Rivera", params.clientName]
  );
  await pgPool.query(
    `
    insert into email_attachments
      (id, email_message_id, filename, mime_type, size_bytes, sha256, ingest_document_id)
    values
      ($1, $2, 'routing-score.pdf', 'application/pdf', 256, $3, $4)
    `,
    [attachmentId, messageId, randomId("sha"), params.documentId]
  );

  return { mailboxId, messageId, attachmentId };
}

async function main() {
  await waitForDatabaseReady();

  const firmId = randomId("routing-scorer-firm");
  const documentId = randomId("routing-scorer-doc");
  let mailboxId: string | null = null;
  let messageId: string | null = null;
  let attachmentId: string | null = null;

  try {
    await prisma.firm.create({
      data: {
        id: firmId,
        name: "Routing Scorer Test Firm",
      },
    });

    const legalCase = await prisma.legalCase.create({
      data: {
        id: randomId("routing-scorer-case"),
        firmId,
        title: "Morgan Rivera Matter",
        caseNumber: "RR-100",
        clientName: "Morgan Rivera",
      },
    });

    await prisma.document.create({
      data: {
        id: documentId,
        firmId,
        source: "email",
        spacesKey: `tests/${documentId}.pdf`,
        originalName: "routing-score.pdf",
        mimeType: "application/pdf",
        extractedFields: {
          caseNumber: "RR 100",
          clientName: "Morgan Rivera",
          providerName: "Rivera Therapy",
          medicalRecord: {
            provider: "Rivera Therapy",
          },
        },
      },
    });

    await pgPool.query(
      `
      insert into document_recognition (document_id, doc_type, case_number, client_name, provider_name, updated_at)
      values ($1, 'medical_record', null, null, null, now())
      `,
      [documentId]
    );

    const emailContext = await insertEmailContext({
      firmId,
      documentId,
      clientName: "Morgan Rivera",
    });
    mailboxId = emailContext.mailboxId;
    messageId = emailContext.messageId;
    attachmentId = emailContext.attachmentId;

    const extracted = await getExtractedForRouting(documentId);
    assert(extracted, "Expected getExtractedForRouting to return merged routing fields");
    assert.equal(extracted?.caseNumber, "RR 100", "Expected document extracted case number to be merged in");
    assert.equal(extracted?.clientName, "Morgan Rivera", "Expected merged client name to be available");
    assert.equal(extracted?.documentClientName, "Morgan Rivera", "Expected document client name to be preserved");
    assert.equal(extracted?.emailClientName, "Morgan Rivera", "Expected email client name to be preserved");
    assert.equal(extracted?.providerName, "Rivera Therapy", "Expected provider to fall back to document extracted fields");

    const routingResult = await scoreDocumentRouting(
      {
        id: documentId,
        firmId,
        originalName: "routing-score.pdf",
        source: "email",
        routedCaseId: null,
        status: "PROCESSING",
      },
      {
        caseNumber: null,
        clientName: null,
        docType: extracted?.docType ?? null,
        providerName: extracted?.providerName ?? null,
      },
      null
    );

    assert.equal(
      routingResult.chosenCaseId,
      legalCase.id,
      "Expected scoreDocumentRouting to recover stored match signals via documentId"
    );
    assert(
      routingResult.confidence >= 0.9,
      `Expected routing score confidence >= 0.9, got ${routingResult.confidence}`
    );
    assert(
      routingResult.signals.baseMatchReason?.includes("Case number match"),
      `Expected base match reason to mention case number, got "${routingResult.signals.baseMatchReason}"`
    );

    console.log("routingScorer.test.ts passed");
  } finally {
    if (attachmentId) {
      await pgPool.query(`delete from email_attachments where id = $1`, [attachmentId]).catch(() => undefined);
    }
    if (messageId) {
      await pgPool.query(`delete from email_messages where id = $1`, [messageId]).catch(() => undefined);
    }
    if (mailboxId) {
      await pgPool.query(`delete from mailbox_connections where id = $1`, [mailboxId]).catch(() => undefined);
    }
    await pgPool.query(`delete from document_recognition where document_id = $1`, [documentId]).catch(() => undefined);
    await prisma.document.deleteMany({ where: { id: documentId } }).catch(() => undefined);
    await prisma.legalCase.deleteMany({ where: { firmId } }).catch(() => undefined);
    await prisma.routingFeedback.deleteMany({ where: { firmId } }).catch(() => undefined);
    await prisma.routingPattern.deleteMany({ where: { firmId } }).catch(() => undefined);
    await prisma.firm.deleteMany({ where: { id: firmId } }).catch(() => undefined);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await Promise.race([
      Promise.allSettled([prisma.$disconnect(), pgPool.end()]),
      new Promise((resolve) => setTimeout(resolve, 1000)),
    ]);
    process.exit(process.exitCode ?? 0);
  });
