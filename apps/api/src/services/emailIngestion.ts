/**
 * Email ingestion: poll connected mailboxes (Prisma), fetch attachments, send to document pipeline.
 * Only attachments (PDFs) are processed. Logs events and failures to IntegrationSyncLog.
 * Does not modify existing document processing logic.
 */
import { prisma } from "../db/prisma";
import { decryptSecret } from "./credentialEncryption";
import {
  pollImapSinceUid,
  shouldUseLocalMailboxSandbox,
  type ImapConfig,
  type ImapSandboxConfig,
} from "../email/imapPoller";
import { ingestDocumentFromBuffer } from "./ingestFromBuffer";
import { extractEmailAutomationSnapshot } from "./emailAutomation";
import { isEmailAutomationAllowedForFirm } from "./featureCompatibility";
import { createNotification } from "./notifications";
import type { MailboxConnection } from "@prisma/client";
import type { FirmIntegration } from "@prisma/client";
import type { IntegrationCredential } from "@prisma/client";
import type { Prisma } from "@prisma/client";

type FirmIntegrationWithCreds = FirmIntegration & { credentials: IntegrationCredential[] };

type MailboxCredentialPayload = {
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  imapUsername: string;
  imapPassword: string;
  folder: string;
  sandboxMode?: ImapSandboxConfig["mode"] | null;
  sandboxLabel?: string | null;
  sandboxFixtureId?: string | null;
};

const MAX_MESSAGES_PER_POLL = 25;

type LocalMailboxSandboxScope = {
  mailboxId: string | null;
  firmId: string | null;
};

