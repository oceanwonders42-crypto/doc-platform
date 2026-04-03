# CI test runs

Current checked-in CI covers the build-time validation that is already proven locally for the doc-platform repo.

**Local launch path:** For service startup, demo seed, and manual migration QA, see [launch-readiness-runbook.md](launch-readiness-runbook.md).

## Current GitHub Actions workflow

- **File:** `.github/workflows/doc-platform-validation.yml`
- **Triggers:** `push` and `pull_request` targeting `main`
- **Package manager:** `pnpm@10.30.3`
- **Node version:** `20`
- **Checks run:**
  - `apps/api` TypeScript compile
  - `apps/web` TypeScript compile
  - `apps/web` production build

This workflow is intentionally small. It only runs checks that are already stable and valuable without requiring database, Redis, API secrets, or demo seed data.

## Exact commands mirrored by CI

From repo root after checkout:

```bash
pnpm install --frozen-lockfile
pnpm --dir apps/api exec tsc -p tsconfig.json
pnpm --dir apps/web exec tsc --noEmit
pnpm --dir apps/web build
```

## What CI does not run yet

- No Playwright browser tests
- No API server startup
- No PostgreSQL or Redis services
- No seeded migration workflow data
- No secret-dependent validation

That is intentional for now. The current workflow is meant to catch type/build regressions on every push and PR with minimal infrastructure.

## Why Playwright is not in the workflow yet

The migration workflow is now validated locally with seeded data, but a deterministic CI browser pass would still require extra setup:

- local database service
- optional Redis service depending on the path under test
- API startup
- seed/setup commands for migration data

That can be added later as a separate workflow once the repo is ready to own that extra setup. This file should not claim that browser CI already exists until that workflow is actually checked in.

## See also

- [local-testing.md](local-testing.md) - running tests locally
- [smoke-test-matrix.md](smoke-test-matrix.md) - route expectations
- [launch-readiness-runbook.md](launch-readiness-runbook.md) - local launch and migration QA steps
