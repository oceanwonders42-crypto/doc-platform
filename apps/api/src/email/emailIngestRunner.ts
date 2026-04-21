import "dotenv/config";
import { randomUUID } from "node:crypto";
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

export type EmailAutomationField = {
  value: string;
  confidence: number;
  sources: string[];
};

export type EmailAutomationSnapshot = {
  version: "email_automation_v1";
  extractedAt: string;
  source: {
    fromEmail: string | null;
    subject: string | null;
    attachmentFileName: string | null;
    attachmentNames: string[];
  };
  fields: {
    clientName: EmailAutomationField | null;
    dateOfLoss: EmailAutomationField | null;
    claimNumber: EmailAutomationField | null;
    policyNumber: EmailAutomationField | null;
    insuranceCarrier: EmailAutomationField | null;
  };
  matchSignals: {
    caseNumberCandidates: string[];
    clientNameCandidates: string[];
    supportingSignals: string[];
  };
};

type Candidate = {
  value: string;
  confidence: number;
  source: string;
};

const BOOLEAN_FALSE_VALUES = new Set(["0", "false", "off", "no"]);
const BOOLEAN_TRUE_VALUES = new Set(["1", "true", "on", "yes"]);
const CARRIER_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\bstate\s+farm\b/i, label: "State Farm" },
  { pattern: /\bgeico\b/i, label: "GEICO" },
  { pattern: /\bprogressive\b/i, label: "Progressive" },
  { pattern: /\ballstate\b/i, label: "Allstate" },
  { pattern: /\bliberty\s+mutual\b/i, label: "Liberty Mutual" },
  { pattern: /\bnationwide\b/i, label: "Nationwide" },
  { pattern: /\btravelers\b/i, label: "Travelers" },
  { pattern: /\bfarmers\b/i, label: "Farmers" },
  { pattern: /\busaa\b/i, label: "USAA" },
  { pattern: /\bmercury\b/i, label: "Mercury" },
];

function decryptMaybePlaintext(value: string) {
  return value;
}

function makeRawEmailId(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}

function readEmailAutomationFlag(): boolean {
  const rawValue = process.env.EMAIL_AUTOMATION_ENABLED;
  if (rawValue == null) return true;
  const normalizedValue = rawValue.trim().toLowerCase();
  if (BOOLEAN_TRUE_VALUES.has(normalizedValue)) return true;
  if (BOOLEAN_FALSE_VALUES.has(normalizedValue)) return false;
  return true;
}

function normalizeWhitespace(value: string | null | undefined): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function normalizeFieldValue(value: string | null | undefined): string | null {
  const normalized = normalizeWhitespace(value);
  return normalized.length > 0 ? normalized : null;
}

function dedupeStrings(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const normalized = normalizeFieldValue(value);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(normalized);
  }
  return output;
}

function titleCaseName(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase())
    .join(" ");
}

