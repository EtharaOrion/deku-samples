# syntax=docker/dockerfile:1

# ---------------------------------------------------------------- web build
# The Angular application is compiled with its production builder. No backing
# service is reachable during the build, and nothing here needs one.
FROM node:20-bookworm-slim AS web-build
WORKDIR /build/web

COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY web/angular.json web/tsconfig.json web/tsconfig.app.json web/tsconfig.spec.json ./
COPY web/src ./src
RUN npm run build

# ------------------------------------------------------------- server build
FROM node:20-bookworm-slim AS server-build
WORKDIR /build/server

COPY server/package.json server/package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY server/tsconfig.json ./
COPY server/src ./src
RUN npm run build

# ------------------------------------------------------------------ runtime
FROM node:20-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

# Production dependencies only.
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

# The compiled server, and the static build it serves.
COPY --from=server-build /build/server/dist ./dist
COPY --from=web-build /build/web/dist/web/browser ./public

# The server reads every address from the environment at container start;
# nothing here hardcodes a host or a port.
ENV STATIC_DIR=/app/public \
    PORT=4173 \
    HOST=0.0.0.0

EXPOSE 4173

# Run unprivileged. The `node` user ships with the base image.
USER node

# Readiness is the app's own health endpoint.
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=6 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4173)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Serves in the foreground. Migrations and the idempotent seed run at start,
# so the image brings up its own schema against a fresh database.
CMD ["node", "dist/index.js"]
