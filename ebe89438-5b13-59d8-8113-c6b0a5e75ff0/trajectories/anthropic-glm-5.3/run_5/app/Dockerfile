# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Community Calendar — production image.
# Build happens with no network access to the backing services: everything that
# touches PostgreSQL or Mailpit runs at container start, never at build time.
# ---------------------------------------------------------------------------

FROM node:20-slim AS build

WORKDIR /app

# Manifests first so dependency layers cache independently of source.
COPY package.json package-lock.json ./
COPY server/package.json server/package.json
COPY web/package.json web/package.json

RUN npm ci --no-audit --no-fund

# Server sources and compile.
COPY server/tsconfig.json server/tsconfig.json
COPY server/src server/src
RUN npm run build -w server

# Web sources and the production Angular build, then pack next to the server.
COPY web/angular.json web/tsconfig.json web/tsconfig.app.json web/tsconfig.spec.json web/
COPY web/src web/src
COPY web/public web/public
COPY scripts scripts
RUN npm run build -w web && node scripts/pack.mjs

# ---------------------------------------------------------------------------

FROM node:20-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app

# Only the four runtime libraries the server needs.
COPY package.json package-lock.json ./
COPY server/package.json server/package.json
RUN npm ci --omit=dev --no-audit --no-fund --workspace server \
 && npm cache clean --force

COPY --from=build /app/server/dist server/dist
COPY --from=build /app/web-dist web-dist

# The container-internal port; the public port is mapped onto it.
ENV PORT=4173 \
    WEB_DIST=/app/web-dist

EXPOSE 4173

# Schema, migrations and idempotent seed are applied by the app itself at boot.
CMD ["node", "server/dist/index.js"]
