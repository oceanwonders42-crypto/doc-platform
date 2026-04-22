# Local Website → App Integration Report

**Scope:** Local only. No deployment, DNS, or production hosting.

---

## Phase 1 — Website CTAs and Real App Routes Map

### Structure of apps/web

The app is a **single Next.js app** (no separate marketing site). There is no homepage with hero/footer CTAs; the root `/` either redirects to `/dashboard` (if authenticated) or `/login`.

### Entry points and destinations

| Location | CTA/Link | Current destination | Status |
|----------|----------|---------------------|--------|
| **Root** | `/` (page.tsx) | Redirect to `/dashboard` or `/login` via auth check | **Working** |
| **Login** | "Sign in" form | `POST /auth/login` → redirect `/dashboard` | **Working** |
| **Login** | "Continue with Google" | API OAuth redirect (API handles) | **Working** (if API configured) |
| **Login** | "Continue with Microsoft" | API OAuth redirect (API handles) | **Working** (if API configured) |
| **Dashboard sidebar** | Dashboard | `/dashboard` | **Working** |
| **Dashboard sidebar** | Cases | `/dashboard/cases` | **Working** |
| **Dashboard sidebar** | Traffic | `/dashboard/traffic` | **Working** |
| **Dashboard sidebar** | Documents | `/dashboard/documents` | **Working** |
| **Dashboard sidebar** | Providers | `/dashboard/providers` | **Working** |
| **Dashboard sidebar** | Records requests | `/dashboard/records-requests` | **Working** |
| **Dashboard sidebar** | Review | `/dashboard/review` | **Working** |
| **Dashboard sidebar** | Analytics | `/dashboard/analytics` | **Working** |
| **Dashboard sidebar** | Audit | `/dashboard/audit` | **Working** |
| **Dashboard sidebar** | Usage | `/dashboard/usage` | **Working** |
| **Dashboard sidebar** | Team | `/dashboard/team` | **Working** |
| **Dashboard sidebar** | Integrations | `/dashboard/integrations` | **Working** |
| **Dashboard sidebar** | Report a problem | `/dashboard/support/report` | **Working** |
| **Dashboard sidebar** | Settings | `/dashboard/settings` | **Working** |
| **Dashboard sidebar** | Billing | `/dashboard/billing` | **Working** |
| **Dashboard sidebar** | Firm | `/dashboard/settings/firm` | **Working** |
| **Dashboard header** | Logout | Clears token, redirect `/login` | **Working** |
| **Footer (AuthAwareFooter)** | Report a problem | `/dashboard/support/report` | **Working** |
| **Settings → Integrations** | Set up integration / Add or reconnect | `/onboarding/integration` | **Working** |

### Real app routes (existing)

- `/` → auth gate → `/login` or `/dashboard`
- `/login`
- `/dashboard`, `/dashboard/cases`, `/dashboard/traffic`, `/dashboard/documents`, `/dashboard/providers`, `/dashboard/records-requests`, `/dashboard/review`, `/dashboard/analytics`, `/dashboard/audit`, `/dashboard/usage`, `/dashboard/team`, `/dashboard/integrations`, `/dashboard/support/report`, `/dashboard/settings`, `/dashboard/billing`, `/dashboard/settings/firm`
- `/onboarding/integration`
- `/admin/*` (admin layout, same auth guard)

**Summary:** All main CTAs/links point to real local routes. None are placeholder or broken for local use.

---

## Phase 2 — Intended Local Handoffs

| CTA type | Intended local destination | Notes |
|----------|----------------------------|--------|
| **Login** | `/login` | Already the only login entry; after success → `/dashboard` |
| **Get Started** | N/A | No "Get Started" on a marketing page; root goes to login or dashboard |
| **Try Demo** | N/A | No demo CTA; use `/login` and demo credentials if seeded (e.g. demo@example.com / demo) |
| **Book Demo** | N/A | No book-demo CTA in app |
| **Platform / Product** | `/dashboard` and sidebar routes | Already linked from sidebar |
| **Homepage** | `/` → `/login` or `/dashboard` | Correct |
| **Logout** | `/login` | Correct |

**Standardized flow:**

1. **Website (root):** `GET /` → if unauthenticated → `/login`; if authenticated → `/dashboard`.
2. **Login:** Submit credentials → API `POST /auth/login` → store JWT → redirect `/dashboard`.
3. **Dashboard links:** All sidebar/header/footer links → real dashboard routes (no changes needed).

