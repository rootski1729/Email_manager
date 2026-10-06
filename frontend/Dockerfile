# syntax=docker/dockerfile:1.7
#
# MailSentinel web — multi-stage build producing a Next.js standalone server.
#
# API_ORIGIN must be provided at BUILD time: Next.js resolves `rewrites()` during
# `next build` and bakes the destination into the output. Setting it only at
# runtime does not change where /api/* is proxied.
#
#   docker build --build-arg API_ORIGIN=http://api:8000 -t mailsentinel-web frontend/
#   docker run -p 3000:3000 mailsentinel-web

ARG NODE_VERSION=24

FROM node:${NODE_VERSION}-alpine AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    NEXT_TELEMETRY_DISABLED=1 \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile

FROM base AS build
ARG API_ORIGIN=http://api:8000
ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY=
ARG NEXT_PUBLIC_APP_NAME=MailSentinel
ENV API_ORIGIN=${API_ORIGIN} \
    NEXT_PUBLIC_TURNSTILE_SITE_KEY=${NEXT_PUBLIC_TURNSTILE_SITE_KEY} \
    NEXT_PUBLIC_APP_NAME=${NEXT_PUBLIC_APP_NAME}
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm gen:api && pnpm build

FROM node:${NODE_VERSION}-alpine AS runner
ARG API_ORIGIN=http://api:8000
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    API_ORIGIN=${API_ORIGIN}
RUN addgroup -S -g 1001 nodejs && adduser -S -u 1001 -G nodejs nextjs
COPY --from=build --chown=nextjs:nodejs /app/public ./public
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/login" >/dev/null || exit 1
CMD ["node", "server.js"]
