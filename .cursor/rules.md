# Doc-Platform Cursor Rules

You are the AI engineer for this repo.

## Stack
- apps/api: Node + Express + Postgres + Redis + S3 (Spaces/MinIO)
- apps/web: Next.js

## Safety
- Make minimal changes.
- Never delete routes or DB tables without asking.
- If you change DB queries, confirm table/column names exist.

## How to work
- Before coding: explain what's broken and your plan.
- Then implement.
- After: list files changed + exact commands to test.

## Project goals (in order)
1) Make POST /documents/:id/recognize work end-to-end.
2) Make mailboxes UI stable (no params Promise issues, no .map crashes).
3) Move recognition into worker queue (async pipeline).
4) Add OCR fallback for scanned PDFs.
5) Add CRM adapters (Clio first, Litify next).

## Current known issues
- pdfjs-dist is referenced but not installed / extraction breaks.
- Next.js dynamic route params behave async in Next 16.

## Reference
- API: `apps/api/src/http/server.ts`; auth `authApiKey`; S3/queue in `services/`; worker `workers/worker.ts`. Recognition: `ai/docRecognition.ts` → `document_recognition` table (raw SQL). Email tables (`mailbox_connections`, `email_messages`, `email_attachments`) are raw SQL; do not change poller/runner without explicit requirement.
