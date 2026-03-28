# Doc Platform

Document management and review platform (API + web app).

## Documentation

Start here for setup and testing:

| Purpose | Doc |
|--------|-----|
| **Launch & run tests** | [docs/launch-readiness-runbook.md](docs/launch-readiness-runbook.md) — install, env, startup order, demo seed, smoke and seeded regression commands, troubleshooting table |
| **Local E2E** | [docs/local-testing.md](docs/local-testing.md) — all Playwright commands, config, test stability |
| **CI** | [docs/ci-testing.md](docs/ci-testing.md) — running smoke in CI |
| **Full demo setup** | [docs/demo-setup.md](docs/demo-setup.md) — step-by-step env, credentials, and verify |
| **Troubleshooting** | [docs/troubleshooting.md](docs/troubleshooting.md) — common failures and fixes |
| **MVP handoff** | [MVP_HANDOFF.md](MVP_HANDOFF.md) — current working MVP scope, source-of-truth paths, env, and caveats |
| **MVP smoke** | [MVP_SMOKE_TEST.md](MVP_SMOKE_TEST.md) — repeatable operator-focused acceptance checklist |
| **Demo deployment** | [DEMO_DEPLOYMENT.md](DEMO_DEPLOYMENT.md) — minimum runtime requirements, process model, env, and SMTP notes for the current MVP |
| **First pilot** | [FIRST_PILOT_CHECKLIST.md](FIRST_PILOT_CHECKLIST.md) — production-facing checklist, required env, restart checks, and deferred items |
| **Control tower** | [docs/control-tower.md](docs/control-tower.md) — sidecar operator app integration, local runbook, and migration boundary |

Manual smoke checklist: [README_DEV_SMOKE_TEST.md](README_DEV_SMOKE_TEST.md).

## Control Tower

The internal operator dashboard now lives inside this repo as `apps/control-tower`.

Use it without affecting the main runtime:

```bash
pnpm install
pnpm control-tower:db:setup
pnpm control-tower:dev
```

Default local URL:

- [http://localhost:3400](http://localhost:3400)

The main web dashboard links to it at `/dashboard/control-tower`.
