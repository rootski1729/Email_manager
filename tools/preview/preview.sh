#!/usr/bin/env bash
# Local preview of MailSentinel with realistic data, for checking UI changes before they ship.
#
#   tools/preview/preview.sh infra        # Postgres, Redis and a GreenMail mailbox in Docker; migrate
#   tools/preview/preview.sh ai|api|web   # run the AI stand-in, the API or the web app (each in the foreground)
#   tools/preview/preview.sh seed         # demo user "Asha" + sample emails synced through the real pipeline
#   tools/preview/preview.sh shoot NAME light|dark|both PAGE...   # screenshots into $PREVIEW_DIR/shots/NAME
#   tools/preview/preview.sh down         # remove the containers
#
# Nothing here touches production. Secrets are generated per run; WhatsApp is in dry-run mode (codes go to
# the API log), so sign-in works without a phone.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
DIR="${PREVIEW_DIR:-/tmp/mailsentinel-preview}"
mkdir -p "$DIR"
ENV="$DIR/env.sh"

case "${1:-}" in
  infra)
    docker rm -f ms-preview-pg ms-preview-redis ms-preview-mail >/dev/null 2>&1 || true
    docker run -d --name ms-preview-pg -e POSTGRES_PASSWORD=preview -e POSTGRES_USER=preview -e POSTGRES_DB=preview \
      -p 127.0.0.1:55432:5432 postgres:17-alpine >/dev/null
    docker run -d --name ms-preview-redis -p 127.0.0.1:56379:6379 redis:8-alpine >/dev/null
    docker run -d --name ms-preview-mail -p 127.0.0.1:53025:3025 -p 127.0.0.1:53143:3143 \
      -e GREENMAIL_OPTS="-Dgreenmail.setup.test.all -Dgreenmail.hostname=0.0.0.0 -Dgreenmail.auth.disabled" \
      greenmail/standalone:2.1.3 >/dev/null
    cat > "$ENV" <<VARS
export ENVIRONMENT=development
export DATABASE_URL=postgresql+asyncpg://preview:preview@127.0.0.1:55432/preview
export REDIS_URL=redis://127.0.0.1:56379/0
export ENCRYPTION_KEYS=$(python3 -c "import base64,os;print(base64.urlsafe_b64encode(os.urandom(32)).decode())")
export JWT_SECRET=$(python3 -c "import secrets;print(secrets.token_hex(24))")
export WAHA_URL=http://127.0.0.1:9
export WAHA_DRY_RUN=true
export IMAP_ALLOW_INSECURE=true
export ADMIN_USERNAME=admin
export ADMIN_PASSWORD=preview-admin-pass
export PUBLIC_WEB_URL=http://localhost:3000
export LOG_JSON=false
VARS
    until docker exec ms-preview-pg pg_isready -U preview >/dev/null 2>&1; do sleep 1; done
    until docker logs ms-preview-mail 2>&1 | grep -q "Starting GreenMail standalone"; do sleep 1; done
    . "$ENV" && cd "$ROOT/backend" && uv run alembic upgrade head
    docker image inspect ms-shooter >/dev/null 2>&1 || docker build -q -t ms-shooter -f "$HERE/Dockerfile.shooter" "$HERE"
    echo "Preview infrastructure is up. Next: ai, api and web (each in its own terminal), then seed."
    ;;
  ai) exec python3 "$HERE/mock_ai.py" ;;
  api) . "$ENV" && cd "$ROOT/backend" && exec uv run uvicorn app.main:app --host 127.0.0.1 --port 8000 >"$DIR/api.log" 2>&1 ;;
  web) cd "$ROOT/frontend" && API_ORIGIN=http://127.0.0.1:8000 exec pnpm exec next dev -p 3000 ;;
  seed) . "$ENV" && cd "$ROOT/backend" && PYTHONPATH=. uv run python "$HERE/seed.py" "$DIR/token.txt" ;;
  shoot)
    shift; name="$1"; shift
    # Reset sign-in rate limits only (another shooter may be signing in at the same time).
    docker exec ms-preview-redis sh -c 'redis-cli --scan --pattern "rl:*" | xargs -r redis-cli del' >/dev/null
    docker run --rm --network host -e FULL="${FULL:-0}" -e PHONE="${PHONE:-1}" -e API_LOG=/work/api.log \
      -v "$DIR:/work" -v "$HERE:/tools:ro" ms-shooter python /tools/shoot.py "/work/shots/$name" "$@"
    echo "Screenshots: $DIR/shots/$name"
    ;;
  down) docker rm -f ms-preview-pg ms-preview-redis ms-preview-mail >/dev/null 2>&1 || true; echo "Removed." ;;
  *) sed -n '2,12p' "$0"; exit 1 ;;
esac
