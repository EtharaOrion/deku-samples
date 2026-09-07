# syntax=docker/dockerfile:1

# ---------------------------------------------------------------- web build
# The Angular application is compiled with its production builder. No backing
# service is reachable during a build, so nothing here talks to one.
FROM node:20-bookworm-slim AS web-build
WORKDIR /build/web

COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY web/ ./
RUN npx ng build --configuration production

# ------------------------------------------------------------- server build
FROM node:20-bookworm-slim AS server-build
WORKDIR /build/server

COPY server/package.json server/package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY server/tsconfig.json ./
COPY server/src ./src
RUN npx tsc -p tsconfig.json

# ------------------------------------------------------------------ runtime
FROM node:20-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

# Only the production dependencies the server actually loads.
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

COPY --from=server-build /build/server/dist ./dist
COPY --from=web-build /build/web/dist/web/browser ./web-dist

# Reserved directories the deployment contract names, kept empty in the image.
RUN mkdir -p /app/.browser_screenshots /app/.downloads
COPY USER_README.md ./USER_README.md

# The container-internal port; APP_PUBLIC_PORT is what the outside world maps.
ENV PORT=4173
ENV HOST=0.0.0.0
ENV WEB_ROOT=/app/web-dist
EXPOSE 4173

# Every service address is read from the environment at container start.
# Schema, migrations and seed are applied by the image itself on boot.
HEALTHCHECK --interval=10s --timeout=5s --start-period=40s --retries=6 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4173)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

USER node

# Runs in the foreground, bound to 0.0.0.0.
CMD ["node", "dist/index.js"]
