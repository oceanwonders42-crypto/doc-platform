# Onyx Deploy Runbook

This runbook documents the repo-committed deploy path only. Anything outside these commands or script checks is an operator decision, not a repo guarantee.

## Repo-proven deploy commands

- `pnpm deploy:checklist`
- `pnpm deploy:production`
- `pnpm deploy:verify`
- `pnpm deploy:status`
- `pnpm deploy:history`

## Repo-proven release flow

The committed production path is `pnpm deploy:production`, which in turn:

- reruns `pnpm deploy:checklist`
- clears `apps/web/.next`
- runs `prisma generate` and `prisma migrate deploy` in `apps/api`
- rebuilds `apps/api` and `apps/web`
- verifies the committed PM2 ecosystem and built artifacts
- reloads PM2 using `ecosystem.config.cjs`
- waits for API health at `http://127.0.0.1:4000/health`
- waits for web health at `http://127.0.0.1:3000/healthz`
- verifies live version data from API and web
- records a deploy history entry on success

The strict checklist command is `pnpm deploy:checklist`. It is repo-proven to fail when:

- the git worktree is dirty
- `apps/api/build-meta.json` or `apps/web/build-meta.json` is missing
- build metadata does not match `HEAD`
- the committed deploy wiring in `ecosystem.config.cjs` no longer matches the app scripts

## Repo-proven verification

- `pnpm deploy:verify` checks the live API and web `/version` endpoints and compares commit, short commit, version label, and dirty state against the expected deployment.
- `pnpm deploy:status` compares local git state with the live API and web `/version` endpoints on localhost.
- `pnpm deploy:history` prints the recorded deploy log, if any.

## Operator-host assumptions

The repo assumes, but does not itself provide, the following host conditions:

- a clean checkout of this repo
- `pnpm@10.30.3`
- Node available for the committed scripts
- `pm2` available if you are using the committed PM2-based release path
- database connectivity for `DATABASE_URL`
- the runtime configuration required by the API and web services
- local service availability on ports `4000` and `3000` for the committed verification commands
- a deployment host that can run the committed `ecosystem.config.cjs` process model

The repository does not prove staging topology, dashboard smoke checks, or any extra manual verification beyond the scripted commands above. If you add those, treat them as operator-owned checks.
OCR runtime dependencies such as `tesseract`, OCR language data, and image/PDF rasterization support are also operator-owned; the deploy scripts do not provision or verify them.

## Production release

1. Move to the intended production commit.
   ```bash
   git fetch --all --prune
   git checkout <release-sha>
   ```

2. Confirm the checkout is clean and build metadata is current.
   ```bash
   pnpm deploy:checklist
   ```

3. Run the committed production deploy.
   ```bash
   pnpm deploy:production
   ```

4. Verify the live release.
   ```bash
   pnpm deploy:verify
   pnpm deploy:status
   pnpm deploy:history
   ```

Release is complete only when the committed verification commands pass.

## Rollback

Rollback is done by redeploying a previously known-good commit from deploy history.

1. Inspect recent deploy records.
   ```bash
   pnpm deploy:history
   ```

2. Choose a known-good commit SHA from deploy history.

3. Move the checkout to that commit.
   ```bash
   git fetch --all --prune
   git checkout <known-good-sha>
   ```

4. Confirm the rollback candidate is clean.
   ```bash
   pnpm deploy:checklist
   ```

5. Redeploy the known-good commit.
   ```bash
   pnpm deploy:production
   ```

6. Re-verify live state.
   ```bash
   pnpm deploy:verify
   pnpm deploy:status
   pnpm deploy:history
   ```

## Failure handling

If deploy fails before PM2 reload:

- fix the blocking issue
- keep the current live system untouched
- rerun `pnpm deploy:production`

If deploy fails after PM2 reload or live verification fails:

- inspect status and history
  ```bash
  pnpm deploy:status
  pnpm deploy:history
  ```
- redeploy the last known-good commit if the live API and web are mismatched or unhealthy

## Operator notes

- Do not use `--allow-dirty` or `--allow-stale-meta` unless you explicitly accept the release risk.
- The repo-proven release path is the PM2-based path in `scripts/deploy-production.mjs` and `ecosystem.config.cjs`.
