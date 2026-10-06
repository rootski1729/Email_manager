# Deploying MailSentinel on a VM

Everything runs in Docker on one machine. Any Linux VM works (Ubuntu, Debian, etc.): a cloud VM, a home server,
or a Raspberry Pi 5.

```text
Internet ──► Caddy :80/:443 (automatic HTTPS)
               ├── /api/*  ──► api (FastAPI)
               └── /*      ──► web (Next.js)
             api · worker · scheduler · dispatcher ──► Postgres · Redis · WAHA (WhatsApp)
             backup (nightly database dumps into ./backups)
```

Only ports 80 and 443 are open to the internet. The database, Redis and WhatsApp are reachable only inside
Docker.

## What you need

| | Minimum | Comfortable |
|---|---|---|
| CPU / RAM | 2 vCPU, 2 GB | 2 vCPU, 4 GB |
| Disk | 15 GB | 30 GB |
| Software | Docker with the Compose plugin | — |
| Network | Ports 80 and 443 open | a domain name, for HTTPS |

Install Docker if the VM doesn't have it:
```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER   # then log out and back in
```

## Install (about 5 minutes)

1. **Optional but recommended:** create a DNS `A` record for your domain (e.g. `mail.example.com`) pointing
   to the VM's public IP.
2. Get the code and run the installer:
   ```bash
   git clone https://github.com/rootski1729/Email_manager.git
   cd Email_manager/deploy
   ./mailsentinel.sh install
   ```
   The installer asks two questions: your **domain** (leave it empty to use the VM's IP over plain HTTP) and the
   **admin username**. It then:
   - generates every password and key into `deploy/.env` (readable only by you, never committed);
   - builds the images and starts the whole system;
   - gets an HTTPS certificate automatically when you gave a domain.
3. Open the **admin console** at `https://your-domain/admin/login`. Show your admin login with:
   ```bash
   ./mailsentinel.sh admin-password
   ```
   Change the password in the console after the first sign-in (your name → Change password).
4. Go to **WhatsApp** in the admin console and scan the QR code with the phone that will *send* alerts
   (WhatsApp → Linked devices).
5. *(Optional)* **Gmail setup** in the admin console. Follow the steps on that page; the redirect URI shown
   there is already correct for your domain.

Clients then sign up at `https://your-domain` with their WhatsApp number.

## Everyday commands

Run these from the `deploy/` folder.

| Command | What it does |
|---|---|
| `./mailsentinel.sh status` | Show every service and its health |
| `./mailsentinel.sh logs [service]` | Follow the logs (e.g. `logs api`, `logs dispatcher`) |
| `./mailsentinel.sh update` | Back up, pull the latest code, rebuild and restart; the database is upgraded automatically |
| `./mailsentinel.sh restart` / `stop` / `start` | Restart, stop or start everything |
| `./mailsentinel.sh backup` | Save a database dump to `backups/` right now |
| `./mailsentinel.sh restore backups/<file>.sql.gz` | Replace the data with a dump (asks you to confirm) |
| `./mailsentinel.sh admin-password` | Show the first admin's login |
| `./mailsentinel.sh gmail-listener on` | Turn on instant Gmail updates (see below) |
| `./mailsentinel.sh autodeploy on` | Deploy every new commit on `main` automatically (see below) |
| `./mailsentinel.sh deploy` | Back up, rebuild and restart from the code that's checked out now |

## Automatic deployment (CD)

`./mailsentinel.sh autodeploy on` installs a systemd timer on the VM. Every 2 minutes it checks GitHub for new
commits on `main`; when there are any:
1. it backs up the database;
2. it pulls the commit, rebuilds and restarts the app;
3. it checks the app is healthy. **If it isn't, it rolls back to the previous commit automatically** and skips
   the bad one.

Your data is never touched by a deploy. The database, WhatsApp pairing and HTTPS certificates live in Docker
volumes that survive rebuilds, and database changes are applied by migrations that only add tables and columns.

Nothing connects into the VM and no secrets are stored in GitHub; the VM pulls the public repository itself.
Set `AUTODEPLOY_REQUIRE_CI=true` in `.env` to deploy only commits whose GitHub Actions checks passed.

- `./mailsentinel.sh autodeploy status`: next check time and the last deployments
- `./mailsentinel.sh autodeploy logs`: full output of recent runs
- `./mailsentinel.sh autodeploy off`: stop deploying automatically

**Backups:**
- A nightly dump runs automatically (7 daily, 4 weekly and 3 monthly dumps are kept in `deploy/backups/`).
- Copy that folder off the VM now and then.
- To move to a new VM, copy `deploy/.env` and a backup across, run `install`, then `restore`.

> Keep `deploy/.env` safe. Its `ENCRYPTION_KEYS` decrypt the stored mailbox logins; without it, a database
> backup can't be used to read mailboxes and everyone must reconnect.

## Instant Gmail updates (optional)

Without this, Gmail is checked every 5 minutes. To get new mail within seconds:
1. Follow the Pub/Sub commands in the admin console (**Gmail setup → Instant updates**). They create a topic,
   a subscription and a key file.
2. Save the key as `deploy/secrets/gcp-pubsub.json`; the `secrets/` folder is never committed.
3. In the admin console, fill in the Project ID, choose **Pull**, and Save.
4. Run `./mailsentinel.sh gmail-listener on`.

## Settings

All settings are in `deploy/.env` (see `.env.example` for every option with comments). After editing it, run
`./mailsentinel.sh restart`. Common ones:

| Setting | Meaning |
|---|---|
| `SITE_ADDRESS` | Your domain, or `:80` for plain HTTP on the IP |
| `PUBLIC_WEB_URL` / `PUBLIC_API_URL` | The address people use, e.g. `https://mail.example.com`; used in WhatsApp links and the Google redirect URI |
| `HTTP_PORT` / `HTTPS_PORT` | Change only when 80/443 are taken |
| `RATE_GLOBAL_PER_MIN`, `RATE_DESTINATION_PER_MIN` | WhatsApp sending limits (keep them low to protect the number) |
| `TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET` | Optional CAPTCHA on the client login page |

**Switching from IP to a domain later:**
1. Set `SITE_ADDRESS=mail.example.com` and set `PUBLIC_WEB_URL`, `PUBLIC_API_URL` and `CORS_ORIGINS` to
   `https://mail.example.com`.
2. Run `./mailsentinel.sh restart`.
3. Update the redirect URI in Google Cloud if you use Gmail.

## Troubleshooting

| Problem | What to check |
|---|---|
| The site doesn't load | `./mailsentinel.sh status`; the VM firewall or cloud security group must allow ports 80 and 443 |
| No HTTPS certificate | The DNS `A` record must point to this VM, and port 80 must be reachable; check `./mailsentinel.sh logs caddy` |
| Clients get no login code | WhatsApp isn't paired: admin console → WhatsApp |
| "Gmail is not configured" | Admin console → Gmail setup |
| A mailbox shows "Having trouble" | Admin console → Mailboxes shows the error; `./mailsentinel.sh logs worker` |
| Out of disk space | `docker system prune` removes old images; also check the size of `deploy/backups/` |

## Local development

For hot-reload development (exposed ports, test mail server), see the main README:
`docker compose --env-file deploy/.env -f deploy/compose.yml -f deploy/compose.dev.yml up -d`.
