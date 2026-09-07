# syntax=docker/dockerfile:1

# ---------- Stage 1: build the Angular application ----------
FROM node:20-bookworm-slim AS frontend
WORKDIR /build
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/angular.json frontend/tsconfig.json frontend/tsconfig.app.json ./
COPY frontend/src ./src
RUN npx --no-install ng build

# ---------- Stage 2: build the Hono server ----------
FROM node:20-bookworm-slim AS server
WORKDIR /build
COPY server/package.json server/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY server/tsconfig.json ./
COPY server/src ./src
RUN npx --no-install tsc -p tsconfig.json

# ---------- Stage 3: runtime ----------
FROM node:20-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

# the compiled server, the SQL migrations it applies at boot, and the built SPA
COPY --from=server /build/dist ./dist
COPY server/src/migrations ./src/migrations
COPY --from=frontend /build/dist/browser ./public

# every address is read from the environment at container start
ENV APP_ROOT=/app \
    STATIC_DIR=/app/public \
    MIGRATIONS_DIR=/app/src/migrations \
    PORT=4173
EXPOSE 4173

HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4173)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# migrations and the idempotent seed are applied by the image itself
CMD ["node", "dist/index.js"]
