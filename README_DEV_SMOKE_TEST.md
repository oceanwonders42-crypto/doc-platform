# Dev Smoke Test Checklist

Run through this checklist to validate core UI flows in ~2 minutes after generating demo data.

## Prerequisites

1. **API + Web running**
   ```bash
   cd apps/api && pnpm dev     # Terminal 1, port 4000
   cd apps/web && pnpm dev     # Terminal 2, port 3000
   ```

2. **Generate demo data**
   - Open http://localhost:3000/dashboard
   - Click **"Generate demo data"** (dev-only button)
   - Or: `cd apps/api && pnpm run seed:demo:http`

3. **Confirm DOC_API_KEY** in `apps/web/.env.local` matches an API key for the seeded firm.

---

## Smoke Test Steps

### 1. Dashboard loads and lists docs
- [ ] Open http://localhost:3000/dashboard
- [ ] Page loads without error
- [ ] "Recent documents" table shows ~10 demo documents
- [ ] Filter dropdowns work (All / Stuck, All / Has Offer)

### 2. Offer badge appears on 2 docs
- [ ] Set filter to **"Has Offer"**
- [ ] At least 2 documents show the blue **"Offer: $50,000"** badge
- [ ] Switch back to "All" to see full list

### 3. Case column links work (from dashboard documents)
- [ ] Documents section shows document names as links
- [ ] Some docs have case links (routed docs)
- [ ] Click a document name → document detail page loads

### 4. Review queue and Preview drawer
- [ ] Click **Review queue** in the nav
- [ ] http://localhost:3000/dashboard/review loads
- [ ] Queue shows NEEDS_REVIEW documents with suggested case
- [ ] Click a document row → Preview drawer opens on the right
- [ ] Drawer shows document metadata, recognition, suggested case link

### 5. Confirm/Reject/Route moves docs and auto-advances
- [ ] With Preview drawer open, click **Confirm** (or **Route** if suggested case exists)
- [ ] Document is routed, drawer closes or advances to next
- [ ] Click **Reject** on a document → it is rejected, queue updates
- [ ] Confirm/Reject buttons work without breaking the UI

### 6. Case detail page and documents list
- [ ] From Review queue, click a **Case** link (e.g. "DEMO-001 – Smith v. State Farm")
- [ ] Or: Open /cases/{id} (demo uses demo-case-1, demo-case-2, demo-case-3)
- [ ] Case page loads: title, case number (e.g. DEMO-001), client name
- [ ] "Documents" section lists documents linked to this case
- [ ] "Medical Timeline" link is visible

### 7. Timeline renders events
- [ ] Click **Medical Timeline** (or open /cases/{id}/timeline)
- [ ] Timeline page loads
- [ ] At least one event appears (e.g. "Records received", "Settlement offer")
- [ ] Events show provider, document, date

### 8. Narrative generation (if feature enabled)
- [ ] Open case page: /cases/{id}
- [ ] If "Demand narratives" feature is enabled: "Generate narrative" or similar control appears
- [ ] Click to generate → narrative text loads (or spinner then text)
- [ ] If feature disabled: step can be skipped

---

## Quick Reference

| Screen        | URL                          |
|---------------|------------------------------|
| Dashboard     | /dashboard                   |
| Review queue  | /dashboard/review            |
| Case detail   | /cases/{id} (demo: demo-case-1, demo-case-2, demo-case-3) |
| Timeline      | /cases/{id}/timeline         |
| Narrative     | /cases/{id}/narrative (page or section) |

Demo labels show as "DEMO-001", "DEMO-002", "DEMO-003" (case number) with titles like "Smith v. State Farm".

---

## Kill API on port 4000

To forcefully stop the API process when it's stuck or needs a restart:

```bash
lsof -nP -iTCP:4000 -sTCP:LISTEN
kill -9 <PID_NUMBER>
```

Replace `<PID_NUMBER>` with the actual number from the first column of `lsof` output. Do not type the angle brackets.

---

## Set DOC_API_KEY in terminal

For `curl` and other terminal commands that need the API key, set it in your shell (zsh/bash):

```bash
export DOC_API_KEY="sk_live_..."
```

Then use it in curl:

```bash
curl -s -H "Authorization: Bearer $DOC_API_KEY" http://127.0.0.1:4000/cases
```

If you see **"Missing Authorization"**, your `DOC_API_KEY` env var is empty—re-run the `export` with your actual key.

---

## Troubleshooting

- **No "Generate demo data" button**  
  Shown only when `NODE_ENV !== "production"` or `DEMO_MODE=true`. In dev, `pnpm dev` sets NODE_ENV=development.

- **401 on demo seed**  
  Ensure `DOC_API_KEY` in `apps/web/.env.local` is valid for the firm. Create key via `POST /dev/create-api-key/:firmId` if needed.

- **Empty dashboard after seed**  
  Run `pnpm run seed:demo:http` from apps/api with API running. Check `DOC_API_KEY` in apps/api/.env matches apps/web/.env.local.
