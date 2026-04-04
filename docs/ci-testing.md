# CI test runs

Current checked-in CI covers both the base build-time validation path and a dedicated seeded migration browser path for the doc-platform repo.

**Local launch path:** For service startup, demo seed, and manual migration QA, see [launch-readiness-runbook.md](launch-readiness-runbook.md).

## Current GitHub Actions workflows

- **Base validation:** `.github/workflows/doc-platform-validation.yml`
  - Triggers: `push` / `pull_request` → `main`
  - Package manager: `pnpm@10.30.3`
  - Node: `20`
  - Checks: `apps/api` typecheck, `apps/web` typecheck, `apps/web` production build

- **Migration browser validation:** `.github/workflows/migration-browser-validation.yml`
  - Triggers: `push` / `pull_request` → `main`
  - Spins up Postgres, runs Prisma migrations, seeds demo data, then reruns the migration QA seed to prove deterministic final state
  - Boots API (port 4000) and Web (port 3211) against the seeded DB
  - Runs Playwright spec `apps/web/tests/migration-workflow.live.spec.ts` (chromium only)
  - Uploads Playwright report artifact

This workflow is intentionally small. It only runs checks that are already stable and valuable without requiring Redis, production secrets, or unrelated browser coverage.

## Exact commands mirrored by CI

From repo root after checkout:

```bash
pnpm install --frozen-lockfile
pnpm --dir apps/api exec tsc -p tsconfig.json
pnpm --dir apps/web exec tsc --noEmit
pnpm --dir apps/web build
```

## What CI still does not run

- No Redis service
- No full Playwright suite (only the migration live spec)
- No email/worker pipelines
- No object storage integration

## Browser workflow boundary

The migration browser workflow is scoped to the rerun-safe seeded local path only:

- Postgres service
- Prisma migrations
- demo seed + migration QA seed + migration QA seed rerun
- API startup with the inline worker disabled
- web startup
- one live seeded Playwright spec

It does not try to cover Redis-backed processing, object storage integrations, or the full browser suite.

## See also

- [local-testing.md](local-testing.md) - running tests locally
- [smoke-test-matrix.md](smoke-test-matrix.md) - route expectations
- [launch-readiness-runbook.md](launch-readiness-runbook.md) - local launch and migration QA steps
