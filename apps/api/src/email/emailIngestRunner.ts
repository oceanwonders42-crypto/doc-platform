import "dotenv/config";
import { randomUUID } from "node:crypto";
import { pollImapSinceUid, sha256 } from "./imapPoller";
import { pgPool } from "../db/pg";
import { prisma } from "../db/prisma";
import { createNotification } from "../services/notifications";
import {
  extractEmailAutomationSnapshot,
  setDocumentEmailAutomation,
} from "../services/emailAutomation";
import { isEmailAutomationAllowedForFirm } from "../services/featureCompatibility";
import type { EmailMessage } from "./imapPoller";

type MailboxRow = {
  id: string;
  firm_id: string;
  provider: "imap" | "gmail";
  imap_host: string | null;
  imap_port: number | null;
  imap_secure: boolean | null;
  imap_username: string | null;
  imap_password_enc?: string | null;
  imap_password?: string | null;
  folder: string | null;
  last_uid: string | null;
  status: "active" | "paused" | "error";
};

function decryptMaybePlaintext(value: string) {
  return value;
}

function isFaxEmail(message: EmailMessage): boolean {
  const subject = (message.subject || "").toLowerCase();
  const from = (message.fromEmail || "").toLowerCase();
  const faxIndicators = [
    "fax",
    "efax",
    "ringcentral",
    "rcfax",
    "myfax",
    "faxburner",
    "gotfreefax",
    "tpc.int",
    "faxaway",
  ];
  const text = `${subject} ${from}`;
  return faxIndicators.some((value) => text.includes(value));
}

function shouldIngestAttachment(filename: string, mimeType?: string | null): boolean {
  const lower = (filename || "").toLowerCase();
  if (lower.endsWith(".pdf")) return true;
  const mt = (mimeType || "").toLowerCase();
  return mt === "application/pdf" || mt.startsWith("application/pdf;");
}

function extractClientNameFromSubject(subject: string | undefined): string | null {
  if (!subject || !subject.trim()) return null;
  const trimmed = subject.trim();
  const reMatch = trimmed.match(/^re:\s*(.+?)(?:\s*[-–—|].*)?$/i);
  if (reMatch) return reMatch[1].trim() || null;
  const fwdMatch = trimmed.match(/^fwd?:\s*(.+?)(?:\s*[-–—|].*)?$/i);
  if (fwdMatch) return fwdMatch[1].trim() || null;
  const clientMatch = trimmed.match(/client\s*[:\-]\s*(.+?)(?:\s*[-–—|].*)?$/i);
  if (clientMatch) return clientMatch[1].trim() || null;
  return null;
}

function makeRawEmailId(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}

export type RawEmailStructuredField = {
  value: string;
  confidence: number;
  sources: string[];
} | null;

export type RawEmailStructuredExtraction = {
  version: "raw-email-extraction-v1";
  clientName: RawEmailStructuredField;
  dateOfLoss: RawEmailStructuredField;
  claimNumber: RawEmailStructuredField;
  policyNumber: RawEmailStructuredField;
  insuranceCarrier: RawEmailStructuredField;
};

function normalizeFieldConfidence(
  field: RawEmailStructuredField,
  minimumConfidence: number
): RawEmailStructuredField {
  if (!field) return null;
  if (!field.sources.includes("body")) return field;
  return {
    ...field,
    confidence: Math.max(field.confidence, minimumConfidence),
  };
}

function normalizeDateValue(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) return trimmed;

  const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!slashMatch) return trimmed;

  const month = Number(slashMatch[1]);
  const day = Number(slashMatch[2]);
  const year = Number(slashMatch[3]);
  if (!Number.isInteger(month) || !Number.isInteger(day) || !Number.isInteger(year)) return trimmed;
  if (month < 1 || month > 12 || day < 1 || day > 31) return trimmed;

  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}

export function extractStructuredEmailData(message: EmailMessage): RawEmailStructuredExtraction {
  const snapshot = extractEmailAutomationSnapshot({
    fromEmail: message.fromEmail,
    subject: message.subject,
    bodyText: message.bodyText,
    attachmentFileName: message.attachments?.[0]?.filename ?? null,
    attachmentNames: message.attachments?.map((attachment) => attachment.filename) ?? [],
  });

  return {
    version: "raw-email-extraction-v1",
    clientName: snapshot?.fields.clientName ?? null,
    dateOfLoss: snapshot?.fields.dateOfLoss
      ? normalizeFieldConfidence(
          {
            ...snapshot.fields.dateOfLoss,
            value: normalizeDateValue(snapshot.fields.dateOfLoss.value) ?? snapshot.fields.dateOfLoss.value,
          },
          0.95
        )
      : null,
    claimNumber: normalizeFieldConfidence(snapshot?.fields.claimNumber ?? null, 0.95),
    policyNumber: normalizeFieldConfidence(snapshot?.fields.policyNumber ?? null, 0.95),
    insuranceCarrier: snapshot?.fields.insuranceCarrier ?? null,
  };
}

export async function ensureEmailMessageExtractionStorage(): Promise<void> {
  await pgPool.query(
    `alter table email_messages add column if not exists structured_extraction jsonb`
  );
}

