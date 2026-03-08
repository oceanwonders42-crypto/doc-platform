# AI Tasks – Doc Platform

Task backlog for AI/Cursor. Align with `.cursor/rules.md` (goals, safety, how to work).

---

## Goal 1: POST /documents/:id/recognize end-to-end

- [ ] **1.1** Install `pdfjs-dist` in `apps/api` and remove `pdf-parse` usage from recognition path.
- [ ] **1.2** Rewrite `apps/api/src/ai/docRecognition.ts`: single `extractTextFromPdf` using pdfjs-dist correctly (Node buffer → Uint8Array, legacy build if needed).
- [ ] **1.3** Ensure endpoint: finds Document (firm-scoped), downloads via `spacesKey`, extracts text, runs `classifyAndExtract`, saves to `document_recognition`. Add logs: documentId, storage key, extracted text length.
- [ ] **1.4** Manually test: create firm + API key, ingest a PDF, call `POST /documents/:id/recognize` with Bearer key, confirm 200 and row in `document_recognition`.

---

## Goal 2: Mailboxes UI stable

- [ ] **2.1** Fix Next 16 async params: `app/mailboxes/[id]/recent-ingests/page.tsx` (and any other dynamic routes) must `await params` before use; guard `params.id` before fetch.
- [ ] **2.2** Harden lists: ensure `.map` is only on arrays (e.g. `Array.isArray(data?.items) ? data.items : []`), avoid hardcoded `localhost:4000` (use env like dashboard).
- [ ] **2.3** Smoke test: open `/mailboxes`, click a mailbox, open recent ingests; no Promise/params errors, no .map crashes.

---

## Goal 3: Recognition in worker queue

- [ ] **3.1** Design: after worker sets document status to UPLOADED, enqueue a “recognize” job (e.g. Redis list `recognition_jobs`) or extend existing job payload; second worker or same worker processes recognition → `document_recognition` + optional Document fields.
- [ ] **3.2** Implement: queue job after page count (or new queue), worker pops and runs extraction + classifyAndExtract + DB write. Keep `POST /documents/:id/recognize` as optional on-demand trigger.
- [ ] **3.3** Test: ingest PDF, confirm recognition runs without calling the endpoint; verify row in `document_recognition`.

---

## Goal 4: OCR fallback for scanned PDFs

- [ ] **4.1** Decide: which OCR (e.g. Tesseract, cloud API) and where it runs (same process vs separate).
- [ ] **4.2** In recognition pipeline: if `extractTextFromPdf` returns too little text (e.g. length below threshold), run OCR on the same buffer and merge/use OCR text for classification + extraction.
- [ ] **4.3** Test: use a scanned (image-based) PDF; confirm fallback triggers and recognition result is stored.

---

## Goal 5: CRM adapters

- [ ] **5.1** Clio: add adapter (e.g. `apps/api/src/integrations/clio.ts` or similar), auth (API key or OAuth), map document + metadata to Clio matter/document API; call from recognition pipeline or dedicated “sync to CRM” step.
- [ ] **5.2** Store firm-level CRM config (e.g. provider, matter id, credentials) and set `Document.routedSystem` / `Document.routedCaseId` when sync succeeds.
- [ ] **5.3** Litify: same pattern after Clio is stable.

---

## Commands (reference)

```bash
# API
cd apps/api && pnpm run dev

# Worker
cd apps/api && pnpm run dev:worker

# Email poll (once)
cd apps/api && pnpm run email:once

# Web
cd apps/web && pnpm run dev
```

---

## Test commands & curl (Recognize)

**1. Install deps (includes pdfjs-dist):**
```bash
cd apps/api && pnpm install
```

**2. Start API** (from repo root or apps/api):
```bash
cd apps/api && pnpm run dev
```

**3. Create firm + API key** (one-time; use returned `id` and `apiKey`):
```bash
curl -s -X POST http://localhost:4000/dev/create-firm -H "Content-Type: application/json" -d '{"name":"Test Firm"}' | jq .
# → id: "clxx..."

curl -s -X POST http://localhost:4000/dev/create-api-key/YOUR_FIRM_ID -H "Content-Type: application/json" -d '{"name":"Ingest key"}' | jq .
# → apiKey: "sk_live_..."
```

**4. Ingest a PDF** (get `documentId` from response):
```bash
curl -s -X POST http://localhost:4000/ingest \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -F "file=@/path/to/sample.pdf" \
  -F "source=curl" | jq .
# → documentId: "clxx..."
```

**5. Call recognize:**
```bash
curl -s -X POST "http://localhost:4000/documents/YOUR_DOCUMENT_ID/recognize" \
  -H "Authorization: Bearer YOUR_API_KEY" | jq .
```

**6. Verify:** API logs should show `[recognize] { documentId, spacesKey, extractedTextLength }`. Check DB:
```sql
SELECT * FROM document_recognition WHERE document_id = 'YOUR_DOCUMENT_ID';
```

---

*Update this file when tasks are completed or new work is scoped.*
