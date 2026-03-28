# DigitalOcean App Platform — Frontend (apps/web)

This repo is configured for **full-stack** deployment on DigitalOcean App Platform (API + Web) via **`.do/app.yaml`**. Pushes to **`main`** trigger an auto-deploy of both services.

**See [docs/DEPLOYMENT.md](../../docs/DEPLOYMENT.md)** for:
- Branch that deploys, build/run commands, env vars, and manual DO steps
- Exact Git push flow to see changes live

The notes below are specific to the **web** component only (source `apps/web`).

## App type

- **Web Service** (not Static Site — the app uses Next.js server for SSR/routing).

## Source

| Setting | Value |
|--------|--------|
| **Repository** | Your GitHub repo (e.g. `your-org/doc-platform`) |
| **Branch** | `main` (or your default branch) |
| **Source Directory** | `apps/web` |

Build and run commands execute with **working directory = `apps/web`**.

## Build

| Setting | Value |
|--------|--------|
| **Build Command** | `pnpm install && pnpm run build` |
| **Alternatives** | If you use npm: `npm ci && npm run build` |

- **Exact build script:** `next build` (from `package.json`).
- **Node / pnpm:** Ensure the App Platform buildpack or environment uses Node 18+ and pnpm (or npm). If pnpm is not available, use npm: set **Build Command** to `npm ci && npm run build`.

## Run

| Setting | Value |
|--------|--------|
| **Run Command** | `pnpm start` |
| **Alternatives** | `npm start` if using npm |

- **Exact start script:** `next start` (from `package.json`).
- **Port:** Next.js reads **PORT** from the environment. App Platform sets **PORT** automatically (e.g. 8080). Set **HTTP Port** in the App Spec / UI to match (e.g. **8080**). The app will listen on `0.0.0.0:PORT`.

## Environment variables

Set in the App Platform UI (or in the app spec under the service’s `envs`). These are needed for **build** and/or **run**:

| Variable | When | Description |
|----------|------|-------------|
| **NEXT_PUBLIC_API_URL** | Build (required) | Full URL of the backend API (e.g. `https://your-api-xxxx.ondigitalocean.app`). Must be set at **build time** so it is baked into the client bundle. |
| **PORT** | Run | Set by App Platform automatically. Do not override unless needed. |

- **NEXT_PUBLIC_API_URL** must point to your deployed API. For local dev you use `http://localhost:4000`; for production use the API’s App Platform URL (or custom domain).

## HTTP port (App Platform)

- In the component settings, set **HTTP Port** to the same value App Platform assigns to **PORT** (often **8080**). Next.js will listen on that port.

## Optional: App Spec snippet (single web service)

You can define the web app in an app spec (e.g. `.do/app-spec-web.yaml` or in the DO control panel “App Spec”):

```yaml
name: doc-platform-web
services:
  - name: web
    source_dir: apps/web
    github:
      branch: main
      repo: YOUR_ORG/doc-platform
    build_command: pnpm install && pnpm run build
    run_command: pnpm start
    http_port: 8080
    envs:
      - key: NEXT_PUBLIC_API_URL
        value: https://your-api-url.ondigitalocean.app
```

**Note:** `NEXT_PUBLIC_API_URL` must be available at **build time** (Next.js bakes it into the client bundle). In App Platform, add the env and enable “Available at build” (or equivalent) so the build step can read it.

## Checklist before first deploy

- [ ] Repo and branch set; source directory = `apps/web`
- [ ] Build command runs from `apps/web` and succeeds locally: `pnpm run build`
- [ ] Run command: `pnpm start`; Next listens on PORT
- [ ] `NEXT_PUBLIC_API_URL` set to the backend API URL (or placeholder)
- [ ] HTTP port in App Platform matches PORT (e.g. 8080)

## Production-like local run

From repo root or `apps/web`:

```bash
cd apps/web
pnpm install
pnpm run build
PORT=3000 pnpm start
```

Then open http://localhost:3000 (or the port you set). The app will use `NEXT_PUBLIC_API_URL` from the environment at build time; for a quick test you can `export NEXT_PUBLIC_API_URL=http://localhost:4000` before `pnpm run build`.
