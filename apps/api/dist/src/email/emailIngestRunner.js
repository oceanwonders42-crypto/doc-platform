"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runEmailPollOnce = runEmailPollOnce;
require("dotenv/config");
const imapPoller_1 = require("./imapPoller");
const pg_1 = require("../db/pg");
// TODO: replace with real decrypt later. For now your existing behavior is plaintext.
function decryptMaybePlaintext(s) {
    return s;
}
async function runEmailPollOnce() {
    const { rows: mailboxes } = await pg_1.pgPool.query(`select * from mailbox_connections where status='active'`);
    console.log(`[email] runEmailPollOnce: active mailboxes=${mailboxes.length}`);
    for (const mb of mailboxes) {
        console.log("[email] polling", {
            mailboxId: mb.id,
            provider: mb.provider,
            host: mb.imap_host,
            user: mb.imap_username,
        });
        try {
            if (mb.provider === "imap" || mb.provider === "gmail") {
                await handleImapMailbox(mb);
            }
            else {
                console.log("[email] unsupported provider, skipping:", mb.provider);
            }
            await pg_1.pgPool.query(`update mailbox_connections
         set last_sync_at=now(), last_error=null, status='active', updated_at=now()
         where id=$1`, [mb.id]);
        }
        catch (err) {
            const msg = String(err?.stack || err?.message || err);
            await pg_1.pgPool.query(`update mailbox_connections
         set last_error=$2, status='active', updated_at=now()
         where id=$1`, [mb.id, msg]);
            console.error(`[email] mailbox ${mb.id} error:`, msg);
        }
    }
}
async function handleImapMailbox(mb) {
    if (!mb.imap_host || !mb.imap_username || !mb.imap_password_enc) {
        throw new Error("Mailbox missing imap_host/imap_username/imap_password_enc");
    }
    const pass = decryptMaybePlaintext(mb.imap_password_enc);
    const lastUid = mb.last_uid ? Number(mb.last_uid) : null;
    const { messages, highestUid } = await (0, imapPoller_1.pollImapSinceUid)({
        host: mb.imap_host,
        port: mb.imap_port ?? 993,
        secure: mb.imap_secure ?? true,
        auth: { user: mb.imap_username, pass },
        mailbox: mb.folder || "INBOX",
        tls: process.env.IMAP_TLS_REJECT_UNAUTHORIZED === "false" ? { rejectUnauthorized: false } : undefined,
    }, lastUid, 25);
    const newMessagesCount = messages.length;
    let attachmentsProcessed = 0;
    console.log("[email] mailbox result", {
        mailboxId: mb.id,
        provider: mb.provider,
        newMessagesFound: newMessagesCount,
        highestUid: highestUid ?? null,
        lastUidWas: lastUid,
    });
    // Process each message
    for (const m of messages) {
        // ---- EMAIL MESSAGE UPSERT (adjust table/columns if needed) ----
        // Expected fields in "m" from your imapPoller:
        //   m.uid (number), m.subject (string), m.fromEmail (string), m.date (Date/string), m.attachments (array)
        //
        // If your email_messages table/columns differ, change only this query.
        const { rows: msgRows } = await pg_1.pgPool.query(`
  insert into email_messages
    (mailbox_connection_id, provider_message_id, from_email, subject, received_at)
  values
    ($1, $2, $3, $4, now())
  on conflict (mailbox_connection_id, provider_message_id)
  do update set
    subject = excluded.subject,
    from_email = excluded.from_email
  returning id
  `, [
            mb.id,
            String(m.uid),
            m.fromEmail || null,
            m.subject || null,
        ]);
        const emailMessageId = msgRows[0]?.id;
        if (!emailMessageId) {
            throw new Error("Failed to upsert email_messages row (no id returned)");
        }
        // Process attachments
        const attachments = (m.attachments || []);
        for (const a of attachments) {
            if (!a?.content || !a.filename)
                continue;
            const hash = (0, imapPoller_1.sha256)(a.content);
            const externalId = `imap:${mb.id}:${String(m.uid)}:${a.filename}:${hash.slice(0, 12)}`;
            console.log(`[email] ingesting ${a.filename} subject=${JSON.stringify(m.subject || "")} from=${m.fromEmail || ""}`);
            // ✅ Skip BEFORE calling /ingest if already recorded for this email message
            const exists = await pg_1.pgPool.query(`select 1 from email_attachments where email_message_id=$1 and sha256=$2 limit 1`, [emailMessageId, hash]);
            if (exists.rowCount > 0) {
                console.log("[email] attachment already ingested, skipping", {
                    emailMessageId,
                    filename: a.filename,
                    sha256: hash,
                });
                continue;
            }
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
            const docId = ingest?.documentId || ingest?.id || null;
            const r = await pg_1.pgPool.query(`
        insert into email_attachments
          (email_message_id, filename, mime_type, size_bytes, sha256, ingest_document_id)
        values
          ($1,$2,$3,$4,$5,$6)
        on conflict (email_message_id, sha256) do nothing
        returning id
        `, [
                emailMessageId,
                a.filename || null,
                a.mimeType || null,
                a.content.length,
                hash,
                docId,
            ]);
            if (r.rowCount === 0) {
                console.log("[email] attachment already ingested, skipping", {
                    emailMessageId,
                    filename: a.filename,
                    sha256: hash,
                });
                continue;
            }
            attachmentsProcessed++;
            console.log("[email] ingested -> documentId=" + (docId || "?"));
        }
    }
    console.log("[email] mailbox done", {
        mailboxId: mb.id,
        provider: mb.provider,
        newMessagesFound: newMessagesCount,
        attachmentsProcessed,
    });
    // ✅ Save cursor ONCE at end so next poll only fetches new emails
    if (highestUid && (lastUid === null || highestUid > lastUid)) {
        await pg_1.pgPool.query(`update mailbox_connections set last_uid=$2, updated_at=now() where id=$1`, [mb.id, String(highestUid)]);
        console.log("[email] updated mailbox cursor", {
            mailboxId: mb.id,
            lastUid: highestUid,
        });
    }
}
async function callIngest(args) {
    const ingestUrl = process.env.INGEST_URL || "http://127.0.0.1:4000/ingest";
    const apiKey = process.env.INGEST_API_KEY;
    if (!apiKey)
        throw new Error("Missing INGEST_API_KEY");
    const form = new FormData();
    form.append("firmId", args.firmId);
    form.append("source", args.source);
    form.append("externalId", args.externalId);
    if (args.fromEmail)
        form.append("fromEmail", args.fromEmail);
    if (args.subject)
        form.append("subject", args.subject);
    const blob = new Blob([args.content], {
        type: args.mimeType || "application/octet-stream",
    });
    form.append("file", blob, args.filename);
    const res = await fetch(ingestUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
    });
    const text = await res.text();
    if (!res.ok)
        throw new Error(`Ingest failed ${res.status}: ${text}`);
    return JSON.parse(text);
}
