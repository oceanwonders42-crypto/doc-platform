# Email Intake v1 — Smoke test checklist

Scope: **LOCKED**. Do not change scope.

## Prerequisites

- API running (`pnpm dev` in `apps/api`)
- Worker running (`pnpm dev:worker` in `apps/api`)
- Email poller optional for “run once” step
- Web optional for “view recent ingests”
- `.env`: `INGEST_API_KEY` set to a valid firm API key (same as used for `/ingest`)
- A firm and API key (e.g. from `/dev/create-firm` and `/dev/create-api-key/:firmId`)

---

## 1. Create mailbox (curl)

```bash
export API_BASE="http://localhost:4000"
export API_KEY="sk_live_..."   # your firm's API key

curl -s -X POST "$API_BASE/mailboxes" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "imapHost": "imap.gmail.com",
    "imapPort": 993,
    "imapSecure": true,
    "imapUsername": "you@gmail.com",
    "imapPassword": "your-app-password",
    "folder": "INBOX"
  }'
```

Expected: `{"ok":true,"mailbox":{"id":"...","imapHost":"imap.gmail.com","imapUsername":"you@gmail.com","folder":"INBOX","status":"active"}}`  
Password must **not** appear in the response.

---

## 2. Test mailbox (curl)

```bash
export MAILBOX_ID="<id from step 1>"

curl -s -X POST "$API_BASE/mailboxes/$MAILBOX_ID/test" \
  -H "Authorization: Bearer $API_KEY"
```

Expected: `{"ok":true,"mailboxUidValidity":"...","lastUid":<number or null>}`  
On failure: `{"ok":false,"error":"..."}`.

---

## 3. Enable mailbox (curl)

```bash
curl -s -X POST "$API_BASE/mailboxes/$MAILBOX_ID/enable" \
  -H "Authorization: Bearer $API_KEY"
```

Expected: `{"ok":true}`. Sets `status='active'` and clears `last_error`.

---

## 4. Run poller once and expected logs

```bash
cd apps/api
pnpm email:once
```

Expected logs (conceptually):

- `[email] runEmailPollOnce: active mailboxes=1`
- `[email] polling` with mailboxId, provider, host, user
- `[imap] connecting to ...` then `opened mailbox=INBOX`
- Either new messages/attachments and `[email] ingesting ...` / `ingested -> documentId=...`, or no new messages
- `[email] mailbox done` and optionally `[email] updated mailbox cursor`
- No process crash; on error you should see `[email] mailbox <id> error:` and mailbox row updated to `status='error'` and `last_error` set

If `INGEST_API_KEY` is missing: one mailbox should get `last_error='Missing INGEST_API_KEY'` and `status='error'`, poller continues.

---

## 5. View recent ingests in web

1. Set in `apps/web/.env.local`: `DOC_API_URL=http://localhost:4000`, `DOC_API_KEY=<same API key>`.
2. Run web: `cd apps/web && pnpm dev`.
3. Open **Mailboxes** page (e.g. `/mailboxes`).
4. Click **View recent ingests →** for the mailbox.

Expected: Table of recent ingests (filename, subject, from, document id, date). Data comes from `email_attachments` + `email_messages` via API `GET /mailboxes/:id/recent-ingests`.

---

## End-to-end flow (confirm)

1. **Email attachment** → poller fetches message, gets attachment, computes sha256.
2. **Dedup** → skip if `email_attachments` already has same `email_message_id` + `sha256`.
3. **/ingest** → `POST` with `Authorization: Bearer ${INGEST_API_KEY}`; document created and enqueued.
4. **Worker** → processes job → Document created (and recognition/timeline as configured).
5. **Recent ingests** → row in `email_attachments` with `ingest_document_id`; “View recent ingests” shows it.

---

## Commands to run locally to verify

```bash
# Terminal 1: API
cd ./apps/api && pnpm dev

# Terminal 2: Worker
cd ./apps/api && pnpm dev:worker

# Terminal 3: Email poller (or once)
cd ./apps/api && pnpm email:poller
# or: pnpm email:once

# Terminal 4: Web
cd ./apps/web && pnpm dev
```

Then: create mailbox (curl), test (curl), enable (curl), run `pnpm email:once`, send test email with attachment to that mailbox, run poller again, open Mailboxes → View recent ingests.
