import "dotenv/config";

import assert from "node:assert/strict";

import { prisma } from "../db/prisma";
import { pgPool } from "../db/pg";
import { matchDocumentToCase } from "./caseMatching";

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
  throw lastError ?? new Error("Database never became ready for caseMatching tests");
}

async function insertEmailContext(params: {
  firmId: string;
  documentId: string;
  clientName: string;
  subject: string;
}): Promise<{ mailboxId: string; messageId: string; attachmentId: string }> {
  const mailboxId = randomId("case-match-mailbox");
  const messageId = randomId("case-match-message");
  const attachmentId = randomId("case-match-attachment");

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
    [messageId, mailboxId, randomId("provider-message"), params.subject, params.clientName]
  );
  await pgPool.query(
    `
    insert into email_attachments
      (id, email_message_id, filename, mime_type, size_bytes, sha256, ingest_document_id)
    values
      ($1, $2, 'match-test.pdf', 'application/pdf', 128, $3, $4)
    `,
    [attachmentId, messageId, randomId("sha"), params.documentId]
  );

  return { mailboxId, messageId, attachmentId };
}

async function main() {
  await waitForDatabaseReady();

  const firmId = randomId("case-match-firm");
  const strongDocumentId = randomId("case-match-doc-strong");
  const ambiguousDocumentId = randomId("case-match-doc-ambiguous");
  const createdMailboxIds: string[] = [];
  const createdMessageIds: string[] = [];
  const createdAttachmentIds: string[] = [];

  try {
    await prisma.firm.create({
      data: {
        id: firmId,
        name: "Case Matching Test Firm",
      },
    });

    const strongCase = await prisma.legalCase.create({
      data: {
        id: randomId("case-match-strong-case"),
        firmId,
        title: "Jordan Smith Matter",
        caseNumber: "2024-PI-1234",
        clientName: "Jordan Smith",
      },
    });
    await prisma.legalCase.create({
      data: {
        id: randomId("case-match-other-case"),
        firmId,
        title: "Other Matter",
        caseNumber: "2024-PI-9999",
        clientName: "Other Person",
      },
    });

    const ambiguousCaseA = await prisma.legalCase.create({
      data: {
        id: randomId("case-match-ambiguous-a"),
        firmId,
        title: "Taylor Reed One",
        caseNumber: "AMB-001",
        clientName: "Taylor Reed",
      },
    });
    const ambiguousCaseB = await prisma.legalCase.create({
      data: {
        id: randomId("case-match-ambiguous-b"),
        firmId,
        title: "Taylor Reed Two",
        caseNumber: "AMB-002",
        clientName: "Taylor Reed",
      },
    });

    await prisma.document.create({
      data: {
        id: strongDocumentId,
        firmId,
        source: "email",
        spacesKey: `tests/${strongDocumentId}.pdf`,
        originalName: "strong-match.pdf",
        mimeType: "application/pdf",
        extractedFields: {
          caseNumber: "2024 PI 1234",
          clientName: "Jordan Smith",
          court: {
            caseNumber: "2024-PI-1234",
            parties: {
              plaintiff: "Smith, Jordan",
            },
          },
        },
      },
    });

    await prisma.document.create({
      data: {
        id: ambiguousDocumentId,
        firmId,
        source: "email",
        spacesKey: `tests/${ambiguousDocumentId}.pdf`,
        originalName: "ambiguous-match.pdf",
        mimeType: "application/pdf",
        extractedFields: {},
      },
    });

    await pgPool.query(
      `
      insert into document_recognition (document_id, doc_type, case_number, client_name, updated_at)
      values ($1, 'court_filing', $2, null, now())
      `,
      [strongDocumentId, "2024-PI-1234"]
    );
    await pgPool.query(
      `
      insert into document_recognition (document_id, doc_type, case_number, client_name, updated_at)
      values ($1, 'other', null, null, now())
      `,
      [ambiguousDocumentId]
    );

    const strongEmail = await insertEmailContext({
      firmId,
      documentId: strongDocumentId,
      clientName: "Jordan Smith",
      subject: "Re: Jordan Smith",
    });
    createdMailboxIds.push(strongEmail.mailboxId);
    createdMessageIds.push(strongEmail.messageId);
    createdAttachmentIds.push(strongEmail.attachmentId);

    const ambiguousEmail = await insertEmailContext({
      firmId,
      documentId: ambiguousDocumentId,
      clientName: "Taylor Reed",
      subject: "Client: Taylor Reed",
    });
    createdMailboxIds.push(ambiguousEmail.mailboxId);
    createdMessageIds.push(ambiguousEmail.messageId);
    createdAttachmentIds.push(ambiguousEmail.attachmentId);

    const strongMatch = await matchDocumentToCase(
      firmId,
      { documentId: strongDocumentId, caseNumber: null, clientName: null },
      null
    );

    assert.equal(strongMatch.caseId, strongCase.id, "Expected combined document/email signals to pick the strong case");
    assert(
      strongMatch.matchConfidence >= 0.95,
      `Expected strong combined match confidence >= 0.95, got ${strongMatch.matchConfidence}`
    );
    assert(
      strongMatch.matchReason.includes("Case number match"),
      `Expected strong match reason to mention case number, got "${strongMatch.matchReason}"`
    );
    assert(
      strongMatch.matchReason.includes("Client name"),
      `Expected strong match reason to mention client corroboration, got "${strongMatch.matchReason}"`
    );

    const ambiguousMatch = await matchDocumentToCase(
      firmId,
      { documentId: ambiguousDocumentId, caseNumber: null, clientName: null },
      null
    );

    assert.equal(
      ambiguousMatch.caseId,
      ambiguousCaseA.id,
      "Expected deterministic case selection when ambiguous client-name-only matches tie"
    );
    assert(
      ambiguousMatch.matchConfidence < 0.5,
      `Expected ambiguous email-only match confidence < 0.5, got ${ambiguousMatch.matchConfidence}`
    );
    assert(
      ambiguousMatch.matchReason.includes("Ambiguous client-name match across multiple cases"),
      `Expected ambiguous match reason to mention ambiguity, got "${ambiguousMatch.matchReason}"`
    );
    assert.notEqual(ambiguousMatch.caseId, ambiguousCaseB.id, "Expected sort order to remain deterministic");

    console.log("caseMatching.test.ts passed");
  } finally {
    if (createdAttachmentIds.length > 0) {
      await pgPool.query(`delete from email_attachments where id = any($1)`, [createdAttachmentIds]).catch(() => undefined);
    }
    if (createdMessageIds.length > 0) {
      await pgPool.query(`delete from email_messages where id = any($1)`, [createdMessageIds]).catch(() => undefined);
    }
    if (createdMailboxIds.length > 0) {
      await pgPool.query(`delete from mailbox_connections where id = any($1)`, [createdMailboxIds]).catch(() => undefined);
    }
    await pgPool
      .query(`delete from document_recognition where document_id = any($1)`, [[strongDocumentId, ambiguousDocumentId]])
      .catch(() => undefined);
    await prisma.document.deleteMany({
      where: {
        id: {
          in: [strongDocumentId, ambiguousDocumentId],
        },
      },
    }).catch(() => undefined);
    await prisma.legalCase.deleteMany({ where: { firmId } }).catch(() => undefined);
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
