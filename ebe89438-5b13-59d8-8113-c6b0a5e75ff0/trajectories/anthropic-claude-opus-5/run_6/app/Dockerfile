# syntax=docker/dockerfile:1

# ---------------------------------------------------------------- web builder
FROM node:20-bookworm-slim AS web-builder
WORKDIR /build/web

# dependencies first, so a source-only change does not refetch them
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY web/angular.json web/tsconfig.json web/tsconfig.app.json ./
COPY web/src ./src
COPY web/public ./public

# the production builder; no service is reachable during the build
RUN npx ng build --configuration production

# ------------------------------------------------------------- server builder
FROM node:20-bookworm-slim AS server-builder
WORKDIR /build/server

COPY server/package.json server/package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY server/tsconfig.json ./
COPY server/src ./src
RUN npx tsc -p tsconfig.json

# ---------------------------------------------------------------- run-time
FROM node:20-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

# production dependencies only
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

COPY --from=server-builder /build/server/dist ./dist
COPY --from=web-builder /build/web/dist/web ./public
COPY USER_README.md ./USER_README.md

# the container-internal port this brief names; the mapping is set outside
ENV PORT=4173
ENV HOST=0.0.0.0
ENV STATIC_DIR=/app/public

EXPOSE 4173

# every service address is read from the environment at container start
HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4173)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# runs in the foreground, bound to 0.0.0.0
CMD ["node", "dist/index.js"]
