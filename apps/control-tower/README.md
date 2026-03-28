# Onyx Control Tower

This app is now integrated into the main `doc-platform` monorepo as `apps/control-tower`.

It remains a separate internal operator app so it can evolve without destabilizing `apps/api` or `apps/web`.

## What It Is

- Next.js App Router internal dashboard
- SQLite-backed Prisma schema isolated from the main product database
- Project, task, decision, runtime, GitHub sync, prompt, event, and automation-job tracking
- Seeded operator data so the dashboard is useful immediately

## Run It From The Monorepo

From the repo root:

```bash
pnpm install
pnpm control-tower:db:setup
pnpm control-tower:dev
```

Open [http://localhost:3400](http://localhost:3400).

## Why The Schema Is Separate

The control tower currently keeps its own Prisma schema and SQLite file under `apps/control-tower/prisma`.

That is intentional for this phase:

- no risk to the main Postgres production schema
- no migration coupling with case/document workflows
- fast local setup for operator tooling

## Future Migration Path

If we later want shared data or production multi-user hosting, the clean path is:

1. keep the current control tower model names as the source design
2. move them into a namespaced shared Postgres schema or prefixed tables
3. add explicit sync/link models between the control tower and core doc-platform entities
4. migrate off SQLite once shared auth and background jobs are ready
