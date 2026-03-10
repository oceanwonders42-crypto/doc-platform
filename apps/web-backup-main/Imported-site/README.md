This is a [Next.js](https://nextjs.org) project for the Onyx Intel marketing website.

## Local development

### Quick start

```bash
npm install
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000) in your browser.

### If the dev server won’t start (lock or port in use)

Use the reset script to free ports and clear the dev lock, then start the server:

```bash
npm run dev:reset
```

This will:

1. Kill any process on port **3000**
2. Kill any process on port **3004**
3. Remove `.next/dev/lock`
4. Run `npm run dev`

### Manual reset (same steps by hand)

If you prefer to run the steps yourself:

```bash
# 1. Kill stuck ports (Mac/Linux)
kill -9 $(lsof -ti :3000) 2>/dev/null
kill -9 $(lsof -ti :3004) 2>/dev/null

# 2. Remove Next.js dev lock
rm -f .next/dev/lock

# 3. Start the dev server
npm run dev
```

Then open **http://localhost:3000** (or the port Next.js prints if 3000 was in use).

### Exact startup command

For a normal run (no conflicts):

```bash
npm run dev
```

For a clean run after lock/port issues:

```bash
npm run dev:reset
```

---

## Project structure

- **App router:** `src/app/` (pages, layout)
- **Components:** `src/components/`
- **Shared lib:** `src/lib/`

You can start editing the homepage at `src/app/page.tsx`. The dev server will hot-reload as you edit.

## Build and production

```bash
npm run build
npm run start
```

Production behavior is unchanged; `dev` and `dev:reset` are for local development only.

## Deploy on Vercel

The easiest way to deploy is with the [Vercel Platform](https://vercel.com/new). Check the [Next.js deployment docs](https://nextjs.org/docs/app/building-your-application/deploying) for more.
