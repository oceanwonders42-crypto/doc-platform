import "dotenv/config";
import { pollImapSinceUid, sha256 } from "./imapPoller";
import { pgPool } from "../db/pg";
import { createNotification } from "../services/notifications";
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
  last_uid: string | null; // bigint comes back as string in pg
  status: "active" | "paused" | "error";
};

// TODO: replace with real decrypt later. For now your existing behavior is plaintext.
function decryptMaybePlaintext(s: string) {
  return s;
}

/** Heuristic: treat as fax when subject or sender suggests fax-to-email (e.g. efax, ringcentral, fax). */
function isFaxEmail(m: EmailMessage): boolean {
  const subject = (m.subject || "").toLowerCase();
  const from = (m.fromEmail || "").toLowerCase();
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
  return faxIndicators.some((word) => text.includes(word));
}

/** Whether this attachment should be sent to the document ingest pipeline (PDF + scanner images). */
function shouldIngestAttachment(filename: string, mimeType?: string | null): boolean {
  const lower = (filename || "").toLowerCase();
  if (lower.endsWith(".pdf")) return true;
  const mt = (mimeType || "").toLowerCase();
  if (mt === "application/pdf" || mt.startsWith("application/pdf;")) return true;
  if (lower.endsWith(".tif") || lower.endsWith(".tiff") || mt === "image/tiff" || mt.startsWith("image/tiff;")) return true;
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg") || mt === "image/jpeg" || mt.startsWith("image/jpeg;")) return true;
  return false;
}

/** Extract a possible client name from subject (e.g. "Re: John Smith" or "Client: Jane Doe" or "Fwd: Smith, John"). */
function extractClientNameFromSubject(subject: string | undefined): string | null {
  if (!subject || !subject.trim()) return null;
  const s = subject.trim();
  // Re: Name or RE: Name
  const reMatch = s.match(/^re:\s*(.+?)(?:\s*[-–—|].*)?$/i);
  if (reMatch) return reMatch[1].trim() || null;
  // Fwd: Name or FWD: Name
  const fwdMatch = s.match(/^fwd?:\s*(.+?)(?:\s*[-–—|].*)?$/i);
  if (fwdMatch) return fwdMatch[1].trim() || null;
  // Client: Name or Client - Name
  const clientMatch = s.match(/client\s*[:\-]\s*(.+?)(?:\s*[-–—|].*)?$/i);
  if (clientMatch) return clientMatch[1].trim() || null;
  return null;
}

export async function runEmailPollOnce() {
  const { rows: mailboxes } = await pgPool.query<MailboxRow>(
    `select * from mailbox_connections where status='active'`
  );

  console.log(`[email] runEmailPollOnce: active mailboxes=${mailboxes.length}`);

  for (const mb of mailboxes) {
    console.log(
      `[email] polling mailbox id=${mb.id} provider=${mb.provider} user=${mb.imap_username} host=${mb.imap_host}`
    );

    try {
      if (mb.provider === "imap") {
        await handleImapMailbox(mb);
      } else {
        console.log("[email] gmail provider not implemented yet");
      }

      await pgPool.query(
        `update mailbox_connections
         set last_sync_at=now(), last_error=null, status='active', updated_at=now()
         where id=$1`,
        [mb.id]
      );
    } catch (err: any) {
      const msg = String(err?.stack || err?.message || err);

      await pgPool.query(
        `update mailbox_connections
         set last_error=$2, status='active', updated_at=now()
         where id=$1`,
        [mb.id, msg]
      );

      console.error(`[email] mailbox ${mb.id} error:`, msg);
      createNotification(
        mb.firm_id,
        "mailbox_poll_failed",
        "Mailbox poll failed",
        `Poll failed for mailbox ${mb.imap_username ?? mb.id}: ${msg.slice(0, 200)}`,
        { mailboxId: mb.id }
      ).catch((e) => console.warn("[notifications] mailbox_poll_failed failed", e));
    }
  }
}

/** Poll a single mailbox by id (used by poll-now). Ignores status; polls even if paused. */
export async function runEmailPollForMailbox(mailboxId: string) {
  const { rows } = await pgPool.query<MailboxRow>(
    `select * from mailbox_connections where id = $1 limit 1`,
    [mailboxId]
  );
  const mb = rows[0];
  if (!mb) throw new Error("mailbox not found");

  try {
    if (mb.provider === "imap") {
      await handleImapMailbox(mb);
    } else {
      throw new Error("gmail provider not implemented");
    }
    await pgPool.query(
      `update mailbox_connections set last_sync_at=now(), last_error=null, status='active', updated_at=now() where id=$1`,
      [mb.id]
    );
  } catch (err: any) {
    const msg = String(err?.stack || err?.message || err);
    await pgPool.query(
      `update mailbox_connections set last_error=$2, updated_at=now() where id=$1`,
      [mb.id, msg]
    );
    console.error(`[email] mailbox ${mb.id} poll-now error:`, msg);
    createNotification(
      mb.firm_id,
      "mailbox_poll_failed",
      "Mailbox poll failed",
      `Poll failed for mailbox ${mb.imap_username ?? mb.id}: ${msg.slice(0, 200)}`,
      { mailboxId: mb.id }
    ).catch((e) => console.warn("[notifications] mailbox_poll_failed failed", e));
    throw err;
  }
}

