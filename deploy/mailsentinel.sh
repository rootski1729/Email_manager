#!/usr/bin/env bash
# MailSentinel on any Linux VM with Docker.
#
#   ./mailsentinel.sh install            first-time setup: asks a few questions, generates secrets, starts everything
#   ./mailsentinel.sh update             pull the latest code, rebuild, restart (database is migrated automatically)
#   ./mailsentinel.sh status | logs [service] | restart | stop | start
#   ./mailsentinel.sh backup             dump the database to ./backups now
#   ./mailsentinel.sh restore <file>     restore a dump (stops the app while restoring)
#   ./mailsentinel.sh admin-password     show the first admin's username and password
#   ./mailsentinel.sh gmail-listener on|off   instant Gmail updates (needs secrets/gcp-pubsub.json)
#   ./mailsentinel.sh autodeploy on|off|status|logs   deploy new commits on main automatically (with rollback)
#
# Settings live in .env next to this script (ENV_FILE overrides the path). Never commit it.
set -euo pipefail

DIR="${MS_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
cd "$DIR"
ENV_FILE="${ENV_FILE:-$DIR/.env}"
export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-mailsentinel}"

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
info() { printf '  \033[36m•\033[0m %s\n' "$*"; }
ok() { printf '  \033[32m✓\033[0m %s\n' "$*"; }
die() { printf '\033[31mError:\033[0m %s\n' "$*" >&2; exit 1; }

compose() {
  local profiles=()
  if grep -q '^GMAIL_LISTENER=on' "$ENV_FILE" 2>/dev/null; then profiles=(--profile gmail); fi
  docker compose --env-file "$ENV_FILE" -f compose.yml -f compose.prod.yml "${profiles[@]}" "$@"
}

env_get() { grep -E "^$1=" "$ENV_FILE" | tail -1 | cut -d= -f2-; }
env_set() {
  local key="$1" value="$2"
  if grep -qE "^$key=" "$ENV_FILE"; then
    # `|` is never part of generated values; escape & for sed.
    sed -i "s|^$key=.*|$key=${value//&/\\&}|" "$ENV_FILE"
  else
    printf '%s=%s\n' "$key" "$value" >> "$ENV_FILE"
  fi
}

rand() { head -c "${1:-24}" /dev/urandom | base64 | tr -d '\n=+/' | cut -c1-"${2:-32}"; }
fernet_key() { head -c 32 /dev/urandom | base64 | tr '+/' '-_' | tr -d '\n'; }

need_docker() {
  command -v docker >/dev/null || die "Docker is not installed. Install it with: curl -fsSL https://get.docker.com | sh"
  docker compose version >/dev/null 2>&1 || die "Docker Compose v2 is missing (the 'docker compose' plugin)."
  docker info >/dev/null 2>&1 || die "Can't talk to Docker. Run as root or add your user to the 'docker' group."
}

wait_healthy() {
  info "Waiting for the app to come up (first start builds images; this can take a few minutes)…"
  for _ in $(seq 1 90); do
    if compose exec -T api python -c "import urllib.request;urllib.request.urlopen('http://127.0.0.1:8000/readyz',timeout=2)" \
        >/dev/null 2>&1; then
      ok "Backend is healthy"
      return 0
    fi
    sleep 4
  done
  printf '  \033[31m✗\033[0m %s\n' "The backend didn't become healthy. Check: ./mailsentinel.sh logs api" >&2
  return 1
}

public_url() {
  local site; site="$(env_get SITE_ADDRESS)"
  if [[ "$site" != :* ]]; then echo "https://${site}"; return; fi
  # No domain: plain HTTP on this VM's public IP (or LAN IP when there's no internet lookup).
  local ip; ip="$(curl -fsS -m 4 https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')"
  local port; port="$(env_get HTTP_PORT)"
  if [[ -n "$port" && "$port" != 80 ]]; then echo "http://${ip}:${port}"; else echo "http://${ip}"; fi
}