export async function upsertEmailMessageRecord(input: {
  mailboxConnectionId: string;
  message: EmailMessage;
  extraction?: RawEmailStructuredExtraction | null;
}): Promise<{ id: string }> {
  await ensureEmailMessageExtractionStorage();
  const receivedAt = input.message.receivedAt ?? input.message.sentAt ?? new Date();
  const isFax = isFaxEmail(input.message);
  const extraction = input.extraction ?? extractStructuredEmailData(input.message);
  const clientNameExtracted =
    extraction.clientName?.value ?? extractClientNameFromSubject(input.message.subject);

  const { rows } = await pgPool.query<{ id: string }>(
    `
    insert into email_messages
      (id, mailbox_connection_id, provider_message_id, from_email, subject, received_at, is_fax, client_name_extracted, structured_extraction)
    values
      ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
    on conflict (mailbox_connection_id, provider_message_id)
    do update set
      subject = excluded.subject,
      from_email = excluded.from_email,
      received_at = excluded.received_at,
      is_fax = excluded.is_fax,
      client_name_extracted = excluded.client_name_extracted,
      structured_extraction = excluded.structured_extraction
    returning id
    `,
    [
      makeRawEmailId("emailmsg"),
      input.mailboxConnectionId,
      String(input.message.uid),
      input.message.fromEmail || null,
      input.message.subject || null,
      receivedAt,
      isFax,
      clientNameExtracted,
      JSON.stringify(extraction),
    ]
  );

  const emailMessageId = rows[0]?.id;
  if (!emailMessageId) {
    throw new Error("Failed to upsert email_messages row (no id returned)");
  }
  return { id: emailMessageId };
}

export async function runEmailPollOnce() {
  const { rows: mailboxes } = await pgPool.query<MailboxRow>(
    `select * from mailbox_connections where status='active'`
  );

  console.log(`[email] runEmailPollOnce: active mailboxes=${mailboxes.length}`);

  for (const mailbox of mailboxes) {
    console.log(
      `[email] polling mailbox id=${mailbox.id} provider=${mailbox.provider} user=${mailbox.imap_username} host=${mailbox.imap_host}`
    );

    try {
      if (mailbox.provider === "imap") {
        await handleImapMailbox(mailbox);
      } else {
        console.log("[email] gmail provider not implemented yet");
      }

      await pgPool.query(
        `update mailbox_connections
         set last_sync_at=now(), last_error=null, status='active', updated_at=now()
         where id=$1`,
        [mailbox.id]
      );
    } catch (error: any) {
      const message = String(error?.stack || error?.message || error);
      await pgPool.query(
        `update mailbox_connections
         set last_error=$2, status='active', updated_at=now()
         where id=$1`,
        [mailbox.id, message]
      );

      console.error(`[email] mailbox ${mailbox.id} error:`, message);
      createNotification(
        mailbox.firm_id,
        "mailbox_poll_failed",
        "Mailbox poll failed",
        `Poll failed for mailbox ${mailbox.imap_username ?? mailbox.id}: ${message.slice(0, 200)}`,
        { mailboxId: mailbox.id }
      ).catch((notificationError) =>
        console.warn("[notifications] mailbox_poll_failed failed", notificationError)
      );
    }
  }
}

export async function runEmailPollForMailbox(mailboxId: string) {
  const { rows } = await pgPool.query<MailboxRow>(
    `select * from mailbox_connections where id = $1 limit 1`,
    [mailboxId]
  );
  const mailbox = rows[0];
  if (!mailbox) throw new Error("mailbox not found");

  try {
    if (mailbox.provider === "imap") {
      await handleImapMailbox(mailbox);
    } else {
      throw new Error("gmail provider not implemented");
    }
    await pgPool.query(
      `update mailbox_connections set last_sync_at=now(), last_error=null, status='active', updated_at=now() where id=$1`,
      [mailbox.id]
    );
  } catch (error: any) {
    const message = String(error?.stack || error?.message || error);
    await pgPool.query(
      `update mailbox_connections set last_error=$2, updated_at=now() where id=$1`,
      [mailbox.id, message]
    );
    console.error(`[email] mailbox ${mailbox.id} poll-now error:`, message);
    createNotification(
      mailbox.firm_id,
      "mailbox_poll_failed",
      "Mailbox poll failed",
      `Poll failed for mailbox ${mailbox.imap_username ?? mailbox.id}: ${message.slice(0, 200)}`,
      { mailboxId: mailbox.id }
    ).catch((notificationError) =>
      console.warn("[notifications] mailbox_poll_failed failed", notificationError)
    );
    throw error;
  }
}

