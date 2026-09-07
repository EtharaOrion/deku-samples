# syntax=docker/dockerfile:1

# ---------------------------------------------------------------- web build --
# The Angular app is built with its production builder and its static output is
# copied into the runtime image, which serves it. No dev server ever runs.
FROM node:20-bookworm-slim AS web-build
WORKDIR /build/web

COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY web/ ./
RUN npx ng build --configuration production

# ------------------------------------------------------------- server build --
FROM node:20-bookworm-slim AS server-build
WORKDIR /build/server

COPY server/package.json server/package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY server/tsconfig.json ./
COPY server/src ./src
RUN npx tsc -p tsconfig.json

# ------------------------------------------------------------------ runtime --
FROM node:20-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

# Production dependencies alone; the build toolchain stays out of the image.
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

COPY --from=server-build /build/server/dist ./dist
COPY --from=web-build /build/web/dist/web/browser ./public
COPY USER_README.md ./USER_README.md

# The reserved directories exist at the app root.
RUN mkdir -p /app/.browser_screenshots /app/.downloads

# 4173 is the container-internal port this brief names. The public port is
# whatever the outside world maps onto it, and is never read here.
ENV PORT=4173
ENV HOST=0.0.0.0
ENV WEB_ROOT=/app/public
EXPOSE 4173

# Every service address is read from the environment at container start; no
# service is reachable during the build, so nothing here contacts one.
USER node

HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4173)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Runs in the foreground, bound to 0.0.0.0. Migrations and the idempotent seed
# are applied by the image itself, on start, against DATABASE_URL.
CMD ["node", "dist/index.js"]
