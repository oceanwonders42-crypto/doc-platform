# Deployment runbook — GitHub → DigitalOcean App Platform

This doc describes how **every push to the production branch** triggers a live update on DigitalOcean App Platform, and what you must configure once in the DO dashboard.

---

## 1. Branch that deploys

| Item | Value |
|------|--------|
| **Production branch** | `main` |
| **Auto-deploy** | Yes. Pushes to `main` trigger a new build and deploy for both **api** and **web**. |
| **Other branches** | Not configured to deploy. Only `main` is used in the app spec (`.do/app.yaml`). |

To change the branch, edit `.do/app.yaml`: update `branch: main` under both `api` and `web` to your desired branch name, then commit and push. The next deploy will use the new branch only after you trigger a deploy (e.g. by pushing a commit or using "Deploy" in the DO dashboard).

---

## 2. Build and run commands

These are defined in `.do/app.yaml` and used by App Platform.

### API (`apps/api`)

| Phase | Command |
|-------|---------|
| **Build** | `pnpm install && pnpm run build` |
| **Run** | `pnpm prisma migrate deploy && pnpm start` |
| **HTTP port** | 8080 (App Platform sets `PORT=8080`) |

- **Install:** runs in `apps/api` (source_dir). Installs deps and runs `postinstall` → `prisma generate`.
- **Build:** `pnpm run build` → `tsc` (output in `dist/`).
- **Run:** Migrations run on every deploy, then `pnpm start` → `node dist/http/server.js`.

### Web (`apps/web`)

| Phase | Command |
|-------|---------|
| **Build** | `pnpm install && pnpm run build` |
| **Run** | `pnpm start` |
| **HTTP port** | 8080 |

- **Install/Build:** runs in `apps/web`. `next build` bakes `NEXT_PUBLIC_API_URL` into the client bundle — **must be set at build time**.
- **Run:** `next start`; Next.js reads `PORT` from the environment (set by App Platform).

---

## 3. Environment variables

### 3.1 Web (frontend)

| Variable | When | Required | Description |
|----------|------|----------|-------------|
| **NEXT_PUBLIC_API_URL** | **Build time** | Yes | Full URL of the live API (e.g. `https://api-xxxx.ondigitalocean.app`). Set in DO and enable **"Available at build"** so the Next.js build sees it. |
| **NODE_ENV** | Run | Set by spec | `production` (in `.do/app.yaml`). |
| **PORT** | Run | Set by DO | Injected by App Platform (e.g. 8080). |

**Important:** If `NEXT_PUBLIC_API_URL` is missing or points to localhost at build time, the production site will call the wrong API or none. Set it to the **API component’s public URL** in DigitalOcean (e.g. from the API service’s URL in the app overview).

### 3.2 API (backend)

| Variable | When | Required | Description |
|----------|------|----------|-------------|
| **DATABASE_URL** | Run (and migrate at run) | Yes | PostgreSQL connection string. Use a DO Managed Database or external Postgres. |
| **SESSION_SECRET** or **JWT_SECRET** or **API_SECRET** | Run | Yes (prod) | At least one for sessions/JWT. Use strong random values in production. |
| **NODE_ENV** | Run | Set by spec | `production`. |
| **PORT** | Run | Set by DO | Injected by App Platform (8080). |
| **DOC_WEB_BASE_URL** | Run | Recommended | Public URL of the web app (e.g. `https://web-xxxx.ondigitalocean.app`). Used for invite links; if unset, code falls back to `http://localhost:3000` in some paths. |

**Optional (feature-dependent):**

- **S3_ENDPOINT**, **S3_ACCESS_KEY**, **S3_SECRET_KEY**, **S3_REGION**, **S3_BUCKET** — object storage (required if you use file uploads/storage that hit S3).
- **REDIS_URL** — job queue; defaults to `redis://localhost:6379` if unset (not available on App Platform unless you add a Redis component).
- **OPENAI_API_KEY** — AI features (summaries, extraction, etc.).
- **PLATFORM_ADMIN_API_KEY** — admin API access.
- **SMTP_***, **INGEST_URL**, **INGEST_API_KEY**, **ENCRYPTION_KEY**, **PROVIDER_SESSION_SECRET**, Stripe/Clio/CRM vars, etc. — see `apps/api` code and `.env.example` if present.

Set **secrets** (DATABASE_URL, SESSION_SECRET, etc.) in the DO dashboard as **Encrypted** (type SECRET). Do not commit them to the repo.

---

## 4. Exact files changed (in repo)

- **`.do/app.yaml`** — App Platform app spec: two services (`api`, `web`), source dirs `apps/api` and `apps/web`, GitHub `branch: main`, `deploy_on_push: true`, build/run commands, `http_port: 8080`.
- **`docs/DEPLOYMENT.md`** — This runbook.