async function handleImapMailbox(mailbox: MailboxRow) {
  const passwordRaw = mailbox.imap_password_enc ?? mailbox.imap_password;
  if (!mailbox.imap_host || !mailbox.imap_username || !passwordRaw) {
    throw new Error("Mailbox missing imap_host/imap_username/imap_password");
  }

  const password = decryptMaybePlaintext(passwordRaw);
  const lastUid = mailbox.last_uid ? Number(mailbox.last_uid) : null;
  const { messages, highestUid } = await pollImapSinceUid(
    {
      host: mailbox.imap_host,
      port: mailbox.imap_port || 993,
      secure: mailbox.imap_secure ?? true,
      auth: { user: mailbox.imap_username, pass: password },
      mailbox: mailbox.folder || "INBOX",
    },
    lastUid,
    25
  );

  console.log(
    `[email] imap returned messages=${messages.length} highestUid=${highestUid ?? "null"} lastUidWas=${lastUid ?? "null"}`
  );

  const firm = await prisma.firm.findUnique({
    where: { id: mailbox.firm_id },
    select: { id: true, plan: true },
  });
  const emailAutomationAllowed = firm
    ? isEmailAutomationAllowedForFirm(firm)
    : false;
  await ensureEmailMessageExtractionStorage();

  for (const message of messages) {
    const extraction = extractStructuredEmailData(message);
    const { id: emailMessageId } = await upsertEmailMessageRecord({
      mailboxConnectionId: mailbox.id,
      message,
      extraction,
    });

    const attachments = message.attachments ?? [];
    const attachmentNames = attachments.map((attachment) => attachment.filename);

    for (const attachment of attachments) {
      if (!attachment?.content || !attachment.filename) continue;

      const hash = sha256(attachment.content);
      const externalId = `imap:${mailbox.id}:${String(message.uid)}:${attachment.filename}:${hash.slice(0, 12)}`;
      const isPdf = shouldIngestAttachment(attachment.filename, attachment.mimeType);

      if (isPdf) {
        console.log(
          `[email] ingesting PDF ${attachment.filename} subject=${JSON.stringify(message.subject || "")} from=${message.fromEmail || ""}`
        );
      }

      const exists = await pgPool.query(
        `select 1 from email_attachments where email_message_id=$1 and sha256=$2 limit 1`,
        [emailMessageId, hash]
      );
      if ((exists.rowCount ?? 0) > 0) {
        if (isPdf) {
          console.log("[email] attachment already ingested, skipping", {
            emailMessageId,
            filename: attachment.filename,
            sha256: hash,
          });
        }
        continue;
      }

      let documentId: string | null = null;
      if (isPdf) {
        const ingest = await callIngest({
          firmId: mailbox.firm_id,
          filename: attachment.filename,
          mimeType: attachment.mimeType,
          content: attachment.content,
          source: "email",
          externalId,
          fromEmail: message.fromEmail,
          subject: message.subject,
        });
        documentId = ingest?.documentId || ingest?.id || null;
        console.log(`[email] ingested PDF -> documentId=${documentId || "?"}`);

        if (documentId && emailAutomationAllowed) {
          const snapshot = extractEmailAutomationSnapshot({
            fromEmail: message.fromEmail,
            subject: message.subject,
            bodyText: message.bodyText,
            attachmentFileName: attachment.filename,
            attachmentNames,
          });
          if (snapshot) {
            await setDocumentEmailAutomation(mailbox.firm_id, documentId, snapshot);
          }
        }
      }

      const insertResult = await pgPool.query(
        `
        insert into email_attachments
          (email_message_id, filename, mime_type, size_bytes, sha256, ingest_document_id)
        values
          ($1,$2,$3,$4,$5,$6)
        on conflict (email_message_id, sha256) do nothing
        returning id
        `,
        [
          emailMessageId,
          attachment.filename || null,
          attachment.mimeType || null,
          attachment.content.length,
          hash,
          documentId,
        ]
      );

      if (insertResult.rowCount === 0 && isPdf) {
        console.log("[email] attachment already ingested, skipping", {
          emailMessageId,
          filename: attachment.filename,
          sha256: hash,
        });
      }
    }
  }

  if (highestUid && (lastUid === null || highestUid > lastUid)) {
    await pgPool.query(
      `update mailbox_connections set last_uid=$2, updated_at=now() where id=$1`,
      [mailbox.id, String(highestUid)]
    );

    console.log("[email] updated mailbox cursor", {
      mailboxId: mailbox.id,
      lastUid: highestUid,
    });
  }
}

async function callIngest(args: {
  firmId: string;
  filename: string;
  mimeType?: string | null;
  content: Buffer;
  source: string;
  externalId: string;
  fromEmail?: string | null;
  subject?: string | null;
}) {
  const ingestUrl = process.env.INGEST_URL || "http://127.0.0.1:4000/ingest";
  const apiKey = process.env.INGEST_API_KEY;
  if (!apiKey) throw new Error("Missing INGEST_API_KEY");

  const form = new FormData();
  form.append("firmId", args.firmId);
  form.append("source", args.source);
  form.append("externalId", args.externalId);
  if (args.fromEmail) form.append("fromEmail", args.fromEmail);
  if (args.subject) form.append("subject", args.subject);

  const bytes = new Uint8Array(args.content);
  const blob = new Blob([bytes], {
    type: args.mimeType || "application/octet-stream",
  });
  form.append("file", blob, args.filename);

  const response = await fetch(ingestUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  const text = await response.text();
  if (!response.ok) throw new Error(`Ingest failed ${response.status}: ${text}`);
  return JSON.parse(text);
}
