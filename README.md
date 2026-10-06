# MailSentinel

Never miss an important email again. MailSentinel watches all your mailboxes (Gmail and any IMAP account),
runs your rules on every new message, and sends the ones that matter to WhatsApp through a self-hosted
[WAHA](https://waha.devlike.pro/) instance.

- **Rules over any part of an email:** sender, domain *including subdomains*, recipients, subject, body, any
  header, mailing list, attachments. Combine them with AND / OR / NOT and dry-run them against your recent
  mail before saving.
- **Reliable WhatsApp delivery:** a Postgres outbox, one dispatcher with global, per-chat and daily rate limits
  in Redis, retries with backoff, dead letters, bursts merged into one message, quiet hours, digests, and
  delivered/read receipts.
- **Reply by email from WhatsApp:** send `/email` (or `/email <template>`) to the bot, fill in the form it
  returns, attach photos or documents, confirm with YES, and the email goes out from your own Gmail or SMTP
  mailbox. Templates are managed in the dashboard.
- **Live dashboard:** a Next.js app (deployable to Vercel) with live updates over SSE.

Architecture, data model and decisions: [docs/DESIGN.md](docs/DESIGN.md).

## Layout

```text
backend/    FastAPI API, Taskiq workers, dispatcher, rule engine (Python 3.13, uv)
frontend/   Next.js web app
deploy/     Docker Compose (base + dev + prod), Caddyfile, .env.example
docs/       Design document
```

## Run everything locally

Requirements: Docker with Compose v2, plus `uv` and `pnpm` for local development.

```bash
make env          # creates deploy/.env with fresh random secrets
# edit deploy/.env: set ADMIN_PHONES=+<your number>
make dev          # postgres, redis, waha, api, worker, scheduler, dispatcher, sandbox mail server
cd frontend && pnpm install && pnpm dev   # http://localhost:3000
```

Without `make`, run `docker compose --env-file deploy/.env -f deploy/compose.yml -f deploy/compose.dev.yml up --build -d`.

1. **Sign in** with your phone number. Until WhatsApp is paired, the login code for numbers listed in
   `ADMIN_PHONES` (or any number outside production) is written to the API log:
   `make logs s=api`.
2. **Pair WhatsApp:** open *Admin*, then scan the QR code with the phone that will send the alerts.
3. **Connect a mailbox.** To try it without Gmail, use the sandbox: IMAP host `mail-sandbox`, port `3143`,
   security `plain`, any username and password. Then run `make send-test-mail to=<that address>`.
4. **Create a rule**, for example "sender domain matches `univ.edu` and anywhere contains `exam`".

| URL | What |
|-----|------|
| http://localhost:8000/api/docs | API docs (OpenAPI) |
| http://localhost:3001/dashboard | WAHA dashboard (credentials in `deploy/.env`) |
| http://localhost:9100/metrics | Dispatcher metrics |

## Gmail setup (optional)

1. In Google Cloud, create OAuth credentials (web application) and add the redirect URI
   `${PUBLIC_API_URL}/api/v1/oauth/google/callback`. Enable the Gmail API.
2. Create a Pub/Sub topic, and grant `gmail-api-push@system.gserviceaccount.com` the *Publisher* role on it.
3. Choose how notifications arrive:
   - **Pull (default, no public URL needed):** create a pull subscription. Put a service-account key with the
     *Subscriber* role at `deploy/secrets/gcp-pubsub.json`, then start the stack with `--profile gmail`.
   - **Push:** create a push subscription to `${PUBLIC_API_URL}/api/v1/webhooks/gmail` with authentication
     enabled. Set `GMAIL_PUSH_MODE=push`, `GMAIL_PUSH_AUDIENCE` and `GMAIL_PUSH_SERVICE_ACCOUNT`.
4. Fill in `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_PROJECT_ID` and `GOOGLE_PUBSUB_TOPIC`.

Without Pub/Sub, Gmail mailboxes are still polled every minute. Watches are renewed automatically.

## Production

- **Backend:** on a VPS, set `ENVIRONMENT=production`, `API_DOMAIN`, `PUBLIC_WEB_URL`, `PUBLIC_API_URL` and
  `CORS_ORIGINS` in `deploy/.env`, then run `make prod`. Caddy terminates TLS; Postgres is backed up daily
  to `deploy/backups/`.
- **Frontend:** import `frontend/` into Vercel and set `API_ORIGIN=https://<API_DOMAIN>`. Because the app
  proxies `/api`, you can set `PUBLIC_API_URL` to the Vercel domain so OAuth stays on one origin.

## Development

```bash
make test       # backend unit + integration tests (testcontainers: Postgres, Redis, GreenMail)
make lint       # ruff + pyright, eslint + tsc
make revision m="describe change"   # new Alembic migration
make openapi    # regenerate the typed frontend API client after changing the API
```