No application code was changed for deployment. Production config uses env vars only; no localhost is used in production when env vars are set correctly.

---

## 5. Manual steps in DigitalOcean (one-time)

Do these once so the app can deploy and run.

1. **Create the app from GitHub**
   - In DigitalOcean: **Apps → Create App → GitHub**.
   - Select the repo (e.g. `YOUR_ORG/doc-platform`) and branch **main**.
   - If DigitalOcean offers “Load app spec from repo”, use it so it reads **`.do/app.yaml`**. Otherwise add two **Services** manually and set source directory, build command, run command, and HTTP port to match the spec above.

2. **Replace repo placeholder in spec (if you used app spec)**
   - In `.do/app.yaml` the repo is set to `YOUR_GITHUB_ORG/doc-platform`. Either:
     - Edit the spec in the DO dashboard after creation and set the correct GitHub repo, or
     - Replace `YOUR_GITHUB_ORG` in `.do/app.yaml` with your GitHub org/username, commit and push, then (re)create or update the app from the spec.

3. **Database**
   - Create a **PostgreSQL** database (DO Managed Database or external).
   - Add **DATABASE_URL** to the **api** component as an **encrypted** env var (e.g. attach the DB to the app so DO injects it, or paste the connection string as a secret).

4. **API env vars**
   - In the app → **api** component → **Settings → App-Level Environment Variables** (or equivalent):
     - **DATABASE_URL** (encrypted).
     - **SESSION_SECRET** or **JWT_SECRET** or **API_SECRET** (encrypted).
     - **DOC_WEB_BASE_URL** = your web app’s public URL (recommended).
   - Add any optional vars (S3_*, REDIS_URL, OPENAI_API_KEY, etc.) as needed.

5. **Web env vars**
   - In the app → **web** component → **Settings → App-Level Environment Variables**:
     - **NEXT_PUBLIC_API_URL** = the **API** component’s public URL (e.g. `https://api-xxxx.ondigitalocean.app`).
   - Ensure **NEXT_PUBLIC_API_URL** is available **at build time** (e.g. “Available at build” or equivalent checkbox).

6. **Deploy on push**
   - In App → **Settings** (or each component), ensure **Deploy on push** is enabled for the **main** branch (or the branch you set in `.do/app.yaml`). This is usually the default when you connect GitHub with the spec.

7. **First deploy**
   - Trigger a deploy (push a commit to `main`, or use **Deploy** in the dashboard). After the first successful deploy, copy the **API** public URL and set it as **NEXT_PUBLIC_API_URL** for the **web** component if you used a placeholder, then redeploy **web** so the build picks up the correct API URL.

---

## 6. Deployment readiness verdict

- **Ready for auto-deploy from code:** Yes, once the one-time DO setup above is done.
- **What’s in the repo:** App spec (`.do/app.yaml`) and this runbook. No GitHub Actions are required; DigitalOcean’s native “deploy on push” is sufficient.
- **What you must do in DO:** Connect GitHub (repo + branch), add **DATABASE_URL** and **SESSION_SECRET** (or equivalent) for the API, set **NEXT_PUBLIC_API_URL** (build-time) for the web to the live API URL, and ensure deploy on push is enabled for `main`.

---

## 7. Missing secrets / variables (you must set in DO)

- **API:** **DATABASE_URL**, **SESSION_SECRET** (or **JWT_SECRET** or **API_SECRET**). Optional: S3_*, REDIS_URL, OPENAI_API_KEY, PLATFORM_ADMIN_API_KEY, DOC_WEB_BASE_URL, etc.
- **Web:** **NEXT_PUBLIC_API_URL** (build-time) = API’s public URL.

Do not commit these values; set them only in the DigitalOcean dashboard.

---

## 8. Exact Git push flow to see changes live

1. Make a local change.
2. Commit: `git add -A && git commit -m "Your message"`.
3. Push to the production branch: `git push origin main`.
4. DigitalOcean rebuilds and redeploys both **api** and **web** (if deploy on push is enabled for `main`).
5. When the deploy finishes, the live site and API reflect your change.

To avoid deploying from the wrong branch, only push to `main` when you intend to update production. Other branches are not configured in `.do/app.yaml` and will not deploy unless you add them or change the spec.

---

## 9. References

- **App spec:** `.do/app.yaml`
- **Web-only deploy notes:** `apps/web/DEPLOY_APP_PLATFORM.md`
- **DigitalOcean:** [App Platform reference](https://docs.digitalocean.com/products/app-platform/reference/app-spec/)
