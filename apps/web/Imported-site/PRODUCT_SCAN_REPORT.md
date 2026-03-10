# PRODUCT SCAN REPORT  
## Onyx Intel — Full Product + Website + MVP Scan

**Scope:** Codebase audit + inferred local app (Next.js on port 3000).  
**Note:** `/dashboard` does not exist in the repo; the “dashboard” is a static preview component only.

---

## 1. What already exists

| Area | Status | Details |
|------|--------|---------|
| **Marketing website** | Done | Single Next.js app with App Router, dark theme (primary #0B0B0C, section #121314, card #181A1B, accent blue #3B82F6, teal #14B8A6). |
| **Landing (home) page** | Done | Hero, Problem, Solution (with dashboard mock), Features, Platform Capabilities, Integrations, How it Works, Demo form, FAQ, Footer. |
| **Dedicated marketing pages** | Done | `/platform`, `/features`, `/product-tour`, `/integrations`, `/security`, `/pricing`, `/demo`, `/faq`. All use shared Header, Footer, PageCTA. |
| **Navigation** | Done | Header + Footer link to all major pages; “Request Demo” CTA in header. |
| **Copy and positioning** | Done | Clear PI-law focus: timelines, billing extraction, CMS sync, Clio/Filevine/etc. named. Problem/solution and benefit bullets are coherent. |
| **Demo form UI** | Done | Multi-field form (name, email, phone, firm, CMS, firm size, message), validation state, honeypot, loading state. |
| **Dashboard preview (mock)** | Done | Static `DashboardPreview` component: case ID, timeline, providers, billing summary, doc categories, “Synced to Clio” badge. Used on home, platform, features, product-tour. |
| **Integrations list** | Done | Clio, Filevine, Litify, MyCase, PracticePanther, Smokeball listed on integrations page and in copy. |
| **Security/trust copy** | Done | HIPAA-ready, SOC 2 Type II, BAA, audit trail, data residency mentioned on `/security` and in FAQ. |
| **Pricing page** | Done | Two tiers (Professional, Enterprise), “Custom” pricing, feature lists, CTAs to `/demo`. |
| **Dependencies** | Done | Next 16, React 19, Tailwind 4, Prisma + Resend in package.json (no Prisma schema or API routes implemented). |

---

## 2. What is partially built

| Area | Status | What’s there / What’s missing |
|------|--------|-------------------------------|
| **Lead capture** | Partial | Form exists and POSTs to `/api/leads`. **No `/api/leads` route in codebase** — submit will 404 and no lead is stored or sent. |
| **“Dashboard”** | Partial | Only a **static mock** (`DashboardPreview`) on marketing pages. No `/dashboard` route, no app shell, no real data or actions. |
| **Clio / CMS integration** | Partial | Mentioned everywhere in copy and “Synced to Clio” in mock. No integration code, no OAuth, no sync logic. |
| **Product workflow** | Partial | How it Works describes: Upload → AI process → Review & refine → Sync. No upload UI, no processing, no review queue, no real sync. |
| **Design system** | Partial | Dark theme applied; two components still use old light colors (`HowItWorks` connector line `#E5E7EB`, `PlatformOverview` light borders/backgrounds). One Tailwind typo in `DashboardPreview`: `bg-[#3B82F6/20]` (invalid); should be `bg-[#3B82F6]/20`. |
| **Prisma** | Partial | In package.json; no `schema.prisma` and no DB usage. |
| **Resend** | Partial | In package.json; no email sending code found. |

---

## 3. What is missing or broken

| Item | Severity | Notes |
|------|----------|--------|
| **`/dashboard` route** | Critical | **Does not exist.** User expectation (e.g. “dashboard at http://localhost:3000/dashboard”) cannot be met. Only a mock on marketing pages. |
| **`/api/leads`** | Critical | Demo form submits here; route is missing → 404 on submit, no lead capture. |
| **Review queue** | Missing | No route, no UI, no “review & refine” product surface. |
| **Records / document workflow** | Missing | No upload, no processing status, no document list or case-centric view. |
| **Document upload flow** | Missing | No drag-and-drop, no portal connection, no file handling. |
| **Clio (or any CMS) integration** | Missing | No OAuth, no API usage, no real sync — only copy and a static “Synced to Clio” badge. |
| **Admin / analytics** | Missing | No admin route, no usage/analytics, no internal tooling. |
| **Auth** | Missing | No login, signup, or session; no way to “use” a product. |
| **Database** | Missing | Prisma present but no schema, no migrations, no persistence. |
| **Email (e.g. demo confirmation)** | Missing | Resend present but no usage. |
| **Light-theme remnants** | Minor | `HowItWorks.tsx`, `PlatformOverview.tsx` still use `#E5E7EB` / light backgrounds; `DashboardPreview` has invalid class `#3B82F6/20`. |

---

## 4. Website / landing page audit

**As if you’re a buyer from a PI law firm:**

- **First impression:** Headline is clear: “AI Medical Record Intelligence for Personal Injury Law Firms.” Subtext (organize, timelines, billing, sync) matches what you’d want. Trust badges (PI firms, HIPAA, Clio & FileVine) help.
- **Problem section:** Speaks to chaos, manual timelines, billing extraction pain, disconnected systems. Feels relevant.
- **Solution:** “One platform, complete control” plus 90% time reduction and “Get Started” CTA. No proof (case studies, logos, numbers) — all claim.
- **Dashboard preview:** Looks like a real product (case #, timeline, billing, “Synced to Clio”). It’s static; a sharp buyer may notice nothing is clickable or live.
- **Features / capabilities:** Clear list (organization, timelines, billing, sync, integrations). No demo video or interactive demo.
- **Integrations:** Names only (Clio, Filevine, etc.). No “how to connect,” no screenshots of Clio inside Onyx Intel.
- **Pricing:** “Custom” only. No ballpark, no starter tier — friction for small firms.
- **Demo form:** As soon as they submit, **the request fails** (no `/api/leads`). High risk of lost trust.
- **Trust gaps:** No client logos, no testimonials, no “As seen in” or compliance badges (SOC 2, HIPAA) on the page, no clear “Who we are” or “About.”

**Verdict:** Copy and structure are good for a first visit. Value is understandable. Conversion is undermined by broken demo submit and lack of proof/premium trust elements.

---

## 5. Dashboard / app audit

**As if you’re a user deciding if this saves time:**

- **Reality:** There is **no app dashboard**. `http://localhost:3000/dashboard` does not exist. The only “dashboard” is the static `DashboardPreview` on the marketing site.
- **What the mock shows:** Case #2024-0847, treatment timeline (dates/events/providers), billing total and breakdown, provider list, document categories (counts), “Synced to Clio” and “Last sync: 2 min ago.” All hardcoded.
- **What’s missing for a real user:**  
  - No way to log in or switch cases.  
  - No upload, no “add records.”  
  - No review queue or “pending review” list.  
  - No drill-down (e.g. into a visit or a document).  
  - No real Clio sync or status.  
  - No settings, no team, no billing/subscription.

**Verdict:** From a “does this save me time?” perspective, there is nothing to evaluate — the product in the mock does not exist as a usable app. The mock is a convincing **picture** of value, not a **deliverable**.

---

## 6. Sellability audit

**Sellability scores (1–10):**

| Area | Score | Rationale |
|------|--------|-----------|
| **Landing page** | 6/10 | Clear value prop and flow; no social proof, no pricing anchor, demo form broken. Good for awareness, weak for conversion. |
| **Dashboard** | 2/10 | No real dashboard. Mock looks good but is non-functional. No “try it” or “see it work” — not sellable as a product experience. |
| **Overall SaaS product** | 3/10 | Strong positioning and copy; no working product (no upload, no processing, no review queue, no Clio, no auth). This is a **marketing site for a product that isn’t built yet**. |

**What buyers will understand in 5 seconds:**  
“This is an AI product for PI law firms that organizes medical records, builds treatment timelines, extracts billing, and syncs to Clio/other CMS. They want me to request a demo.”

**What buyers still won’t understand:**  
- Whether the product actually exists or is vapor.  
- What the dashboard looks like in real use or how review works.  
- What “Custom” pricing means or whether they can afford it.  
- Who’s behind it (company, team, credibility).  
- That submitting the demo form currently does nothing.

---

## 7. What makes the product feel premium vs unfinished

**Premium / polished:**  
- Dark, consistent theme and typography.  
- Clear information hierarchy and section flow.  
- Professional copy (problem → solution → features → integrations → pricing → demo).  
- Dashboard mock looks like a real case view.  
- Multiple supporting pages (platform, features, security, FAQ, etc.).  
- CTAs repeated and consistent (“Request Demo,” “See How It Works”).

**Unfinished / not premium:**  
- Demo form has no backend → immediate dead end.  
- No dashboard or app to log into.  
- No proof: no logos, testimonials, case studies, or compliance badges.  
- “Custom” pricing only; no entry-level option or range.  
- Duplicate/legacy components (e.g. “DemoForm 2.tsx”, “Solution 2.tsx”) suggest incomplete cleanup.  
- Minor UI bugs (wrong color class in `DashboardPreview`, light-theme leftovers).  
- No video or interactive demo — only static mock.  
- Footer “Privacy” and “Terms” go to `#` (placeholder).  
- Integrations are names only; no connection flow or screenshots.

---

## 8. Highest-impact fixes (in order)

**Conversion / sales**
1. Implement **`/api/leads`** (e.g. Next.js API route): validate payload, persist to DB or send to CRM/Resend, return success/error so the demo form works.
2. Add **social proof**: client logos (even “Coming soon” or 1–2 early adopters), one or two short testimonials, or “X firms use Onyx Intel.”
3. Add **pricing anchor**: e.g. “Plans from $X/month” or “Typical implementation $X–$Y” so “Custom” feels informed.
4. Add **trust above the fold**: small “SOC 2” / “HIPAA-ready” or “BAA available” badge near hero or trust row.

**UX / engagement**
5. Add a **short product demo video** (1–2 min) or a few **screenshots** of “real” dashboard/review flow (even if still mock) so the value feels tangible.
6. Make the **dashboard preview** feel more interactive: e.g. “View sample case” link that opens a full-page, scrollable mock with a bit of motion or tooltips.
7. Add a **secondary CTA** for people not ready to demo: e.g. “Download one-pager” or “See sample timeline” (PDF or static page).

**Trust / credibility**
8. Add **Privacy** and **Terms** pages (even minimal) and link them from the footer.
9. Add an **About** or **Company** section: who you are, where you’re based, and why PI/medical records (even 2–3 sentences).
10. If you have **compliance documentation** (BAA, SOC 2), link or mention it from Security and FAQ.

**Product clarity**
11. Clarify **what’s live vs coming soon**: e.g. “Dashboard and review queue coming in [timeframe]” or “Currently in private beta” so buyers don’t assume everything in the mock is available now.
12. On **Integrations**, add one sentence per CMS: “Connect your Clio account in one click” or “We sync matters, contacts, and documents” so it’s clear what “integrate” means.

**MVP completion blockers**
13. **Implement `/dashboard`** (even v0): e.g. simple app shell + the existing `DashboardPreview` as the main content, with “Sample data” disclaimer. Gives a real URL and a place to evolve into upload → queue → sync.
14. **Add auth (even minimal)**: e.g. magic link or email code so “Request Demo” can lead to “Log in to your demo account” and a real dashboard route.
15. **Define and implement lead pipeline**: DB (Prisma schema + migrations), `/api/leads` writing to DB, optional Resend “We got your request” email so no lead is lost.

---

## 9. Fastest wins

1. **Add `/api/leads`** — One route; validate, then store (e.g. Prisma) or send to Resend/CRM. Fixes broken form immediately.
2. **Fix DashboardPreview** — Change `bg-[#3B82F6/20]` to `bg-[#3B82F6]/20` (and any similar typo) so styles apply.
3. **Replace light-theme remnants** — In `HowItWorks` and `PlatformOverview`, swap `#E5E7EB` / light backgrounds for the dark palette.
4. **Add `/dashboard` route** — New `app/dashboard/page.tsx` that renders the existing `DashboardPreview` (or a full-page version) with a “Sample data — product in development” banner.
5. **Privacy / Terms placeholders** — Add `/privacy` and `/terms` with minimal text and link from footer.

---

## 10. Top 10 improvements to make it more engaging and sellable

1. **Working demo form** — `/api/leads` + persistence/email so every submission is captured and confirmed.
2. **Real `/dashboard`** — At least one live route that shows the case dashboard mock so “See the dashboard” is real.
3. **Social proof** — Logos, 1–2 testimonials, or “X firms” to build trust.
4. **Product video or screenshot tour** — Show “upload → timeline → sync” so the workflow is visible.
5. **Pricing clarity** — Starter tier or price range so “Custom” isn’t the only option.
6. **Trust badges** — SOC 2 / HIPAA-ready / BAA near hero or footer.
7. **Privacy + Terms pages** — Linked from footer.
8. **About / Company** — Short “who we are” and why PI/medical records.
9. **Clear “what’s live”** — One line on home or product tour: “Dashboard and full workflow in beta” so expectations match reality.
10. **Interactive or expanded dashboard preview** — “Explore sample case” full-page mock with light interactivity or tooltips.

---

## 11. Top 5 fastest to implement

1. **`/api/leads`** — Single API route + simple validation and store or email.
2. **`/dashboard` page** — One new page that renders the dashboard mock + disclaimer.
3. **Fix Tailwind/color bugs** — `#3B82F6/20` → `#3B82F6]/20`; replace light colors in HowItWorks and PlatformOverview.
4. **Privacy & Terms** — Two minimal pages + footer links.
5. **“Sample data” banner** on dashboard preview (and optional product-tour section) — One line of copy.

---

## 12. Top 5 that most increase perceived value

1. **Working demo request** — Form that actually saves/sends leads and shows confirmation (and optional email).
2. **Real dashboard URL** — `/dashboard` that loads and shows the case mock so the product feels real.
3. **Social proof** — Logos or testimonials so it’s not “we say so” only.
4. **Product demo video or screenshot flow** — “See it in action” without needing a live demo.
5. **Transparent “what’s available”** — “Dashboard and review queue in beta” so the mock isn’t overpromising.

---

## 13. Final verdict

**Would this sell right now? No.**

**Why not:**  
- **The demo form is broken.** Submitting “Request a Demo” returns 404; no lead is captured. Any serious prospect who tries it hits a dead end.  
- **There is no product to sell.** The site sells “organize records, build timelines, extract billing, sync to Clio.” None of that exists in the repo: no upload, no processing, no review queue, no Clio integration, no dashboard app. The “dashboard” is a static mock. A buyer who expects to see a working tool or even a sandbox will be disappointed.  
- **Trust is thin.** No client logos, no testimonials, no concrete compliance evidence, no About, placeholder Privacy/Terms. For a firm handing over medical records and case data, that’s a hard sell.  
- **Pricing is opaque.** “Custom” only with no range or starter option adds friction and uncertainty.

**What would need to be true for it to sell:**  
- Demo form works and leads are stored (and ideally confirmed by email).  
- At least one real product surface: e.g. `/dashboard` with the current mock and a clear “Sample / beta” message, or a minimal upload → view flow.  
- Some proof (logos, testimonials, or “Pilot with X firms”) and basic trust (Privacy, Terms, About, optional compliance badge).  
- Clear positioning: either “We’re in beta, here’s what’s live” or “Full product coming [date]; request early access.”

**Bottom line:** The **website is in good shape** as a marketing and positioning vehicle. The **product it describes does not exist yet.** Fix the lead capture and add a minimal dashboard route plus honest “what’s live” copy, and you get a sellable **demo request + waitlist** flow. To sell the actual workflow (upload, review, sync), you need to build that workflow and expose it behind `/dashboard` (and eventually behind auth).
