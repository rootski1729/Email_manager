# MailSentinel — web

The monitoring and configuration UI for MailSentinel: connect mailboxes, build rules,
watch matches arrive live, and manage WhatsApp delivery.

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 + shadcn/ui ·
TanStack Query · openapi-fetch · Recharts · dnd-kit.

## Develop

```bash
cp .env.example .env.local      # point API_ORIGIN at your backend
pnpm install
pnpm gen:api                    # regenerate src/lib/api/schema.d.ts from openapi.json
pnpm dev                        # http://localhost:3000
```

The backend dev stack (`docker compose -f deploy/compose.yml -f deploy/compose.dev.yml up`)
serves the API on `http://localhost:8000`. Refresh `openapi.json` from
`http://localhost:8000/api/openapi.json` when the contract changes, then run `pnpm gen:api`.

Checks: `pnpm lint`, `pnpm typecheck`, `pnpm build`.

## How it talks to the API

- The browser only calls its own origin. `next.config.ts` rewrites `/api/:path*` to
  `${API_ORIGIN}/api/:path*`, so the httpOnly refresh cookie (`ms_refresh`, path
  `/api/v1/auth`) is first-party and server-sent events use the same path.
- The access token lives in memory only. On load the app calls `POST /api/v1/auth/refresh`;
  a 401 triggers one shared refresh and a single retry; tokens refresh about 60 s before
  they expire. A Web Lock serialises refreshes across tabs so rotating refresh tokens are
  never replayed.
- Live updates come from `GET /api/v1/events` (SSE with a bearer header, reconnects with
  backoff) and invalidate the matching TanStack Query caches.

## Environment

| Variable | When | Purpose |
| --- | --- | --- |
| `API_ORIGIN` | **build time** | Backend origin for the `/api/*` rewrite. Default `http://localhost:8000`. |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | build time | Shows Cloudflare Turnstile on sign-in when set. |
| `NEXT_PUBLIC_APP_NAME` | build time | Product name in the UI. Default `MailSentinel`. |

Next.js resolves rewrites and inlines `NEXT_PUBLIC_*` values during `next build`. Changing
them requires a rebuild.

## Deploy on Vercel

1. Import the repository and set the root directory to `frontend`.
2. Set `API_ORIGIN` to the backend's public URL (for example `https://api.example.com`),
   plus the optional variables above. No `vercel.json` is needed.
3. In the backend, set `PUBLIC_WEB_URL` to the Vercel URL (links in WhatsApp alerts and
   OAuth return redirects point there). `PUBLIC_API_URL` can also be the web origin so
   Google's OAuth callback (`/api/v1/oauth/google/callback`) flows through the rewrite;
   register that URL as an authorised redirect URI in Google Cloud.

## Docker (self-hosting)

```bash
docker build --build-arg API_ORIGIN=http://api:8000 -t mailsentinel-web .
docker run -p 3000:3000 mailsentinel-web
```

The image runs the standalone server as a non-root user on `PORT=3000`. Because rewrites
are baked at build time, pass `API_ORIGIN` as a **build arg**; the runtime variable is set
to the same value for visibility only.

## Layout

```
src/app            routes: / (landing), /login, and the signed-in (app) group
src/components     ui/ (shadcn), layout/, dashboard/, mailboxes/, rules/, messages/, templates/, sent/,
                   deliveries/, destinations/, settings/, admin/, common/
src/lib/api        generated schema, typed client, query keys and hooks, problem+json errors
src/lib/auth       in-memory session store and auth context
src/lib/realtime   SSE connection and event fan-out
src/lib/rules      condition tree model, validation (depth ≤ 6, ≤ 60 nodes, ≤ 25 values), summaries
```
