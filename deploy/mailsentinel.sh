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
#
# Settings live in .env next to this script (ENV_FILE overrides the path). Never commit it.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
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
  die "The backend didn't become healthy. Check: ./mailsentinel.sh logs api"
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
  wait_healthy
  echo
  bold "MailSentinel is running 🎉"
  echo "  Web app:        $(public_url)"
  echo "  Admin console:  $(public_url)/admin/login"
  echo "  Admin login:    ./mailsentinel.sh admin-password"
  echo
  echo "  Next: sign in to the admin console → WhatsApp → scan the QR code with the phone that sends alerts."
}

cmd_update() {
  need_docker
  [[ -f "$ENV_FILE" ]] || die "Not installed yet. Run: ./mailsentinel.sh install"
  if git -C "$DIR/.." rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    info "Pulling the latest code…"
    git -C "$DIR/.." pull --ff-only
  fi
  info "Backing up the database first…"
  cmd_backup || info "Backup skipped (database not running yet)"
  compose up -d --build --remove-orphans
  wait_healthy
  docker image prune -f >/dev/null 2>&1 || true
  ok "Updated"
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
  wait_healthy
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
    start) compose up -d ;;
    stop) compose stop ;;
    restart) compose restart ;;
    status) compose ps ;;
    logs) compose logs -f --tail=200 "$@" ;;
    backup) need_docker; cmd_backup ;;
    restore) need_docker; cmd_restore "$@" ;;
    admin-password) cmd_admin_password ;;
    gmail-listener) cmd_gmail_listener "$@" ;;
    *) sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//' ;;
  esac
}
main "$@"
