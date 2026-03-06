"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.pollImapSinceUid = pollImapSinceUid;
exports.sha256 = sha256;
exports.testImapConnection = testImapConnection;
const imapflow_1 = require("imapflow");
const crypto_1 = __importDefault(require("crypto"));
const mailparser_1 = require("mailparser");
function bufFromSource(src) {
    if (!src)
        return Promise.resolve(Buffer.alloc(0));
    if (Buffer.isBuffer(src))
        return Promise.resolve(src);
    // src can be a stream (async iterable)
    return (async () => {
        const chunks = [];
        for await (const ch of src)
            chunks.push(Buffer.isBuffer(ch) ? ch : Buffer.from(ch));
        return Buffer.concat(chunks);
    })();
}
async function pollImapSinceUid(cfg, lastUid, maxMessages = 25) {
    const client = new imapflow_1.ImapFlow({
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
        const messages = [];
        let highestUid = null;
        // ✅ IMPORTANT: fetch by UID using { uid: range } selector
        const selector = { uid: range };
        for await (const msg of client.fetch(selector, {
            uid: true,
            envelope: true,
            internalDate: true,
            headers: true,
            source: true, // full RFC822 so attachments parsing is reliable
        })) {
            const uid = Number(msg.uid);
            highestUid = highestUid ? Math.max(highestUid, uid) : uid;
            const raw = await bufFromSource(msg.source);
            const parsed = await (0, mailparser_1.simpleParser)(raw);
            const fromEmail = parsed.from?.value?.[0]?.address ||
                msg.envelope?.from?.[0]?.address ||
                undefined;
            const subject = parsed.subject || msg.envelope?.subject || undefined;
            const providerMessageId = (parsed.messageId?.trim() ||
                parsed.headers?.get?.("message-id")?.trim() ||
                `imap-uid:${uid}`);
            // Extract only non-inline attachments (ignore inline images; send PDFs to ingest).
            const attachments = (parsed.attachments || [])
                .filter((att) => att.contentDisposition !== "inline")
                .map((att) => ({
                filename: att.filename || "attachment",
                mimeType: att.contentType || "application/octet-stream",
                content: Buffer.isBuffer(att.content) ? att.content : Buffer.from(att.content),
            }));
            // Skip if no attachments
            console.log(`[imap] uid=${uid} subject="${subject || ""}" attachments=${attachments.length}`);
            if (!attachments.length)
                continue;
            messages.push({
                uid,
                providerMessageId,
                fromEmail,
                subject,
                sentAt: parsed.date || undefined,
                receivedAt: msg.internalDate || undefined,
                attachments,
                rawHeaders: Object.fromEntries(parsed.headers?.entries?.() || []),
            });
            if (messages.length >= maxMessages)
                break;
        }
        console.log(`[imap] fetched messages=${messages.length} highestUid=${highestUid ?? "null"}`);
        return { messages, highestUid };
    }
    finally {
        try {
            await client.logout();
        }
        catch { }
    }
}
function sha256(buf) {
    return crypto_1.default.createHash("sha256").update(buf).digest("hex");
}
/** Test IMAP connection and mailbox open without fetching messages. */
async function testImapConnection(cfg) {
    const client = new imapflow_1.ImapFlow({
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
    }
    catch (err) {
        const msg = String(err?.message || err?.stack || err);
        return { ok: false, error: msg };
    }
}
