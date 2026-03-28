# Control Tower Integration

The standalone control tower app from `/Users/adrienpetit/Documents/Playground` is now integrated into the main `doc-platform` repository as `apps/control-tower`.

## Integration Strategy

- import the control tower as a separate monorepo app instead of merging it into `apps/web`
- keep the control tower Prisma schema isolated from `apps/api`
- preserve the existing `apps/api` and `apps/web` runtime behavior
- add a lightweight discovery path from the active dashboard at `/dashboard/control-tower`

This is the lowest-risk path because the control tower carries its own task, prompt, event, automation, and project models that do not yet map cleanly onto the production case-platform schema.

## App Boundary

- app path: `apps/control-tower`
- package name: `control-tower`
- framework: Next.js App Router
- local port: `3400`
- database: SQLite via `apps/control-tower/prisma/schema.prisma`

## Why Prisma Stays Separate For Now

The main platform API already uses a large Postgres schema in `apps/api/prisma/schema.prisma`. The control tower imports a different operator-oriented model set:

- `Project`
- `Task`
- `TaskEvent`
- `TaskPrompt`
- `AutomationJob`
- `DecisionItem`
- GitHub snapshot models

Merging those directly into the main API schema in this pass would create avoidable migration and ownership risk. Keeping the control tower schema separate makes the integration additive and reversible while still making the app first-class inside the monorepo.

## Local Run

From the repo root:

```bash
pnpm install
pnpm control-tower:db:setup
pnpm control-tower:dev
```

Open:

- control tower app: `http://127.0.0.1:3400`
- main dashboard entry page: `http://127.0.0.1:3000/dashboard/control-tower`

## Verification Targets

- `pnpm --dir apps/control-tower typecheck`
- `pnpm --dir apps/control-tower build`
- `pnpm --dir apps/control-tower db:setup`
- start the app and load:
  - `/`
  - `/tasks`
  - `/decisions`
  - `/settings`

## Future Shared-Data Migration Plan

When we want tighter platform integration, the clean next move is:

1. define which control tower entities should share auth, firm scoping, and job orchestration with the main platform
2. move the control tower models into Postgres under a namespaced or prefixed schema design
3. add explicit linking models between control-tower projects/tasks and doc-platform firms/cases
4. migrate automation execution into shared infrastructure only after model ownership is settled
