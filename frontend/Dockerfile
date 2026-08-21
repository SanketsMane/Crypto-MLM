# syntax=docker/dockerfile:1.7

# ─────────────────────────────────────────────────────────────────────────────
# FortuneX web
#
# Next's standalone output traces the modules the server actually reaches, so
# the runtime image carries those rather than the whole dependency tree.
#
# One thing to know when deploying this: NEXT_PUBLIC_* values are inlined at
# BUILD time, not read at runtime. The API origin is therefore resolved in the
# browser by lib/api-base.ts instead, so one image runs against any environment
# — which is the reason a build-arg is not taken for it here.
# ─────────────────────────────────────────────────────────────────────────────

ARG NODE_VERSION=22-alpine


# ── deps ─────────────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION} AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json ./
RUN npm ci


# ── build ────────────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION} AS build
WORKDIR /app
RUN apk add --no-cache libc6-compat

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1

# The public site fetches /config while prerendering. If the API is not
# reachable at build time the pages still render, on the values this build
# shipped with — see lib/platform-config.server.ts.
ARG API_URL
ENV NEXT_PUBLIC_API_URL=${API_URL}

RUN npm run build


# ── runtime ──────────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION} AS runtime
WORKDIR /app

RUN apk add --no-cache tini

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3010 \
    HOSTNAME=0.0.0.0

# `standalone` carries its own minimal server and node_modules; public/ and
# .next/static are not traced and have to come across separately.
COPY --from=build /app/public ./public
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static

USER node

EXPOSE 3010

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