cmd_install() {
  need_docker
  bold "MailSentinel – first-time setup"
  if [[ -f "$ENV_FILE" ]]; then
    info "$ENV_FILE already exists; keeping your settings (run 'update' to upgrade)."
  else
    cp .env.example "$ENV_FILE"
    chmod 600 "$ENV_FILE"
    # Unattended: DOMAIN=mail.example.com ADMIN_USER=admin ./mailsentinel.sh install
    local domain="${DOMAIN-__ask__}" admin_user="${ADMIN_USER:-}"
    if [[ "$domain" == "__ask__" ]]; then
      echo
      echo "  A domain gives you HTTPS automatically (point its DNS A record at this VM first)."
      echo "  Leave it empty to use this VM's IP address over plain HTTP (fine for trying it out)."
      read -r -p "  Domain (e.g. mail.example.com): " domain
    fi
    if [[ -z "$admin_user" ]]; then
      if [[ -t 0 ]]; then read -r -p "  Admin username [admin]: " admin_user; fi
      admin_user="${admin_user:-admin}"
    fi

    env_set ENVIRONMENT production
    env_set LOG_JSON true
    env_set POSTGRES_PASSWORD "$(rand 24 32)"
    env_set JWT_SECRET "$(rand 48 64)"
    env_set ENCRYPTION_KEYS "$(fernet_key)"
    env_set WAHA_API_KEY "$(rand 24 40)"
    env_set WAHA_DASHBOARD_PASSWORD "$(rand 18 24)"
    env_set WAHA_WEBHOOK_HMAC_KEY "$(rand 32 64)"
    env_set ADMIN_USERNAME "$admin_user"
    env_set ADMIN_PASSWORD "$(rand 18 20)"
    if [[ -n "$domain" ]]; then
      env_set SITE_ADDRESS "$domain"
    else
      env_set SITE_ADDRESS ":80"
    fi
    local url; url="$(public_url)"
    env_set PUBLIC_WEB_URL "$url"
    env_set PUBLIC_API_URL "$url"
    env_set CORS_ORIGINS "$url"
    ok "Created $ENV_FILE with fresh secrets"
  fi
  mkdir -p backups secrets
  if [[ -f secrets/gcp-pubsub.json ]] && ! grep -q '^GMAIL_LISTENER=' "$ENV_FILE"; then env_set GMAIL_LISTENER on; fi
  info "Building and starting (Postgres, Redis, WhatsApp, API, workers, web app, HTTPS proxy)…"
  compose up -d --build --remove-orphans
  wait_healthy || exit 1
  echo
  bold "MailSentinel is running 🎉"
  echo "  Web app:        $(public_url)"
  echo "  Admin console:  $(public_url)/admin/login"
  echo "  Admin login:    ./mailsentinel.sh admin-password"
  echo
  echo "  Next: sign in to the admin console → WhatsApp → scan the QR code with the phone that sends alerts."
}

# Build and restart from the code that is checked out now. Data volumes (database, WhatsApp session,
# certificates) are never touched; schema changes are applied by the one-shot `migrate` service.
cmd_deploy() {
  need_docker
  [[ -f "$ENV_FILE" ]] || die "Not installed yet. Run: ./mailsentinel.sh install"
  info "Backing up the database first…"
  cmd_backup || info "Backup skipped (database not running yet)"
  compose up -d --build --remove-orphans || return 1
  wait_healthy || return 1
  docker image prune -f >/dev/null 2>&1 || true
  ok "Deployed $(git -C "$DIR/.." rev-parse --short HEAD 2>/dev/null || echo)"
}

cmd_update() {
  if git -C "$DIR/.." rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    info "Pulling the latest code…"
    git -C "$DIR/.." pull --ff-only
  fi
  cmd_deploy || exit 1
}

