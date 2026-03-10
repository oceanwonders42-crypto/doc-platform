# Demo Lead Capture — Deliverables

## 1. Files changed

| File | Change |
|------|--------|
| `prisma/schema.prisma` | **Created.** Lead model (id, createdAt, firstName, lastName, email, phone, firm, cms?, firmSize?, message?, source?). |
| `prisma/migrations/20260307055435_add_lead_table/migration.sql` | **Created.** SQLite migration for `Lead` table. |
| `src/lib/db.ts` | **Created.** Prisma client singleton for Next.js. |
| `src/app/api/leads/route.ts` | **Created.** POST handler: validation, honeypot, rate limit, DB save, email fallback. |
| `src/components/DemoForm.tsx` | **Updated.** Safer `res.json()` handling (try/catch) so non-JSON responses don’t break the form. |
| `package.json` | **Updated.** Prisma pinned to `5.22.0` (was 7.x) for classic schema; added `postinstall: "prisma generate"`. |
| `.env.example` | **Created.** Documents `DATABASE_URL`, `RESEND_*`, `LEAD_NOTIFICATION_EMAIL`. |

**Forms that submit to `/api/leads`:**  
- `src/components/DemoForm.tsx` (used on `/` and `/demo`).  
- `src/components/DemoForm 2.tsx` is an unused duplicate and was not changed.

---

## 2. Route created

- **Method/URL:** `POST /api/leads`
- **Location:** `src/app/api/leads/route.ts`
- **Behavior:**
  - Parses JSON body.
  - Validates required fields: `firstName`, `lastName`, `email`, `phone`, `firm`.
  - Validates email format.
  - **Honeypot:** if `website` is non-empty, returns `200 { success: true }` without saving.
  - **Rate limit:** 5 requests per IP per 60 seconds; returns `429` with message if exceeded.
  - Saves to DB when `DATABASE_URL` is set; on DB failure or when `DATABASE_URL` is missing, sends email via Resend (if `RESEND_API_KEY` and `LEAD_NOTIFICATION_EMAIL` are set) and/or logs to console.
  - Returns `200 { success: true }` on success, `400` with `error` and optional `fields` on validation error, `429` for rate limit, `503` if neither DB nor email succeeded.

---

## 3. Schema / model

- **Prisma schema:** `prisma/schema.prisma`
- **Model:** `Lead`
  - `id` (String, cuid, primary key)
  - `createdAt` (DateTime, default now())
  - `firstName`, `lastName`, `email`, `phone`, `firm` (String, required)
  - `cms`, `firmSize`, `message`, `source` (String, optional; `source` default `"demo"`)
- **Database:** SQLite by default (`file:./prisma/dev.db`). Can switch to PostgreSQL by changing `provider` and `DATABASE_URL`.

---

## 4. Test steps

1. **Env**
   - Copy `.env.example` to `.env` (or ensure `.env` has at least one of the following).
   - For DB: set `DATABASE_URL="file:./prisma/dev.db"` (or your DB URL). Run `npx prisma migrate dev` if the table doesn’t exist yet.
   - For email fallback: set `RESEND_API_KEY`, `LEAD_NOTIFICATION_EMAIL`, and optionally `RESEND_FROM_EMAIL`.

2. **Run app**
   - `npm run dev`
   - Open `http://localhost:3000` or `http://localhost:3000/demo`.

3. **Happy path**
   - Fill: First name, Last name, Work email, Phone, Firm name (required).
   - Optionally: CMS, Firm size, Biggest workflow challenge.
   - Leave honeypot “Website” empty (hidden field).
   - Submit. Expect: loading state → success message “Request received” and “Our team will reach out within 24 hours.”
   - If using DB: check `npx prisma studio` or query `Lead` table to see the new row.

4. **Validation**
   - Submit with one required field empty. Expect: 400, error message, and that field highlighted.
   - Submit with invalid email (e.g. `notanemail`). Expect: 400 and email error.

5. **Honeypot**
   - Use devtools or a script to set the hidden `website` field to any value and submit. Expect: 200 and success UI, but no new row in DB and no email.

6. **Rate limit**
   - Send 6+ valid requests from the same IP within 60 seconds. Expect: after the 5th success, the 6th returns 429 and the form shows “Too many requests. Please try again in a minute.”

7. **No DB / no email**
   - Unset `DATABASE_URL` and leave Resend env vars unset (or use invalid keys). Submit. Expect: 503 and form error “We could not save your request right now…”.

---

## 5. Env vars

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | No (but preferred) | DB connection. SQLite: `file:./prisma/dev.db`. PostgreSQL: `postgresql://user:pass@host:5432/dbname`. If missing, lead is only sent via Resend (if configured) or logged. |
| `RESEND_API_KEY` | No | Resend API key. Used when DB is unavailable or not configured. |
| `LEAD_NOTIFICATION_EMAIL` | No | Email address that receives lead notifications when using Resend. |
| `RESEND_FROM_EMAIL` | No | “From” address for Resend. Must be verified in Resend. Defaults to `onboarding@resend.dev` (Resend’s sandbox). |

**Minimum for leads to be stored:** set `DATABASE_URL` and run migrations.  
**Minimum for leads to be received without DB:** set `RESEND_API_KEY` and `LEAD_NOTIFICATION_EMAIL`.
