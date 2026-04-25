import { ImapFlow } from "imapflow";
import crypto from "crypto";
import { simpleParser } from "mailparser";
import { PDFDocument, StandardFonts } from "pdf-lib";

export type ImapSandboxConfig = {
  mode: "local_imap_fixture";
  label?: string | null;
  fixtureId?: string | null;
};

export type ImapConfig = {
  host: string;
  port: number;
  secure: boolean;
  auth: { user: string; pass: string };
  mailbox: string; // INBOX
  sandbox?: ImapSandboxConfig | null;
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

export function formatImapError(err: unknown): string {
  const candidate = err as {
    message?: string;
    response?: string;
    responseText?: string;
    authenticationFailed?: boolean;
    code?: string;
  } | null;
  const message = candidate?.message?.trim() || "";
  const responseText = candidate?.responseText?.trim() || "";
  const response = candidate?.response?.trim() || "";
  const authFailed =
    candidate?.authenticationFailed === true ||
    /AUTHENTICATIONFAILED/i.test(response) ||
    /Invalid credentials/i.test(responseText);

  if (authFailed) {
    return `IMAP authentication failed: ${responseText || "Invalid credentials"}`;
  }
  if (responseText && responseText !== message) {
    return responseText;
  }
  if (response && response !== message) {
    return response;
  }
  if (message) {
    return message;
  }
  if (candidate?.code) {
    return String(candidate.code);
  }
  return String(err);
}

export function shouldUseLocalMailboxSandbox(cfg: ImapConfig): boolean {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.ONYX_ENABLE_LOCAL_MAILBOX_SANDBOX === "true" &&
    cfg.sandbox?.mode === "local_imap_fixture"
  );
}

async function buildSandboxPdf(lines: string[]): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([612, 792]);
  page.drawText(lines.join("\n"), {
    x: 40,
    y: 720,
    size: 12,
    font,
    lineHeight: 16,
  });
  return Buffer.from(await doc.save());
}

async function buildLocalMailboxSandboxMessages(
  cfg: ImapConfig
): Promise<EmailMessage[]> {
  const fixtureId = cfg.sandbox?.fixtureId?.trim() || "default";
  const label = cfg.sandbox?.label?.trim() || "Local mailbox sandbox";

  const strongLines = [
    "Medical Record",
    "Patient: Riley Carter",
    "Case Number: SMOKE-2026-001",
    "Provider: Harbor Physical Therapy",
    "Date of Loss: 02/14/2026",
    "Diagnosis: Cervical strain and lumbar strain.",
    "Physical therapy continues twice weekly.",
  ];
  const ambiguousLines = [
    "Unsigned intake worksheet",
    "Patient: Unverified caller",
    "Provider: Community Urgent Care",
    "Follow-up recommended pending identity confirmation.",
  ];
  const clioLines = [
    "Insurance Letter",
    "Client: Riley Carter",
    "Case Number: SMOKE-2026-001",
    "Carrier: Safe Harbor Insurance",
    "Claim Number: CLM-SMOKE-4242",
    "Policy Number: POL-SMOKE-7788",
    "Date of Loss: 02/14/2026",
    "Please update the matter with the current claim information.",
  ];

  const [strongPdf, ambiguousPdf, clioPdf] = await Promise.all([
    buildSandboxPdf(strongLines),
    buildSandboxPdf(ambiguousLines),
    buildSandboxPdf(clioLines),
  ]);

  const baseHeaders = {
    "x-onyx-local-mailbox-sandbox": "true",
    "x-onyx-local-mailbox-fixture": fixtureId,
    "x-onyx-local-mailbox-label": label,
  };

  return [
    {
      uid: 1001,
      providerMessageId: `<${fixtureId}.strong@local-mailbox-sandbox.onyx>`,
      fromEmail: "records@harborpt.local",
      fromName: "Harbor Physical Therapy",
      subject: "Medical record for Riley Carter",
      bodyText: normalizeBodyText(strongLines.join("\n")),
      sentAt: new Date("2026-04-20T14:30:00.000Z"),
      receivedAt: new Date("2026-04-20T14:31:00.000Z"),
      attachments: [
        {
          filename: "smoke-strong-record.pdf",
          mimeType: "application/pdf",
          content: strongPdf,
        },
      ],
      rawHeaders: {
        ...baseHeaders,
        "message-id": `<${fixtureId}.strong@local-mailbox-sandbox.onyx>`,
      },
    },
    {
      uid: 1002,
      providerMessageId: `<${fixtureId}.ambiguous@local-mailbox-sandbox.onyx>`,
      fromEmail: "triage@communityurgent.local",
      fromName: "Community Urgent Care",
      subject: "Unsigned intake worksheet",
      bodyText: normalizeBodyText(ambiguousLines.join("\n")),
      sentAt: new Date("2026-04-20T15:00:00.000Z"),
      receivedAt: new Date("2026-04-20T15:01:00.000Z"),
      attachments: [
        {
          filename: "smoke-ambiguous-note.pdf",
          mimeType: "application/pdf",
          content: ambiguousPdf,
        },
      ],
      rawHeaders: {
        ...baseHeaders,
        "message-id": `<${fixtureId}.ambiguous@local-mailbox-sandbox.onyx>`,
      },
    },
    {
      uid: 1003,
      providerMessageId: `<${fixtureId}.clio@local-mailbox-sandbox.onyx>`,
      fromEmail: "claims@safeharbor.local",
      fromName: "Safe Harbor Insurance",
      subject: "Carrier update for Riley Carter claim CLM-SMOKE-4242",
      bodyText: normalizeBodyText(clioLines.join("\n")),
      sentAt: new Date("2026-04-20T16:00:00.000Z"),
      receivedAt: new Date("2026-04-20T16:01:00.000Z"),
      attachments: [
        {
          filename: "smoke-clio-routing-letter.pdf",
          mimeType: "application/pdf",
          content: clioPdf,
        },
      ],
      rawHeaders: {
        ...baseHeaders,
        "message-id": `<${fixtureId}.clio@local-mailbox-sandbox.onyx>`,
      },
    },
  ];
}

export async function pollImapSinceUid(
  cfg: ImapConfig,
  lastUid: number | null,
  maxMessages = 25
): Promise<{ messages: EmailMessage[]; highestUid: number | null }> {
  if (shouldUseLocalMailboxSandbox(cfg)) {
    const fixtureId = cfg.sandbox?.fixtureId?.trim() || "default";
    const sandboxMessages = await buildLocalMailboxSandboxMessages(cfg);
    const messages = sandboxMessages
      .filter((message) => (lastUid == null ? true : message.uid > lastUid))
      .slice(0, maxMessages);
    const highestUid =
      messages.length > 0 ? messages[messages.length - 1].uid : null;
    console.log(
      `[imap:sandbox] fixture=${fixtureId} mailbox=${cfg.mailbox} messages=${messages.length} highestUid=${highestUid ?? "null"} realNetworkCall=false`
    );
    return { messages, highestUid };
  }

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
  if (shouldUseLocalMailboxSandbox(cfg)) {
    console.log(
      `[imap:sandbox] test fixture=${cfg.sandbox?.fixtureId?.trim() || "default"} mailbox=${cfg.mailbox} realNetworkCall=false`
    );
    return { ok: true };
  }

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
  client.on("error", () => {});
  try {
    await client.connect();
    await client.mailboxOpen(cfg.mailbox);
    await client.logout();
    return { ok: true };
  } catch (err: any) {
    const msg = formatImapError(err);
    return { ok: false, error: msg };
  }
}
