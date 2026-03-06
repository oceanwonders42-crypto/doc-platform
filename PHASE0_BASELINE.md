# Phase 0 — Baseline

## 1) Where defined/used

| Item | Defined | Used |
|------|--------|------|
| **/ingest** | `apps/api/src/http/server.ts` L58: `app.post("/ingest", authApiKey, upload.single("file"), ...)` | `apps/api/src/email/emailIngestRunner.ts` (callIngest → INGEST_URL); `apps/web/app/api/ingest/route.ts` (proxy); `apps/web/app/dashboard/UploadBox.tsx` (fetch `/api/ingest`) |
| **POST /documents/:id/recognize** | `apps/api/src/http/server.ts` L152: `app.post("/documents/:id/recognize", authApiKey, ...)` | — |
| **Document.spacesKey** | `apps/api/prisma/schema.prisma` (model Document); Prisma table name **"Document"** (PascalCase) | `server.ts`: ingest writes `spacesKey: key`; recognize selects `"spacesKey" as key` from `"Document"`; /me/documents returns spacesKey. Worker: `getObjectBuffer(doc.spacesKey)` |
| **document_recognition table** | `apps/api/create_recognition_table.js` (CREATE TABLE document_recognition) | `apps/api/src/http/server.ts` L195–213: INSERT/ON CONFLICT in recognize handler |
| **/mailboxes/:id/recent-ingests** | `apps/api/src/http/server.ts` L228: `app.get("/mailboxes/:id/recent-ingests", ...)` | `apps/web/app/mailboxes/[id]/recent-ingests/page.tsx` (fetch); `apps/web/app/mailboxes/page.tsx` (link) |

## 2) Current breakages and root causes

- **PDF text extraction:** `src/ai/docRecognition.ts` uses `require("pdfjs-dist/legacy/build/pdf.js")`. If `pdfjs-dist` is not installed or the path is wrong (e.g. v4 only has .mjs), runtime throws. **Root cause:** Dependency and/or path mismatch for Node/ts-node-dev.
- **"relation documents does not exist":** Raw SQL must use the **exact** Postgres identifier. Prisma creates table `"Document"` (quoted, PascalCase). Using `documents` (lowercase) causes this error. **Current code already uses "Document"** — no change needed if nothing uses `documents`.
- **Next 16 params:** In Next 16, `params` in dynamic routes can be a **Promise**. Accessing `params.id` without `await` yields a Promise, not a string. **Current code already uses `await params`** in recent-ingests — fixed.
- **.map on undefined:** If API returns `{ ok: false }` without `items`, `data.items` is undefined and `.map` crashes. **Current code uses `Array.isArray(data?.items) ? data.items : []`** — fixed.
- **Recognition not automatic:** Recognition only runs when calling POST /documents/:id/recognize. Worker does page count only; no recognition job. **Root cause:** No enqueue of recognition after ingest/upload; worker doesn’t run recognition.
