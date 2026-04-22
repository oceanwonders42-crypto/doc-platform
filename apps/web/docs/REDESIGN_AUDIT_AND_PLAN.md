# Redesign Audit & Plan — Filevine-inspired structure, Onyx Intel identity

## A. Audit summary

### Existing routes
- **Marketing:** `/` (HomePage from Imported-site), `/login`, `/privacy`, `/terms`, `/security`, `/settings/integrations`, `/support/report`
- **Dashboard (auth):** `/dashboard`, `/dashboard/cases`, `/dashboard/cases/[id]`, `/dashboard/documents`, `/dashboard/documents/[id]`, `/dashboard/records-requests`, `/dashboard/records-requests/new`, `/dashboard/records-requests/[id]`, `/dashboard/review`, `/dashboard/providers`, `/dashboard/providers/[id]`, `/dashboard/integrations`, `/dashboard/integrations/setup`, `/dashboard/team`, `/dashboard/billing`, `/dashboard/settings`, `/dashboard/settings/firm`, `/dashboard/analytics`, `/dashboard/audit`, `/dashboard/usage`, `/dashboard/traffic`, `/dashboard/traffic/[id]`, `/dashboard/support/report`
- **Admin (PLATFORM_ADMIN):** `/admin/quality`, `/admin/errors`, `/admin/incidents`, `/admin/security`, `/admin/support`, `/admin/support/bug-reports`
- **Other:** `/onboarding/integration`, `/debug/audit`

### Current nav structure
- **Marketing (Header):** Platform, Features → `/#features`; Integrations → `/#integrations`; Pricing → `/#services-pricing`; Demo → `/login`; FAQ → `/#faq`
- **Dashboard (sidebar):** Dashboard, Cases, Traffic, Documents, Providers, Records Requests, Review Queue, Analytics, Audit, Usage, Team, Integrations, Support, Settings, Firm Settings, Billing; Platform Admin (when PLATFORM_ADMIN)

### Shared layout/components
- **Root:** `app/layout.tsx` — ThemeProvider, ConditionalAppHeader (null on `/`, else minimal header "Doc Platform" + Dashboard link), AuthAwareFooter
- **Dashboard:** `app/dashboard/layout.tsx` — DashboardAuthProvider, DashboardShell, DashboardHeader, DashboardSidebar, main with max-width
- **Landing:** Components in `Imported-site/src/components/`: Header, Hero, WhoUsesOnyxIntel, Problem, Solution, Features, HowItWorks, ServicesPricingSection, IntegrationsSummary, FAQTeaser, CTASection, Footer; ui: Section, SectionHeader, CTASection

### Current dashboard widgets/pages
- **Dashboard home:** KPI row (Cases, Documents Processed, Needs Review, Unmatched, Records Requests, Queue Status); Quick actions (Upload, Review Queue, New Records Request, View All Cases); Recent Activity card; Trends card; empty state
- **Case detail:** Client info, Billing summary, Bill line items, Counts; Treatment timeline (track/provider filters); Providers list; AI insights; Export (packet type, Download ZIP, Cloud drive); Documents list (group by provider)

### Case-related pages
- `/dashboard/cases` — list; `/dashboard/cases/[id]` — single case with timeline, providers, docs, financial, insights, export

### Role-based logic
- **DashboardAuthContext:** `canAccessTeam`, `canAccessBilling`, `canAccessFirmSettings`, `canAccessIntegrations`, `canAccessAuditQuality`, `isPlatformAdmin`, `isStaffOrAbove`
- **Sidebar:** teamOnly, billingOnly, firmSettingsOnly, integrationsOnly, auditOnly, analyticsUsageOnly, staffOnly, platformAdminOnly
- **Admin layout:** redirect non–PLATFORM_ADMIN to `/dashboard`; dashboard layout redirects PLATFORM_ADMIN without firm to `/admin/quality`

### Obvious UI inconsistencies
- ConditionalAppHeader shows "Doc Platform" on non-home routes instead of "Onyx Intel" and single Dashboard link; marketing uses Onyx Intel branding
- Landing uses `--bg-primary`, `--text-primary`, etc.; dashboard uses `--onyx-*`; both are dark, same accent blue
- No dedicated feature subpages; no /platform or /solutions routes
- Case detail is single long page; no tabs for Overview/Documents/Chronology/etc.
- Dashboard sidebar is feature-dense (Traffic, Providers, Analytics, Usage, Audit) rather than case/workflow-centric

---

## B. Redesign plan

### Current state → Target state

