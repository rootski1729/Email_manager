COMPOSE_DEV = docker compose --env-file deploy/.env -f deploy/compose.yml -f deploy/compose.dev.yml
COMPOSE_PROD = docker compose --env-file deploy/.env -f deploy/compose.yml -f deploy/compose.prod.yml

.PHONY: help secrets env dev up down logs ps test lint migrate revision openapi send-test-mail prod

help:            ## Show targets
	@grep -E '^[a-z-]+:.*##' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  %-16s %s\n", $$1, $$2}'

secrets:         ## Print fresh random secrets for deploy/.env
	@python3 -c "import secrets,base64,os; \
	print('POSTGRES_PASSWORD=' + secrets.token_urlsafe(24)); \
	print('JWT_SECRET=' + secrets.token_urlsafe(48)); \
	print('ENCRYPTION_KEYS=' + base64.urlsafe_b64encode(os.urandom(32)).decode()); \
	print('WAHA_API_KEY=' + secrets.token_hex(24)); \
	print('WAHA_DASHBOARD_PASSWORD=' + secrets.token_urlsafe(18)); \
	print('WAHA_WEBHOOK_HMAC_KEY=' + secrets.token_hex(32))"

env:             ## Create deploy/.env from the example with fresh secrets (won't overwrite)
	@test -f deploy/.env && echo "deploy/.env already exists" || ( \
	  cp deploy/.env.example deploy/.env && \
	  $(MAKE) -s secrets | while IFS='=' read -r k v; do sed -i "s|^$$k=.*|$$k=$$v|" deploy/.env; done && \
	  echo "created deploy/.env" )

dev: env         ## Run the whole stack locally with hot reload
	$(COMPOSE_DEV) up --build -d
	@echo "API http://localhost:8000/api/docs · WAHA http://localhost:3001/dashboard · web: cd frontend && pnpm dev"

up: dev

down:            ## Stop the local stack
	$(COMPOSE_DEV) down

logs:            ## Follow logs (s=service)
	$(COMPOSE_DEV) logs -f $(s)

ps:              ## Show service status
	$(COMPOSE_DEV) ps

test:            ## Backend tests (needs Docker for integration tests)
	cd backend && uv run pytest -q

lint:            ## Lint + typecheck backend and frontend
	cd backend && uv run ruff check . && uv run pyright
	cd frontend && pnpm lint && pnpm typecheck

migrate:         ## Apply migrations in the running stack
	$(COMPOSE_DEV) run --rm migrate

revision:        ## New migration: make revision m="add x"
	cd backend && uv run alembic revision --autogenerate -m "$(m)"

openapi:         ## Regenerate the frontend API client from the backend
	cd backend && uv run python -m app.export_openapi ../frontend/openapi.json
	cd frontend && pnpm gen:api

send-test-mail:  ## Send a matching test email to the sandbox mailbox (to=address)
	@python3 -c "import smtplib; from email.message import EmailMessage as M; m=M(); \
	m['From']='Exam Cell <notices@exam.univ.edu>'; m['To']='$(or $(to),student@example.com)'; \
	m['Subject']='Admit card for end-semester exams'; m.set_content('Download your hall ticket before Friday.'); \
	s=smtplib.SMTP('localhost',3025); s.send_message(m); s.quit(); print('sent')"

prod:            ## Start the production stack (on the server)
	$(COMPOSE_PROD) up -d --build
