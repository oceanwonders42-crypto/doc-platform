# E2E coverage summary

Concise view of what is covered by Playwright tests.

**Run commands:** [local-testing.md](local-testing.md). **Quick launch path (install → seed → tests):** [launch-readiness-runbook.md](launch-readiness-runbook.md).

## Coverage matrix

| Area | Smoke | Demo flow | Demo regression | Review queue |
|------|-------|-----------|-----------------|--------------|
| Login (dashboard load) | ✓ | ✓ | ✓ (then skip if env error) | — |
| Dashboard content | ✓ | ✓ | — | — |
| Cases list | ✓ | ✓ | ✓ (nav from dashboard) | — |
| Case detail | ✓ (demo-case-1) | ✓ | ✓ (first link or demo-case-1) | — |
| Case timeline | ✓ (first from list or demo-case-1) | — | ✓ (dashboard → cases → timeline; gated) | — |
| Case narrative | ✓ (first from list or demo-case-1) | — | ✓ (dashboard → cases → narrative; gated) | — |
| Documents list (dashboard section) | ✓ | — | — | — |
| Document detail | ✓ (when link exists; Audit trail) | — | ✓ (dashboard → doc; gated) | — |
| Review queue | ✓ (load + header) | — | ✓ (dashboard → review; gated) | ✓ (full interactions) |
| Providers | ✓ | — | ✓ (nav from dashboard) | — |
| Provider detail | ✓ (when link exists; skips if no providers) | — | ✓ (dashboard → list → first provider; gated, skips when none) | — |
| Records requests list | ✓ | — | ✓ (nav from dashboard) | — |
| Records request detail | ✓ (when link exists) | — | ✓ (dashboard → list → first request; gated, skips when none) | — |
| Usage | ✓ | — | — | — |
| Analytics | ✓ | — | — | — |
| Admin firms | ✓ | — | — | — |
| Admin firm detail | ✓ (when link exists; skips if no firms or auth error) | — | — | — |
| Admin demo | ✓ (load or error state) | — | — | — |
| Admin debug | ✓ | — | — | — |
| Admin errors | ✓ | — | — | — |
| Admin jobs | ✓ | — | — | — |
| Admin quality | ✓ | — | — | — |
| Admin dashboard | ✓ | — | — | — |
| Sidebar navigation | ✓ | — | — | — |

## Overlap risk with other agents

- **Desktop / dashboard feature work:** Smoke touches dashboard, cases, documents, review, providers, records, usage, analytics. Tests use **resilient selectors** (headings, main, text patterns) and accept empty/env error. Avoid changing heading text or removing `main` without updating tests.
- **Admin/backend:** Admin firms, admin debug, admin errors, admin jobs, **admin quality**, and **admin dashboard** are smoke-only (load or auth/error state); no backend logic changed by tests. Fuller admin flows require PLATFORM_ADMIN_API_KEY and DOC_API_URL.

## What still requires API / DB / Redis / demo env

- **Full smoke pass:** API + Web + DOC_API_KEY; optional demo seed for document/records-request detail tests (they skip when no links). Admin errors/jobs/firms show auth or empty state without PLATFORM_ADMIN_API_KEY.
- **Demo regression:** API + Web + DOC_API_KEY + demo seed (or tests skip). Pack has eight flows: login→dashboard, dashboard→cases→case detail, **dashboard→cases→case timeline**, **dashboard→cases→case narrative**, dashboard→documents→document detail, dashboard→review queue, **dashboard→records requests→records request detail** (skips when no request exists), **dashboard→providers→provider detail** (skips when no provider exists).
- **CI (current workflow):** Web only; no API. Smoke passes with env-error/empty states. For an optional plan to add API + seed and run a full pass or seeded regression in CI, including decision notes and tradeoffs, see [ci-testing.md](ci-testing.md)#optional-full-pass-ci-planning.

## Recommended next laptop-lane task

- **Case narrative** is now covered in smoke (first case from list or demo-case-1). **Case timeline** and **provider detail** are covered; no further expansion needed unless adding new detail routes.
- Expand **admin** further if desired (e.g. `/admin/demo`); fuller admin flows require PLATFORM_ADMIN_API_KEY and DOC_API_URL.
- Keep avoiding backend pipeline, auth core, Prisma, and broad refactors.