function normalizeIdentifier(value: string): string {
  return value.trim().replace(/[^\w\-/.]/g, "").slice(0, 120);
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

function scoreField(candidates: Candidate[]): EmailAutomationField | null {
  if (!candidates.length) return null;
  const sorted = [...candidates].sort((left, right) => right.confidence - left.confidence);
  const best = sorted[0]!;
  return {
    value: best.value,
    confidence: Number(best.confidence.toFixed(2)),
    sources: dedupeStrings(sorted.map((candidate) => candidate.source)),
  };
}

function collectCandidates(
  source: string,
  text: string,
  regex: RegExp,
  confidence: number,
  normalize: (value: string) => string | null = normalizeFieldValue
): Candidate[] {
  const matches = [...text.matchAll(regex)];
  return matches
    .map((match) => normalize(match[1] ?? ""))
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .map((value) => ({ value, confidence, source }));
}

function extractClientNameCandidates(message: EmailMessage): Candidate[] {
  const candidates: Candidate[] = [];
  const subject = normalizeWhitespace(message.subject);
  const bodyText = normalizeWhitespace(message.bodyText);
  const attachmentNames = dedupeStrings((message.attachments ?? []).map((attachment) => attachment.filename));
  const fromEmail = normalizeWhitespace(message.fromEmail);

  if (subject) {
    const subjectPatterns = [
      { regex: /\bclient\s*[:\-]\s*([A-Z][A-Za-z'.,-]+(?:\s+[A-Z][A-Za-z'.,-]+){1,3})/g, confidence: 0.83 },
      { regex: /\binsured\s*[:\-]\s*([A-Z][A-Za-z'.,-]+(?:\s+[A-Z][A-Za-z'.,-]+){1,3})/g, confidence: 0.8 },
      { regex: /^re:\s*([A-Z][A-Za-z'.,-]+(?:\s+[A-Z][A-Za-z'.,-]+){1,3})/gi, confidence: 0.68 },
      { regex: /^fwd?:\s*([A-Z][A-Za-z'.,-]+(?:\s+[A-Z][A-Za-z'.,-]+){1,3})/gi, confidence: 0.66 },
    ];
    for (const entry of subjectPatterns) {
      candidates.push(
        ...collectCandidates("subject", subject, entry.regex, entry.confidence, (value) => {
          const normalized = normalizeFieldValue(value);
          return normalized ? titleCaseName(normalized.replace(/^[,.\-]+|[,.\-]+$/g, "")) : null;
        })
      );
    }
  }

  if (bodyText) {
    candidates.push(
      ...collectCandidates(
        "body",
        bodyText,
        /\b(?:client|claimant|insured|patient)\s*[:\-]\s*([A-Z][A-Za-z'.,-]+(?:\s+[A-Z][A-Za-z'.,-]+){1,3}?)(?=\s+(?:date\s+of\s+loss|loss\s+date|claim(?:\s+number)?|claim\s*#|policy(?:\s+number)?|policy\s*#|insurance\s+carrier|carrier)\b|$)/gi,
        0.9,
        (value) => {
          const normalized = normalizeFieldValue(value);
          return normalized ? titleCaseName(normalized.replace(/^[,.\-]+|[,.\-]+$/g, "")) : null;
        }
      )
    );
  }

  for (const attachmentName of attachmentNames) {
    const baseName = attachmentName.replace(/\.[a-z0-9]+$/i, " ");
    const normalizedName = baseName.replace(/[_-]+/g, " ");
    candidates.push(
      ...collectCandidates(
        "attachment",
        normalizedName,
        /\b([A-Z][A-Za-z']+(?:\s+[A-Z][A-Za-z']+){1,2})\b/g,
        0.55,
        (value) => {
          const normalized = normalizeFieldValue(value);
          if (!normalized) return null;
          if (/\b(invoice|records|medical|document|claim|policy)\b/i.test(normalized)) return null;
          return titleCaseName(normalized);
        }
      )
    );
  }

  if (fromEmail) {
    const localPart = fromEmail.split("@")[0] ?? "";
    const senderName = normalizeWhitespace(localPart.replace(/[._-]+/g, " "));
    if (/^[a-z]{2,}\s+[a-z]{2,}$/.test(senderName)) {
      candidates.push({
        value: titleCaseName(senderName),
        confidence: 0.42,
        source: "sender",
      });
    }
  }

  return candidates;
}

