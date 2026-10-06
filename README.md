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
- **Deadline radar:** exam dates, interviews, fee due dates and calendar invites found in important emails
  become an Upcoming timeline with automatic WhatsApp reminders and a calendar feed for Google/Apple Calendar.
- **Act on alerts from WhatsApp:** every alert has a code like `#K7`: `/open K7`, `/reply K7`,
  `/remind K7 2h`, `/mute K7`, `/recent`, `/upcoming`, or just quote the alert and type "remind 2h".
- **Starter packs and suggestions:** one-click rules for exams, jobs, bank, security and more, plus
  suggestions based on what's actually in your inbox. Urgent rules alert even in quiet hours.
- **Reply by email from WhatsApp:** send `/email` (or `/email <template>`) to the bot, fill in the form it
  returns, attach photos or documents, confirm with YES, and the email goes out from your own Gmail or SMTP
  mailbox. Templates are managed in the dashboard.
- **Live dashboard:** a Next.js app with live updates over SSE, plus a separate admin console.

Architecture, data model and decisions: [docs/DESIGN.md](docs/DESIGN.md).

## Layout

```text
backend/    FastAPI API, Taskiq workers, dispatcher, rule engine (Python 3.13, uv)
frontend/   Next.js web app
deploy/     Docker Compose (base + dev + prod), Caddyfile, .env.example
docs/       Design document
```

## Deploy on a VM (production)

```bash
git clone https://github.com/rootski1729/Email_manager.git
cd Email_manager/deploy
./mailsentinel.sh install
```

That's it: one script installs the whole system (web app, API, workers, WhatsApp, database, automatic HTTPS
and nightly backups) with Docker. Then sign in to `/admin/login` and pair WhatsApp. See
**[deploy/README.md](deploy/README.md)** for requirements, updates, backups and troubleshooting.

The web app can also run on Vercel: import `frontend/` and set `API_ORIGIN` to your backend's public URL.

## Run everything locally (development)

Requirements: Docker with Compose v2, plus `uv` and `pnpm` for local development.

```bash
make env          # creates deploy/.env with fresh random secrets (including the admin password)
make dev          # postgres, redis, waha, api, worker, scheduler, dispatcher, sandbox mail server
cd frontend && pnpm install && pnpm dev   # http://localhost:3000
```

Without `make`, run `docker compose --env-file deploy/.env -f deploy/compose.yml -f deploy/compose.dev.yml up --build -d`.

1. **Admin console:** open http://localhost:3000/admin/login and sign in as `ADMIN_USERNAME` /
   `ADMIN_PASSWORD` from `deploy/.env`. Then go to **WhatsApp** and scan the QR code with the phone that will
   send alerts.
2. **Sign in as a client** at http://localhost:3000 with your phone number. In development, the code is also
   written to the API log (`make logs s=api`) in case WhatsApp isn't paired yet.
3. **Connect a mailbox.** To try it without Gmail, use the sandbox: IMAP host `mail-sandbox`, port `3143`,
   security `plain`, any username and password. Then run `make send-test-mail to=<that address>`.
4. **Choose what to watch:** switch on a ready-made topic (e.g. Exams & results) or write your own rule.

| URL | What |
|-----|------|
| http://localhost:8000/api/docs | API docs (OpenAPI) |
| http://localhost:3001/dashboard | WAHA dashboard (credentials in `deploy/.env`) |
| http://localhost:9100/metrics | Dispatcher metrics |

## Gmail setup

Done from the admin console (**Gmail setup**): a step-by-step guide with the exact redirect URI to paste into
Google Cloud, and an optional **Instant updates** section (Pub/Sub, pull mode). Without Pub/Sub, Gmail
mailboxes are checked every 5 minutes.

## Development

```bash
make test       # backend unit + integration tests (testcontainers: Postgres, Redis, GreenMail)
make lint       # ruff + pyright, eslint + tsc
make revision m="describe change"   # new Alembic migration
make openapi    # regenerate the typed frontend API client after changing the API
```
