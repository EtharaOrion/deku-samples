# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Stage 1: build the Angular application with its production builder.
# No service is reachable during the build, so nothing here touches the
# database or the mail server.
# ---------------------------------------------------------------------------
FROM node:20-bookworm-slim AS web-build
WORKDIR /build/web

COPY web/package.json web/package-lock.json ./
RUN npm ci

COPY web/angular.json web/tsconfig.json web/tsconfig.app.json ./
COPY web/public ./public
COPY web/src ./src

RUN npx ng build --configuration production

# ---------------------------------------------------------------------------
# Stage 2: build the Hono server.
# ---------------------------------------------------------------------------
FROM node:20-bookworm-slim AS server-build
WORKDIR /build/server

COPY server/package.json server/package-lock.json ./
RUN npm ci

COPY server/tsconfig.json ./
COPY server/src ./src

RUN npx tsc -p tsconfig.json

# ---------------------------------------------------------------------------
# Stage 3: production dependencies only.
# ---------------------------------------------------------------------------
FROM node:20-bookworm-slim AS server-deps
WORKDIR /build/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# ---------------------------------------------------------------------------
# Stage 4: the runtime image. It serves the production build and the JSON API
# on one origin, and applies its own schema and seed at container start.
# ---------------------------------------------------------------------------
FROM node:20-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    PORT=4173 \
    HOST=0.0.0.0 \
    STATIC_DIR=/app/public

COPY --from=server-deps /build/server/node_modules ./node_modules
COPY --from=server-build /build/server/dist ./dist
COPY server/package.json ./package.json

# The static output of the production builder, served behind the same origin.
COPY --from=web-build /build/web/dist/web/browser ./public

# Credentials for a grader, and the reserved directories named in the brief.
COPY USER_README.md ./USER_README.md
RUN mkdir -p /app/.browser_screenshots /app/.downloads \
 && chown -R node:node /app

USER node

# The container-internal port; the outside world reaches it through the
# ${APP_PUBLIC_PORT}:4173 mapping. Every address is read from the environment
# at container start, never hardcoded.
EXPOSE 4173

HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 4173) + '/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

# Runs in the foreground, bound to 0.0.0.0.
CMD ["node", "dist/index.js"]