| Area | Current | Target |
|------|---------|--------|
| Homepage flow | Hero, Who uses, Problem, Solution, Features, How it works, Pricing, Integrations, FAQ, CTA | Hero (outcome + Book Demo / See Platform), Trust/audience, Core platform modules (6), How it works (5 steps), Dashboard preview, Role-based visibility, Pricing (unchanged), Final CTA |
| Nav | Platform/Features/Integrations/Pricing/Demo/FAQ | Platform, Features, Solutions (Who It's For), Pricing, Demo/Contact |
| Feature pages | None | /features/document-intake, ai-review, chronology-builder, missing-records, demand-support, case-dashboard |
| Dashboard home | 6 KPI + queue, 4 quick actions, Recent Activity + Trends | Top cards: Active Cases, Documents Today, Needs Review, Missing Records, Chronologies In Progress, Demands In Progress; Panels: Review Queue, Recently Updated Cases, Missing Doc Alerts, AI Exceptions, Overdue Records, Team Workload |
| Sidebar | Dashboard, Cases, Traffic, Documents, Providers, Records Requests, Review, Analytics, Audit, Usage, Team, Integrations, Support, Settings, Billing, Firm | Dashboard, Cases, Documents, Chronologies, Demands, Records Requests, Reports, Team, Settings (case-centric; management-only items hidden by role) |
| Case detail | Single scroll: client, billing, timeline, providers, insights, export, documents | Tabs: Overview, Documents, Chronology, Medical Bills/Specials, Missing Records, Demands, Tasks, Activity, Contacts, Notes; prominent AI actions |
| Role views | Sidebar filtering by role | Same + ensure management metrics (billing, performance, usage) not in staff/paralegal view |

### Components/pages to change
- `Imported-site/HomePage.tsx` — section order and new sections
- `Imported-site/src/components/Hero.tsx` — headline, CTAs (Book Demo primary, See Platform / View Dashboard secondary)
- `Imported-site/src/components/Header.tsx` — nav items
- `Imported-site/src/components/Features.tsx` → replace with Core platform modules (Document Intake, AI Review, Chronology Builder, Missing Records, Demand Support, Dashboard & Reporting)
- `Imported-site/src/components/HowItWorks.tsx` — 5 steps: Upload, AI extracts/organizes, Chronology/costs generated, Missing flagged, Team reviews/finalizes
- New: `Imported-site/src/components/PlatformModules.tsx`, `RoleVisibilitySection.tsx`; refine WhoUsesOnyxIntel as Trust/audience; keep Problem/Solution or fold into flow; Dashboard preview section (existing DashboardPreview); Pricing unchanged; CTASection at end
- `app/components/ConditionalAppHeader.tsx` — "Onyx Intel" + Dashboard when not home
- `app/dashboard/page.tsx` — new summary cards + panels
- `components/dashboard/DashboardSidebar.tsx` — new nav list (Cases, Documents, Chronologies, Demands, Records Requests, Reports, Team, Settings)
- `app/dashboard/cases/[id]/page.tsx` — tabbed layout + AI action buttons

### New pages/components required
- `app/features/document-intake/page.tsx` (and 5 more feature slugs) — scaffold or content
- `Imported-site/src/components/PlatformModules.tsx` — 6 module cards
- `Imported-site/src/components/RoleVisibilitySection.tsx` — Management / Staff / Reviewer view
- Dashboard: widgets for Missing Records, Chronologies In Progress, Demands In Progress (if API exists or placeholder); panels for Review Queue, Recently Updated Cases, Missing Doc Alerts, AI Exceptions, Overdue Records, Team Workload
- Case detail: tab component; AI action bar (Summarize, Build chronology, Extract providers/dates, Identify missing, Compare bills, Draft demand, Q&A)

### Routes to keep/remove/refactor
- Keep: all existing dashboard and admin routes
- Add: `/features/document-intake`, `/features/ai-review`, `/features/chronology-builder`, `/features/missing-records`, `/features/demand-support`, `/features/case-dashboard`
- Refactor: sidebar links (remove or regroup Traffic, Providers, Analytics, Usage, Audit into Reports or role-gated); case detail becomes tabbed
- No route removal; Chronologies/Demands may link to existing or scaffold

---

## C. Execution order (Steps 3–7)
1. Implement marketing website redesign (HomePage, Hero, Header, PlatformModules, HowItWorks, RoleVisibility, feature pages scaffold)
2. Implement dashboard homepage (summary cards + panels)
3. Implement case detail redesign (tabs + AI actions)
4. Role-based visibility (sidebar + dashboard content by role)
5. Polish (spacing, borders, consistency)