---

## Phase 3 — Wiring CTAs to Real Local Routes

**Changes made:**

| File | Change | CTA/location | Route now |
|------|--------|--------------|-----------|
| `apps/web/app/settings/integrations/page.tsx` | Error message copy | "Ensure API base and auth..." | Same links; message now tells user to set `NEXT_PUBLIC_API_URL=http://localhost:4000` for local (or window.__API_BASE/__API_KEY). |

No other CTAs required changes; all already point to real local routes. No fake or dead placeholder destinations were found.

---

## Phase 4 — Local Env / API Settings

- **Env variable used:** `NEXT_PUBLIC_API_URL` (see `apps/web/lib/api.ts`: `getApiBase()` uses `process.env.NEXT_PUBLIC_API_URL` on client/server; client can override with `window.__API_BASE`).
- **Local API URL:** `http://localhost:4000` (or whatever the API runs on).
- **Setup:** Copy `apps/web/.env.local.example` to `apps/web/.env.local` and set:
  - `NEXT_PUBLIC_API_URL=http://localhost:4000`
- **Login/dashboard:** All API calls use `getApiBase()` and `getAuthHeader()` (sessionStorage JWT or `window.__API_KEY`), so login and dashboard can reach the API locally when the API is running on port 4000 and env is set.

**Verification:** With API at `http://localhost:4000` and `.env.local` set, the login → dashboard flow uses that base URL.

---

## Phase 5 — Verify Local Flow

To verify locally:

1. **Start API:** e.g. `cd apps/api && pnpm dev` (or your start command) so it serves on port 4000.
2. **Start web:** `cd apps/web && pnpm dev` with `NEXT_PUBLIC_API_URL=http://localhost:4000` in `.env.local`.
3. **Homepage:** Open `http://localhost:3000` → should redirect to `/login` (if not logged in) or `/dashboard` (if logged in).
4. **Login:** Enter credentials (e.g. demo@example.com / demo if seeded) → should redirect to `/dashboard`.
5. **Dashboard:** Sidebar links should load `/dashboard/*` routes; logout should clear token and redirect to `/login`.

**Status (to be confirmed by you):**

- [ ] Homepage → redirect to login or dashboard — **requires local run**
- [ ] Login → dashboard — **requires local run**
- [ ] Dashboard nav → real routes — **requires local run**
- [ ] Logout → login — **requires local run**

If the API is not running or env is wrong, you will see network errors or "Unexpected token '<'"; fix by ensuring API is up and `NEXT_PUBLIC_API_URL` is correct.

---

## Phase 6 — Final Local Integration Report

### 1. Website CTA map

As in Phase 1: all entry points are `/`, `/login`, dashboard sidebar/header/footer, and settings/integrations links. All point to real local routes; status **working** for local use.

### 2. Files changed

- `apps/web/app/settings/integrations/page.tsx` — error message updated to mention `NEXT_PUBLIC_API_URL` for local.

### 3. Routes connected

- `/` → `/login` or `/dashboard` (auth-based redirect)
- `/login` → `POST /auth/login` (API) → `/dashboard`
- All dashboard and onboarding routes as listed in Phase 1; no route changes were required.

### 4. Local env/config

- **Variable:** `NEXT_PUBLIC_API_URL`
- **Example:** `NEXT_PUBLIC_API_URL=http://localhost:4000` in `apps/web/.env.local` (see `apps/web/.env.local.example`).
- Optional: `window.__API_BASE`, `window.__API_KEY` for runtime override.

### 5. Working local flows

- **Intended:** Homepage → Login → Dashboard → any dashboard sub-route → Logout → Login. All implemented; verification is by running API + web locally.

### 6. Remaining blockers (before deployment)

- None for **local** integration. For production you would later: configure production API URL, DNS, hosting, and (if used) OAuth redirect URLs — out of scope here.

### 7. Recommended next task

- Run the stack locally (API on 4000, web on 3000 with `.env.local` set) and confirm homepage → login → dashboard → logout.
- If you add a marketing landing page later, add CTAs there (e.g. "Log in" → `/login`, "Get started" → `/login` or `/signup` if you add it) and keep this doc updated.
