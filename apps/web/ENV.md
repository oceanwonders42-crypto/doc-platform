# Environment — apps/web

## NEXT_PUBLIC_API_URL

| Environment | Where to set | Example value | Rebuild/restart |
|-------------|--------------|----------------|-----------------|
| **Local development** | `apps/web/.env.local` (or rely on dev fallback) | `http://localhost:4000` | Restart dev server (`pnpm dev`) after changing |
| **Production / deploy** | Platform env (e.g. DigitalOcean App Platform → envs, "Available at build") | `https://api.yourdomain.com` or `https://your-api-xxxx.ondigitalocean.app` | **Rebuild required** (Next.js bakes it into the client bundle at build time) |

- **Local:** Copy `apps/web/.env.local.example` to `apps/web/.env.local`. If you don't create `.env.local`, the app uses a development-only fallback (`http://localhost:4000`) when `NODE_ENV=development`.
- **Production:** Never use the dev fallback. Set `NEXT_PUBLIC_API_URL` in your hosting provider's environment and ensure it is available at **build time**.

See also: `DEPLOY_APP_PLATFORM.md`, `LOCAL_INTEGRATION.md`.
