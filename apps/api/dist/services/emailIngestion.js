"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.pollMailbox = pollMailbox;
exports.pollAllActiveMailboxes = pollAllActiveMailboxes;
/**
 * Email ingestion: poll connected mailboxes (Prisma), fetch attachments, send to document pipeline.
 * Only attachments (PDFs) are processed. Logs events and failures to IntegrationSyncLog.
 * Does not modify existing document processing logic.
 */
const prisma_1 = require("../db/prisma");
const credentialEncryption_1 = require("./credentialEncryption");
const imapPoller_1 = require("../email/imapPoller");
const ingestFromBuffer_1 = require("./ingestFromBuffer");
const notifications_1 = require("./notifications");
const MAX_MESSAGES_PER_POLL = 25;
function isPdfAttachment(filename, mimeType) {
    const lower = (filename || "").toLowerCase();
    if (lower.endsWith(".pdf"))
        return true;
    const mt = (mimeType || "").toLowerCase();
    return mt === "application/pdf" || mt.startsWith("application/pdf;");
}
/** Ingestible for scanner-to-email: PDF and common scanned image types (TIFF, JPEG). */
function isIngestibleAttachment(filename, mimeType) {
    if (isPdfAttachment(filename, mimeType))
        return true;
    const lower = (filename || "").toLowerCase();
    const mt = (mimeType || "").toLowerCase();
    if (lower.endsWith(".tif") || lower.endsWith(".tiff") || mt === "image/tiff" || mt.startsWith("image/tiff;"))
        return true;
    if (lower.endsWith(".jpg") || lower.endsWith(".jpeg") || mt === "image/jpeg" || mt.startsWith("image/jpeg;"))
        return true;
    return false;
}
/**
 * Poll a single mailbox: fetch new messages, ingest PDF attachments, update cursor and lastSyncAt.
 */
async function pollMailbox(mailbox, integration) {
    const { id: mailboxId, firmId, integrationId } = mailbox;
    let credentials;
    if (integrationId && integration?.credentials?.length) {
        try {
            credentials = JSON.parse((0, credentialEncryption_1.decryptSecret)(integration.credentials[0].encryptedSecret));
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            await prisma_1.prisma.integrationSyncLog.create({
                data: { firmId, integrationId, eventType: "sync", status: "error", message: `Decrypt failed: ${msg}` },
            });
            return { ok: false, mailboxId, firmId, messagesProcessed: 0, attachmentsIngested: 0, error: msg };
        }
    }
    else {
        return { ok: false, mailboxId, firmId, messagesProcessed: 0, attachmentsIngested: 0, error: "No credentials" };
    }
    const lastUid = mailbox.lastUid ? parseInt(mailbox.lastUid, 10) : null;
    if (mailbox.lastUid != null && Number.isNaN(lastUid)) {
        await prisma_1.prisma.integrationSyncLog.create({
            data: { firmId, integrationId: integration.id, eventType: "sync", status: "error", message: "Invalid lastUid" },
        });
        return { ok: false, mailboxId, firmId, messagesProcessed: 0, attachmentsIngested: 0, error: "Invalid lastUid" };
    }
    let messages;
    let highestUid;
    try {
        const out = await (0, imapPoller_1.pollImapSinceUid)({
            host: credentials.imapHost,
            port: credentials.imapPort || 993,
            secure: credentials.imapSecure ?? true,
            auth: { user: credentials.imapUsername, pass: credentials.imapPassword },
            mailbox: credentials.folder || "INBOX",
        }, lastUid, MAX_MESSAGES_PER_POLL);
        messages = out.messages;
        highestUid = out.highestUid;
    }
    catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await prisma_1.prisma.integrationSyncLog.create({
            data: { firmId, integrationId: integration.id, eventType: "sync", status: "error", message: msg },
        });
        await prisma_1.prisma.firmIntegration.update({
            where: { id: integration.id },
            data: { status: "ERROR" },
        }).catch(() => { });
        (0, notifications_1.createNotification)(firmId, "mailbox_poll_failed", "Mailbox poll failed", `Poll failed for ${mailbox.emailAddress}: ${msg.slice(0, 200)}`, { mailboxId }).catch(() => { });
        return { ok: false, mailboxId, firmId, messagesProcessed: 0, attachmentsIngested: 0, error: msg };
    }
    let attachmentsIngested = 0;
    for (const m of messages) {
        for (const a of m.attachments ?? []) {
            if (!a?.content || !a.filename)
                continue;
            if (!isIngestibleAttachment(a.filename, a.mimeType))
                continue;
            const externalId = `integration:${mailboxId}:${m.uid}:${a.filename}`;
            const content = Buffer.isBuffer(a.content) ? a.content : Buffer.from(a.content);
            const result = await (0, ingestFromBuffer_1.ingestDocumentFromBuffer)({
                firmId,
                buffer: content,
                originalName: a.filename,
                mimeType: a.mimeType || "application/pdf",
                source: "email",
                externalId,
            });
            if (result.ok) {
                attachmentsIngested++;
                await prisma_1.prisma.integrationSyncLog.create({
                    data: {
                        firmId,
                        integrationId: integration.id,
                        eventType: "attachment_ingested",
                        status: "success",
                        message: `Document ${result.documentId} from ${a.filename}`,
                    },
                }).catch(() => { });
                try {
                    const { tryMatchDocumentToRecordsRequest } = await Promise.resolve().then(() => __importStar(require("./recordsRequestResponseMatcher")));
                    await tryMatchDocumentToRecordsRequest({
                        firmId,
                        documentId: result.documentId,
                        referenceTokens: m.subject ? [m.subject] : undefined,
                    });
                }
                catch (_) {
                    // non-fatal: matching is best-effort
                }
            }
            else {
                await prisma_1.prisma.integrationSyncLog.create({
                    data: {
                        firmId,
                        integrationId: integration.id,
                        eventType: "attachment_ingested",
                        status: "error",
                        message: result.error ?? "Ingest failed",
                    },
                }).catch(() => { });
            }
        }
    }
    const now = new Date();
    await prisma_1.prisma.mailboxConnection.update({
        where: { id: mailboxId },
        data: { lastSyncAt: now, lastUid: highestUid != null ? String(highestUid) : mailbox.lastUid },
    });
    await prisma_1.prisma.integrationSyncLog.create({
        data: {
            firmId,
            integrationId: integration.id,
            eventType: "sync",
            status: "success",
            message: `Processed ${messages.length} messages, ${attachmentsIngested} attachments ingested`,
        },
    }).catch(() => { });
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
async function pollAllActiveMailboxes(firmId) {
    const mailboxes = await prisma_1.prisma.mailboxConnection.findMany({
        where: { active: true, ...(firmId ? { firmId } : {}) },
        include: {
            integration: { include: { credentials: true } },
        },
    });
    const results = [];
    for (const mb of mailboxes) {
        const r = await pollMailbox(mb, mb.integration ?? null);
        results.push(r);
    }
    return results;
}