# ---------------------------------------------------------------- automatic deployment (pull-based)
# A systemd timer runs `autodeploy-run` every 2 minutes: when `main` has new commits it deploys them, and
# rolls back to the previous commit if the new version isn't healthy. Nothing connects into the VM and no
# secrets are stored in GitHub. With AUTODEPLOY_REQUIRE_CI=true it only deploys commits whose GitHub
# checks all passed.
BRANCH="${AUTODEPLOY_BRANCH:-main}"
STATE_DIR="$DIR/.autodeploy"

ci_state() {  # success | pending | failure | none
  local sha="$1" url repo
  url="$(git -C "$DIR/.." remote get-url origin)"
  repo="$(sed -E 's#(git@github.com:|https://github.com/)##; s#\.git$##' <<<"$url")"
  curl -fsS -m 20 -H "Accept: application/vnd.github+json" \
    "https://api.github.com/repos/$repo/commits/$sha/check-runs?per_page=100" 2>/dev/null |
    python3 -c '
import json, sys
runs = json.load(sys.stdin).get("check_runs", [])
if not runs: print("none")
elif any(r["status"] != "completed" for r in runs): print("pending")
elif all(r["conclusion"] in ("success", "skipped", "neutral") for r in runs): print("success")
else: print("failure")' 2>/dev/null || echo "none"
}

cmd_autodeploy_run() {
  mkdir -p "$STATE_DIR"
  # The update rewrites this very file; bash reads scripts lazily, so run from a private copy.
  if [[ -z "${MS_RUNNER:-}" ]]; then
    cp "$DIR/mailsentinel.sh" "$STATE_DIR/runner.sh"
    MS_RUNNER=1 MS_DIR="$DIR" exec bash "$STATE_DIR/runner.sh" autodeploy-run
  fi
  exec 9>"$STATE_DIR/lock"
  flock -n 9 || { echo "Another deploy is running"; return 0; }
  local repo="$DIR/.." current target
  git -C "$repo" fetch -q origin "$BRANCH" || { echo "fetch failed"; return 1; }
  current="$(git -C "$repo" rev-parse HEAD)"
  target="$(git -C "$repo" rev-parse "origin/$BRANCH")"
  [[ "$current" == "$target" ]] && return 0
  if grep -qx "$target" "$STATE_DIR/skipped" 2>/dev/null; then return 0; fi
  if [[ "$(env_get AUTODEPLOY_REQUIRE_CI)" == "true" ]]; then
    case "$(ci_state "$target")" in
      success) ;;
      pending | none) echo "Waiting for GitHub checks on ${target:0:7}"; return 0 ;;
      failure) echo "${target:0:7} failed its GitHub checks; not deploying"; echo "$target" >> "$STATE_DIR/skipped"; return 0 ;;
    esac
  fi
  echo "$(date -Is) deploying ${current:0:7} -> ${target:0:7}" | tee -a "$STATE_DIR/history.log"
  git -C "$repo" merge -q --ff-only "$target" || { echo "Local changes on the VM block the update"; return 1; }
  if cmd_deploy; then
    echo "$(date -Is) deployed ${target:0:7}" | tee -a "$STATE_DIR/history.log"
    return 0
  fi
  echo "$(date -Is) ${target:0:7} is unhealthy; rolling back to ${current:0:7}" | tee -a "$STATE_DIR/history.log"
  echo "$target" >> "$STATE_DIR/skipped"
  git -C "$repo" reset -q --hard "$current"
  cmd_deploy && echo "$(date -Is) rolled back to ${current:0:7}" | tee -a "$STATE_DIR/history.log"
  return 1
}

cmd_autodeploy() {
  local unit=mailsentinel-autodeploy
  case "${1:-status}" in
    on)
      command -v flock >/dev/null || die "flock is missing (apt install util-linux)"
      sudo tee /etc/systemd/system/$unit.service >/dev/null <<UNIT
[Unit]
Description=MailSentinel: deploy new commits from GitHub
After=network-online.target docker.service
Wants=network-online.target

[Service]
Type=oneshot
User=$(id -un)
Group=docker
Environment=ENV_FILE=$ENV_FILE
ExecStart=$DIR/mailsentinel.sh autodeploy-run
UNIT
      sudo tee /etc/systemd/system/$unit.timer >/dev/null <<UNIT
