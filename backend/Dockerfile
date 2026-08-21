# syntax=docker/dockerfile:1.7

# ─────────────────────────────────────────────────────────────────────────────
# FortuneX API
#
# Multi-stage so the shipped image carries the compiled output and production
# dependencies only — no TypeScript, no test suite, no source. Smaller to pull,
# and far less surface to attack.
#
# The API and the worker run from the SAME image with different commands. They
# share the schema, the money engine and the config, so building them
# separately would only create a way for the two to drift.
# ─────────────────────────────────────────────────────────────────────────────

ARG NODE_VERSION=22-alpine


# ── deps: production node_modules only ───────────────────────────────────────
FROM node:${NODE_VERSION} AS deps
WORKDIR /app

# Prisma's engines need these on Alpine.
RUN apk add --no-cache libc6-compat openssl

COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./

# `npm ci --omit=dev` skips the postinstall that generates the Prisma client,
# so it is run explicitly against the schema copied above.
RUN npm ci --omit=dev --ignore-scripts \
 && npx prisma generate


# ── build: compile TypeScript with the full toolchain ────────────────────────
FROM node:${NODE_VERSION} AS build
WORKDIR /app

RUN apk add --no-cache libc6-compat openssl

COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npm ci --ignore-scripts && npx prisma generate

COPY tsconfig.json ./
COPY src ./src
RUN npm run build


# ── runtime ──────────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION} AS runtime
WORKDIR /app

RUN apk add --no-cache libc6-compat openssl tini

ENV NODE_ENV=production \
    PORT=4000 \
    # Fail fast rather than hanging when the heap is exhausted.
    NODE_OPTIONS="--max-old-space-size=768"

COPY --from=deps  /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
# Migrations ship with the image so `migrate deploy` can run from it.
COPY prisma ./prisma
COPY prisma.config.ts ./

# KYC documents and ticket attachments land here. Mount a volume over it in
# production — a container filesystem is not durable storage.
RUN mkdir -p /app/storage \
 && chown -R node:node /app/storage

# Never root. A process that only needs to read its own code has no business
# being able to write anywhere else.
USER node

EXPOSE 4000

# The image ships without a HEALTHCHECK on purpose: the orchestrator owns
# probing, and a duplicate check inside the container only confuses which one
# decided to restart it. /api/v1/health and /api/v1/ready are there for it.

# tini reaps zombies and forwards SIGTERM, so the graceful shutdown in
# server.ts actually runs instead of the process being killed outright.
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/server.js"]