async function handleImapMailbox(mb: MailboxRow) {
  const passRaw = mb.imap_password_enc ?? mb.imap_password;
  if (!mb.imap_host || !mb.imap_username || !passRaw) {
    throw new Error("Mailbox missing imap_host/imap_username/imap_password");
  }

  const pass = decryptMaybePlaintext(passRaw);
  const lastUid = mb.last_uid ? Number(mb.last_uid) : null;

  const { messages, highestUid } = await pollImapSinceUid(
    {
      host: mb.imap_host,
      port: mb.imap_port || 993,
      secure: mb.imap_secure ?? true,
      auth: { user: mb.imap_username, pass },
      mailbox: mb.folder || "INBOX",
    },
    lastUid,
    25
  );

  console.log(
    `[email] imap returned messages=${messages.length} highestUid=${highestUid ?? "null"} lastUidWas=${lastUid ?? "null"}`
  );

  // Store metadata: sender (from_email), subject, receivedDate (received_at).
  // Also store is_fax and client_name_extracted for routing/display.
  for (const m of messages) {
    const receivedAt = m.receivedAt ?? m.sentAt ?? new Date();
    const isFax = isFaxEmail(m);
    const clientNameExtracted = extractClientNameFromSubject(m.subject);

    const { rows: msgRows } = await pgPool.query<{ id: string }>(
      `
  insert into email_messages
    (mailbox_connection_id, provider_message_id, from_email, subject, received_at, is_fax, client_name_extracted)
  values
    ($1, $2, $3, $4, $5, $6, $7)
  on conflict (mailbox_connection_id, provider_message_id)
  do update set
    subject = excluded.subject,
    from_email = excluded.from_email,
    received_at = excluded.received_at,
    is_fax = excluded.is_fax,
    client_name_extracted = excluded.client_name_extracted
  returning id
  `,
      [
        mb.id,
        String(m.uid),
        m.fromEmail || null,
        m.subject || null,
        receivedAt,
        isFax,
        clientNameExtracted,
      ]
    );

    const emailMessageId = msgRows[0]?.id;
    if (!emailMessageId) {
      throw new Error("Failed to upsert email_messages row (no id returned)");
    }

    // Process all non-inline attachments (extract all; send only PDFs to ingest pipeline)
    const attachments = m.attachments ?? [];

    for (const a of attachments) {
      if (!a?.content || !a.filename) continue;

      const hash = sha256(a.content);
      const externalId = `imap:${mb.id}:${String(m.uid)}:${a.filename}:${hash.slice(0, 12)}`;
      const isPdf = shouldIngestAttachment(a.filename, a.mimeType);

      if (isPdf) {
        console.log(
          `[email] ingesting PDF ${a.filename} subject=${JSON.stringify(m.subject || "")} from=${m.fromEmail || ""}`
        );
      }

      // Skip ingest call if already recorded for this email message (by sha256)
      let docId: string | null = null;
      const exists = await pgPool.query(
        `select 1 from email_attachments where email_message_id=$1 and sha256=$2 limit 1`,
        [emailMessageId, hash]
      );

      if ((exists.rowCount ?? 0) > 0) {
        if (isPdf) {
          console.log("[email] attachment already ingested, skipping", {
            emailMessageId,
            filename: a.filename,
            sha256: hash,
          });
        }
        continue;
      }

      if (isPdf) {
        const ingest = await callIngest({
          firmId: mb.firm_id,
          filename: a.filename,
          mimeType: a.mimeType,
          content: a.content,
          source: "email",
          externalId,
          fromEmail: m.fromEmail,
          subject: m.subject,
        });
        docId = ingest?.documentId || ingest?.id || null;
        console.log(`[email] ingested PDF -> documentId=${docId || "?"}`);
      }

      const r = await pgPool.query(
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
          a.filename || null,
          a.mimeType || null,
          a.content.length,
          hash,
          docId,
        ]
      );

      if (r.rowCount === 0) {
        if (isPdf) {
          console.log("[email] attachment already ingested, skipping", {
            emailMessageId,
            filename: a.filename,
            sha256: hash,
          });
        }
        continue;
      }
    }
  }

  // ✅ Save cursor ONCE at end so next poll only fetches new emails
  if (highestUid && (lastUid === null || highestUid > lastUid)) {
    await pgPool.query(
      `update mailbox_connections set last_uid=$2, updated_at=now() where id=$1`,
      [mb.id, String(highestUid)]
    );

    console.log("[email] updated mailbox cursor", {
      mailboxId: mb.id,
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

  const res = await fetch(ingestUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`Ingest failed ${res.status}: ${text}`);
  return JSON.parse(text);
}