function normalizeScopeId(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function resolveLocalMailboxSandboxScope(): LocalMailboxSandboxScope {
  if (
    process.env.NODE_ENV === "production" ||
    process.env.ONYX_ENABLE_LOCAL_MAILBOX_SANDBOX !== "true"
  ) {
    return { mailboxId: null, firmId: null };
  }
  return {
    mailboxId: normalizeScopeId(process.env.ONYX_LOCAL_MAILBOX_SANDBOX_MAILBOX_ID),
    firmId: normalizeScopeId(process.env.ONYX_LOCAL_MAILBOX_SANDBOX_FIRM_ID),
  };
}

function isPdfAttachment(filename: string, mimeType?: string | null): boolean {
  const lower = (filename || "").toLowerCase();
  if (lower.endsWith(".pdf")) return true;
  const mt = (mimeType || "").toLowerCase();
  return mt === "application/pdf" || mt.startsWith("application/pdf;");
}

/** Ingestible for scanner-to-email: PDF and common scanned image types (TIFF, JPEG). */
function isIngestibleAttachment(filename: string, mimeType?: string | null): boolean {
  if (isPdfAttachment(filename, mimeType)) return true;
  const lower = (filename || "").toLowerCase();
  const mt = (mimeType || "").toLowerCase();
  if (lower.endsWith(".tif") || lower.endsWith(".tiff") || mt === "image/tiff" || mt.startsWith("image/tiff;")) return true;
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg") || mt === "image/jpeg" || mt.startsWith("image/jpeg;")) return true;
  return false;
}

export type PollMailboxResult = {
  ok: boolean;
  mailboxId: string;
  firmId: string;
  messagesProcessed: number;
  attachmentsIngested: number;
  error?: string;
};

export type PollMailboxScope = {
  firmId?: string;
  mailboxId?: string;
};

/**
 * Poll a single mailbox: fetch new messages, ingest PDF attachments, update cursor and lastSyncAt.
 */
export async function pollMailbox(mailbox: MailboxConnection, integration: FirmIntegrationWithCreds | null): Promise<PollMailboxResult> {
  const { id: mailboxId, firmId, integrationId } = mailbox;
  let credentials: MailboxCredentialPayload;
  if (integrationId && integration?.credentials?.length) {
    try {
      credentials = JSON.parse(decryptSecret(integration.credentials[0].encryptedSecret));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await prisma.integrationSyncLog.create({
        data: { firmId, integrationId, eventType: "sync", status: "error", message: `Decrypt failed: ${msg}` },
      });
      return { ok: false, mailboxId, firmId, messagesProcessed: 0, attachmentsIngested: 0, error: msg };
    }
  } else {
    return { ok: false, mailboxId, firmId, messagesProcessed: 0, attachmentsIngested: 0, error: "No credentials" };
  }

  const lastUid = mailbox.lastUid ? parseInt(mailbox.lastUid, 10) : null;
  if (mailbox.lastUid != null && Number.isNaN(lastUid)) {
    await prisma.integrationSyncLog.create({
      data: { firmId, integrationId: integration!.id, eventType: "sync", status: "error", message: "Invalid lastUid" },
    });
    return { ok: false, mailboxId, firmId, messagesProcessed: 0, attachmentsIngested: 0, error: "Invalid lastUid" };
  }

  let messages: Awaited<ReturnType<typeof pollImapSinceUid>>["messages"];
  let highestUid: number | null;
  const pollConfig: ImapConfig = {
    host: credentials.imapHost,
    port: credentials.imapPort || 993,
    secure: credentials.imapSecure ?? true,
    auth: { user: credentials.imapUsername, pass: credentials.imapPassword },
    mailbox: credentials.folder || "INBOX",
    sandbox:
      credentials.sandboxMode === "local_imap_fixture"
        ? {
            mode: "local_imap_fixture",
            label: credentials.sandboxLabel,
            fixtureId: credentials.sandboxFixtureId,
          }
        : undefined,
  };
  try {
    const out = await pollImapSinceUid(pollConfig, lastUid, MAX_MESSAGES_PER_POLL);
    messages = out.messages;
    highestUid = out.highestUid;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await prisma.integrationSyncLog.create({
      data: { firmId, integrationId: integration!.id, eventType: "sync", status: "error", message: msg },
    });
    await prisma.firmIntegration.update({
      where: { id: integration!.id },
      data: { status: "ERROR" },
    }).catch(() => {});
    createNotification(firmId, "mailbox_poll_failed", "Mailbox poll failed", `Poll failed for ${mailbox.emailAddress}: ${msg.slice(0, 200)}`, { mailboxId }).catch(() => {});
    return { ok: false, mailboxId, firmId, messagesProcessed: 0, attachmentsIngested: 0, error: msg };
  }

  if (shouldUseLocalMailboxSandbox(pollConfig)) {
    const fixtureId = pollConfig.sandbox?.fixtureId?.trim() || "default";
    const label = pollConfig.sandbox?.label?.trim() || "Local mailbox sandbox";
    await prisma.integrationSyncLog.create({
      data: {
        firmId,
        integrationId: integration!.id,
        eventType: "mailbox_sandbox_poll",
        status: "success",
        message: `Local mailbox sandbox fixture=${fixtureId} label="${label}" realNetworkCall=false messages=${messages.length}`,
      },
    }).catch(() => {});
  }

  let attachmentsIngested = 0;
  const firm = await prisma.firm.findUnique({
    where: { id: firmId },
    select: { id: true, plan: true },
  });
  const emailAutomationAllowed = firm
    ? isEmailAutomationAllowedForFirm(firm)
    : false;
  for (const m of messages) {
    const attachmentNames = (m.attachments ?? []).map((attachment) => attachment.filename);
    for (const a of m.attachments ?? []) {
      if (!a?.content || !a.filename) continue;
      if (!isIngestibleAttachment(a.filename, a.mimeType)) continue;
      const externalId = `integration:${mailboxId}:${m.uid}:${a.filename}`;
      const content = Buffer.isBuffer(a.content) ? a.content : Buffer.from(a.content as ArrayBuffer);
      const emailAutomation = emailAutomationAllowed
        ? extractEmailAutomationSnapshot({
            fromEmail: m.fromEmail,
            subject: m.subject,
            bodyText: m.bodyText,
            attachmentFileName: a.filename,
            attachmentNames,
          })
        : null;
      const result = await ingestDocumentFromBuffer({
        firmId,
        buffer: content,
        originalName: a.filename,
        mimeType: a.mimeType || "application/pdf",
        source: "email",
        externalId,
        metaJsonPatch: emailAutomation ? { emailAutomation } : undefined,
      });
      if (result.ok) {
        attachmentsIngested++;
        await prisma.integrationSyncLog.create({
          data: {
            firmId,
            integrationId: integration!.id,
            eventType: "attachment_ingested",
            status: "success",
            message: `Document ${result.documentId} from ${a.filename}`,
          },
        }).catch(() => {});
        try {
          const { tryMatchDocumentToRecordsRequest } = await import("./recordsRequestResponseMatcher");
          await tryMatchDocumentToRecordsRequest({
            firmId,
            documentId: result.documentId,
            referenceTokens: m.subject ? [m.subject] : undefined,
          });
        } catch (_) {
          // non-fatal: matching is best-effort
        }
      } else {
        await prisma.integrationSyncLog.create({
          data: {
            firmId,
            integrationId: integration!.id,
            eventType: "attachment_ingested",
            status: "error",
            message: result.error ?? "Ingest failed",
          },
        }).catch(() => {});
      }
    }
  }

  const now = new Date();
  await prisma.mailboxConnection.update({
    where: { id: mailboxId },
    data: { lastSyncAt: now, lastUid: highestUid != null ? String(highestUid) : mailbox.lastUid },
  });
  await prisma.integrationSyncLog.create({
    data: {
      firmId,
      integrationId: integration!.id,
      eventType: "sync",
      status: "success",
      message: `Processed ${messages.length} messages, ${attachmentsIngested} attachments ingested`,
    },
  }).catch(() => {});

  return {
    ok: true,
    mailboxId,
    firmId,
    messagesProcessed: messages.length,
    attachmentsIngested,
  };
}

/**
 * Poll all active mailboxes for a firm (or all firms). Used by integration sync worker.
 */
export async function pollAllActiveMailboxes(
  scope: PollMailboxScope = {}
): Promise<PollMailboxResult[]> {
  const sandboxScope = resolveLocalMailboxSandboxScope();
  const effectiveFirmId = scope.firmId ?? sandboxScope.firmId;
  const effectiveMailboxId = scope.mailboxId ?? sandboxScope.mailboxId;
  const where: Prisma.MailboxConnectionWhereInput = {
    active: true,
    ...(effectiveFirmId ? { firmId: effectiveFirmId } : {}),
    ...(effectiveMailboxId ? { id: effectiveMailboxId } : {}),
  };
  const mailboxes = await prisma.mailboxConnection.findMany({
    where,
    include: {
      integration: { include: { credentials: true } },
    },
  });
  const results: PollMailboxResult[] = [];
  for (const mb of mailboxes) {
    const r = await pollMailbox(mb, mb.integration ?? null);
    results.push(r);
  }
  return results;
}