function extractCarrierCandidates(message: EmailMessage): Candidate[] {
  const candidates: Candidate[] = [];
  const attachmentNames = dedupeStrings((message.attachments ?? []).map((attachment) => attachment.filename));
  const textSources = [
    { source: "subject", text: normalizeWhitespace(message.subject), confidence: 0.68 },
    { source: "body", text: normalizeWhitespace(message.bodyText), confidence: 0.86 },
    { source: "attachment", text: attachmentNames.join(" "), confidence: 0.55 },
    { source: "sender", text: normalizeWhitespace(message.fromEmail), confidence: 0.5 },
  ];

  for (const entry of textSources) {
    if (!entry.text) continue;
    candidates.push(
      ...collectCandidates(
        entry.source,
        entry.text,
        /\b(?:carrier|insurance carrier|insurer|insurance company)\s*[:\-]\s*([A-Za-z0-9&.,' -]{3,80})/gi,
        entry.confidence,
        (value) => normalizeFieldValue(value)?.replace(/[;,]+$/, "") ?? null
      )
    );
    for (const carrier of CARRIER_PATTERNS) {
      if (carrier.pattern.test(entry.text)) {
        candidates.push({
          value: carrier.label,
          confidence: entry.confidence,
          source: entry.source,
        });
      }
    }
  }

  return candidates;
}

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

export function extractStructuredEmailData(message: EmailMessage): RawEmailStructuredExtraction {
  const attachmentNames = dedupeStrings((message.attachments ?? []).map((attachment) => attachment.filename));

  const clientName = scoreField(extractClientNameCandidates(message));
  const dateOfLossRaw = scoreField([
    ...collectCandidates(
      "subject",
      normalizeWhitespace(message.subject),
      /\b(?:date of loss|dol|incident date|accident date)\s*[:#-]?\s*([A-Za-z0-9,/-]{6,30})/gi,
      0.74
    ),
    ...collectCandidates(
      "body",
      normalizeWhitespace(message.bodyText),
      /\b(?:date of loss|dol|incident date|accident date)\s*[:#-]?\s*([A-Za-z0-9,/-]{6,30})/gi,
      0.9
    ),
  ]);
  const claimNumber = scoreField([
    ...collectCandidates(
      "subject",
      normalizeWhitespace(message.subject),
      /\b(?:claim(?:\s+number)?|claim\s*#|file\s+number|reference\s+number)\s*[:#-]?\s*([A-Z0-9][A-Z0-9\-/.]{3,})/gi,
      0.8,
      (value) => normalizeFieldValue(normalizeIdentifier(value))
    ),
    ...collectCandidates(
      "body",
      normalizeWhitespace(message.bodyText),
      /\b(?:claim(?:\s+number)?|claim\s*#|file\s+number|reference\s+number)\s*[:#-]?\s*([A-Z0-9][A-Z0-9\-/.]{3,})/gi,
      0.92,
      (value) => normalizeFieldValue(normalizeIdentifier(value))
    ),
    ...collectCandidates(
      "attachment",
      attachmentNames.join(" "),
      /\b(?:claim(?:\s+number)?|claim\s*#|file\s+number|reference\s+number)\s*[:#-]?\s*([A-Z0-9][A-Z0-9\-/.]{3,})/gi,
      0.58,
      (value) => normalizeFieldValue(normalizeIdentifier(value))
    ),
  ]);
  const policyNumber = scoreField([
    ...collectCandidates(
      "subject",
      normalizeWhitespace(message.subject),
      /\b(?:policy(?:\s+number)?|policy\s*#)\s*[:#-]?\s*([A-Z0-9][A-Z0-9\-/.]{3,})/gi,
      0.78,
      (value) => normalizeFieldValue(normalizeIdentifier(value))
    ),
    ...collectCandidates(
      "body",
      normalizeWhitespace(message.bodyText),
      /\b(?:policy(?:\s+number)?|policy\s*#)\s*[:#-]?\s*([A-Z0-9][A-Z0-9\-/.]{3,})/gi,
      0.9,
      (value) => normalizeFieldValue(normalizeIdentifier(value))
    ),
  ]);
  const insuranceCarrier = scoreField(extractCarrierCandidates(message));

  return {
    version: "raw-email-extraction-v1",
    clientName,
    dateOfLoss: dateOfLossRaw
      ? normalizeFieldConfidence(
          {
            ...dateOfLossRaw,
            value: normalizeDateValue(dateOfLossRaw.value) ?? dateOfLossRaw.value,
          },
          0.95
        )
      : null,
    claimNumber: normalizeFieldConfidence(claimNumber, 0.95),
    policyNumber: normalizeFieldConfidence(policyNumber, 0.95),
    insuranceCarrier,
  };
}

export function buildEmailAutomationSnapshot(message: EmailMessage, attachmentFileName?: string | null): EmailAutomationSnapshot | null {
  const extraction = extractStructuredEmailData(message);
  const attachmentNames = dedupeStrings((message.attachments ?? []).map((attachment) => attachment.filename));
  const fields = {
    clientName: extraction.clientName,
    dateOfLoss: extraction.dateOfLoss,
    claimNumber: extraction.claimNumber,
    policyNumber: extraction.policyNumber,
    insuranceCarrier: extraction.insuranceCarrier,
  };
  const supportingSignals = dedupeStrings([
    fields.claimNumber ? `claim number (${Math.round(fields.claimNumber.confidence * 100)}%)` : null,
    fields.policyNumber ? `policy number (${Math.round(fields.policyNumber.confidence * 100)}%)` : null,
    fields.clientName ? `client name (${Math.round(fields.clientName.confidence * 100)}%)` : null,
    fields.dateOfLoss ? `date of loss (${Math.round(fields.dateOfLoss.confidence * 100)}%)` : null,
    fields.insuranceCarrier ? `insurance carrier (${Math.round(fields.insuranceCarrier.confidence * 100)}%)` : null,
  ]);

  if (!supportingSignals.length) {
    return null;
  }

  return {
    version: "email_automation_v1",
    extractedAt: new Date().toISOString(),
    source: {
      fromEmail: normalizeFieldValue(message.fromEmail),
      subject: normalizeFieldValue(message.subject),
      attachmentFileName: normalizeFieldValue(attachmentFileName ?? null),
      attachmentNames,
    },
    fields,
    matchSignals: {
      caseNumberCandidates: dedupeStrings([fields.claimNumber?.value, fields.policyNumber?.value]),
      clientNameCandidates: dedupeStrings([fields.clientName?.value]),
      supportingSignals,
    },
  };
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

/** Whether this attachment should be sent to the document ingest pipeline (PDFs only). */
function shouldIngestAttachment(filename: string, mimeType?: string | null): boolean {
  const lower = (filename || "").toLowerCase();
  if (lower.endsWith(".pdf")) return true;
  const mt = (mimeType || "").toLowerCase();
  if (mt === "application/pdf" || mt.startsWith("application/pdf;")) return true;
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

async function setDocumentEmailAutomation(
  firmId: string,
  documentId: string,
  snapshot: EmailAutomationSnapshot
): Promise<void> {
  const modulePath = "../services/" + "emailAutomation";
  try {
    const loaded = (await import(modulePath)) as {
      setDocumentEmailAutomation?: (
        firmId: string,
        documentId: string,
        snapshot: EmailAutomationSnapshot
      ) => Promise<void>;
    };
    if (typeof loaded.setDocumentEmailAutomation === "function") {
      await loaded.setDocumentEmailAutomation(firmId, documentId, snapshot);
      return;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/emailAutomation/i.test(message) && !/Cannot find module/i.test(message)) {
      throw error;
    }
  }

  const { rows } = await pgPool.query<{ meta_json: unknown }>(
    `select "metaJson" as meta_json from "Document" where id = $1 and "firmId" = $2 limit 1`,
    [documentId, firmId]
  );
  const existingMeta =
    rows[0]?.meta_json != null && typeof rows[0].meta_json === "object" && !Array.isArray(rows[0].meta_json)
      ? (rows[0].meta_json as Record<string, unknown>)
      : {};
  await pgPool.query(
    `update "Document" set "metaJson" = $3::jsonb where id = $1 and "firmId" = $2`,
    [documentId, firmId, JSON.stringify({ ...existingMeta, emailAutomation: snapshot })]
  );
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
  const emailAutomationEnabled = readEmailAutomationFlag();
  await ensureEmailMessageExtractionStorage();

  // Store metadata: sender (from_email), subject, receivedDate (received_at).
  // Also store is_fax and client_name_extracted for routing/display.
  for (const m of messages) {
    const extraction = extractStructuredEmailData(m);
    const { id: emailMessageId } = await upsertEmailMessageRecord({
      mailboxConnectionId: mb.id,
      message: m,
      extraction,
    });

    // Process all non-inline attachments (extract all; send only PDFs to ingest pipeline)
    const attachments = m.attachments ?? [];
    const attachmentNames = attachments.map((attachment) => attachment.filename);

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

        if (docId && emailAutomationEnabled) {
          const snapshot = buildEmailAutomationSnapshot(m, a.filename);
          if (snapshot) {
            snapshot.source.attachmentNames = attachmentNames;
            await setDocumentEmailAutomation(mb.firm_id, docId, snapshot);
          }
        }
      }

      const r = await pgPool.query(
        `
        insert into email_attachments
          (id, email_message_id, filename, mime_type, size_bytes, sha256, ingest_document_id)
        values
          ($1,$2,$3,$4,$5,$6,$7)
        on conflict (email_message_id, sha256) do nothing
        returning id
        `,
        [
          makeRawEmailId("emailatt"),
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