[Unit]
Description=MailSentinel: check GitHub for new commits every 2 minutes

[Timer]
OnBootSec=2min
OnUnitActiveSec=2min
Persistent=true

[Install]
WantedBy=timers.target
UNIT
      sudo systemctl daemon-reload
      sudo systemctl enable --now $unit.timer
      ok "Automatic deployment is on (branch $BRANCH, every 2 minutes)" ;;
    off)
      sudo systemctl disable --now $unit.timer
      ok "Automatic deployment is off" ;;
    status)
      systemctl list-timers $unit.timer --no-pager || true
      echo; tail -n 10 "$STATE_DIR/history.log" 2>/dev/null || echo "No deployments yet." ;;
    logs) journalctl -u $unit.service -n 100 --no-pager ;;
    *) die "Usage: ./mailsentinel.sh autodeploy on|off|status|logs" ;;
  esac
}

cmd_backup() {
  mkdir -p backups
  local file="backups/manual-$(date +%Y%m%d-%H%M%S).sql.gz"
  compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists' | gzip > "$file"
  [[ -s "$file" ]] || { rm -f "$file"; return 1; }
  ok "Saved $file ($(du -h "$file" | cut -f1))"
}

cmd_restore() {
  local file="${1:-}"
  [[ -f "$file" ]] || die "Usage: ./mailsentinel.sh restore backups/<file>.sql.gz"
  read -r -p "This replaces ALL current data with $file. Type 'restore' to continue: " answer
  [[ "$answer" == "restore" ]] || die "Cancelled"
  compose stop caddy web api worker scheduler dispatcher gmail-listener >/dev/null 2>&1 || true
  if [[ "$file" == *.gz ]]; then gunzip -c "$file"; else cat "$file"; fi |
    compose exec -T postgres sh -c 'psql -q -U "$POSTGRES_USER" -d "$POSTGRES_DB"' >/dev/null
  compose up -d
  wait_healthy || exit 1
  ok "Restored $file"
}

cmd_admin_password() {
  [[ -f "$ENV_FILE" ]] || die "Not installed yet."
  echo "Username: $(env_get ADMIN_USERNAME)"
  echo "Password: $(env_get ADMIN_PASSWORD)"
  echo "(Used only to create the first admin. Change it in the admin console → your name → Change password.)"
}

cmd_gmail_listener() {
  case "${1:-}" in
    on)
      [[ -f secrets/gcp-pubsub.json ]] || die "Put the service-account key at deploy/secrets/gcp-pubsub.json first."
      env_set GMAIL_LISTENER on
      compose up -d gmail-listener
      ok "Instant Gmail updates are on" ;;
    off)
      env_set GMAIL_LISTENER off
      docker compose --env-file "$ENV_FILE" -f compose.yml -f compose.prod.yml --profile gmail rm -sf gmail-listener
      ok "Instant Gmail updates are off (Gmail is checked every 5 minutes)" ;;
    *) die "Usage: ./mailsentinel.sh gmail-listener on|off" ;;
  esac
}

main() {
  local cmd="${1:-help}"; shift || true
  case "$cmd" in
    install) cmd_install ;;
    update) cmd_update ;;
    deploy) cmd_deploy || exit 1 ;;
    autodeploy) cmd_autodeploy "$@" ;;
    autodeploy-run) cmd_autodeploy_run ;;
    start) compose up -d ;;
    stop) compose stop ;;
    restart) compose restart ;;
    status) compose ps ;;
    logs) compose logs -f --tail=200 "$@" ;;
    backup) need_docker; cmd_backup ;;
    restore) need_docker; cmd_restore "$@" ;;
    admin-password) cmd_admin_password ;;
    gmail-listener) cmd_gmail_listener "$@" ;;
    *) sed -n '2,14p' "$0" | sed 's/^# \{0,1\}//' ;;
  esac
}
main "$@"
