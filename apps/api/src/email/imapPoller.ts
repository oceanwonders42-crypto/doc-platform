import { ImapFlow } from "imapflow";
import crypto from "crypto";
import { simpleParser } from "mailparser";

export type ImapConfig = {
  host: string;
  port: number;
  secure: boolean;
  auth: { user: string; pass: string };
  mailbox: string; // INBOX
};

export type EmailAttachment = {
  filename: string;
  mimeType: string;
  content: Buffer;
};

export type EmailMessage = {
  providerMessageId: string; // Message-ID header if available, else fallback uid
  fromEmail?: string;
  fromName?: string;
  subject?: string;
  bodyText?: string;
  sentAt?: Date;
  receivedAt?: Date;
  attachments: EmailAttachment[];
  rawHeaders: Record<string, any>;
  uid: number;
};

function bufFromSource(src: any): Promise<Buffer> {
  if (!src) return Promise.resolve(Buffer.alloc(0));
  if (Buffer.isBuffer(src)) return Promise.resolve(src);
  // src can be a stream (async iterable)
  return (async () => {
    const chunks: Buffer[] = [];
    for await (const ch of src) chunks.push(Buffer.isBuffer(ch) ? ch : Buffer.from(ch));
    return Buffer.concat(chunks);
  })();
}

function normalizeBodyText(text: string | undefined): string | undefined {
  if (!text) return undefined;
  const normalized = text.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim();
  return normalized ? normalized.slice(0, 20_000) : undefined;
}

export async function pollImapSinceUid(
  cfg: ImapConfig,
  lastUid: number | null,
  maxMessages = 25
): Promise<{ messages: EmailMessage[]; highestUid: number | null }> {
  const client = new ImapFlow({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: cfg.auth,
    logger: false,

    // Gmail can be slow; avoid mid-fetch socket death
    socketTimeout: 10 * 60 * 1000, // 10 min
    greetingTimeout: 60 * 1000,
    connectionTimeout: 60 * 1000,
  });

  client.on("error", (err) => {
    console.error("[imap] client error:", err?.message || err);
  });

  console.log(`[imap] connecting to ${cfg.host}:${cfg.port} mailbox=${cfg.mailbox}`);
  await client.connect();
  console.log("[imap] connected");

  try {
    const mb = await client.mailboxOpen(cfg.mailbox);
    console.log(`[imap] opened mailbox=${cfg.mailbox} mailboxUidValidity=${mb.uidValidity}`);

    const range = lastUid ? `${lastUid + 1}:*` : "1:*";
    console.log(`[imap] uid range=${range} maxMessages=${maxMessages}`);

    const messages: EmailMessage[] = [];
    let highestUid: number | null = null;

    // ✅ IMPORTANT: fetch by UID using { uid: range } selector
    const selector = { uid: range };

    for await (const msg of client.fetch(selector as any, {
      uid: true,
      envelope: true,
      internalDate: true,
      headers: true,
      source: true, // full RFC822 so attachments parsing is reliable
    } as any)) {
      const uid = Number((msg as any).uid);
      highestUid = highestUid ? Math.max(highestUid, uid) : uid;

      const raw = await bufFromSource((msg as any).source);
      const parsed = await simpleParser(raw);

      const fromEmail =
        parsed.from?.value?.[0]?.address ||
        (msg as any).envelope?.from?.[0]?.address ||
        undefined;
      const fromName = parsed.from?.value?.[0]?.name || undefined;

      const subject = parsed.subject || (msg as any).envelope?.subject || undefined;
      const bodyText = normalizeBodyText(parsed.text || undefined);

      const providerMessageId =
        (parsed.messageId?.trim() ||
          (parsed.headers?.get?.("message-id") as string | undefined)?.trim() ||
          `imap-uid:${uid}`) as string;

      // Extract only non-inline attachments (ignore inline images; send PDFs to ingest).
      const attachments: EmailAttachment[] = (parsed.attachments || [])
        .filter(
          (att: { contentDisposition?: string }) => att.contentDisposition !== "inline"
        )
        .map((att: { filename?: string; contentType?: string; content: Buffer }) => ({
          filename: att.filename || "attachment",
          mimeType: att.contentType || "application/octet-stream",
          content: Buffer.isBuffer(att.content) ? att.content : Buffer.from(att.content as any),
        }));

      // Skip if no attachments
      console.log(`[imap] uid=${uid} subject="${subject || ""}" attachments=${attachments.length}`);
      if (!attachments.length) continue;

      messages.push({
        uid,
        providerMessageId,
        fromEmail,
        fromName,
        subject,
        bodyText,
        sentAt: parsed.date || undefined,
        receivedAt: (msg as any).internalDate || undefined,
        attachments,
        rawHeaders: Object.fromEntries(parsed.headers?.entries?.() || []),
      });

      if (messages.length >= maxMessages) break;
    }

    console.log(`[imap] fetched messages=${messages.length} highestUid=${highestUid ?? "null"}`);
    return { messages, highestUid };
  } finally {
    try {
      await client.logout();
    } catch {}
  }
}

export function sha256(buf: Buffer) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

/** Test IMAP connection and mailbox open without fetching messages. */
export async function testImapConnection(
  cfg: ImapConfig
): Promise<{ ok: true } | { ok: false; error: string }> {
  const client = new ImapFlow({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: cfg.auth,
    logger: false,
    socketTimeout: 15 * 1000,
    greetingTimeout: 10 * 1000,
    connectionTimeout: 10 * 1000,
  });
  try {
    await client.connect();
    await client.mailboxOpen(cfg.mailbox);
    await client.logout();
    return { ok: true };
  } catch (err: any) {
    const msg = String(err?.message || err?.stack || err);
    return { ok: false, error: msg };
  }
}
