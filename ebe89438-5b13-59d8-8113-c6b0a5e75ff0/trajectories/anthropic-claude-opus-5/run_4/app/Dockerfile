# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Stage 1: build the Angular application with its production builder.
# ---------------------------------------------------------------------------
FROM node:20-bookworm-slim AS web-build
WORKDIR /build/web

# Dependencies first, so a change to the source does not refetch them.
COPY web/package.json web/package-lock.json ./
RUN npm ci

COPY web/angular.json web/tsconfig.json web/tsconfig.app.json ./
COPY web/src ./src

# The production builder. The product ships no image files, so there is no
# asset folder to copy: every picture is drawn by the code.
RUN npm run build -- --configuration production

# ---------------------------------------------------------------------------
# Stage 2: build the Hono server.
# ---------------------------------------------------------------------------
FROM node:20-bookworm-slim AS server-build
WORKDIR /build/server

COPY server/package.json server/package-lock.json ./
RUN npm ci

COPY server/tsconfig.json ./
COPY server/src ./src

RUN npm run build

# ---------------------------------------------------------------------------
# Stage 3: the runtime image. Production dependencies only.
# ---------------------------------------------------------------------------
FROM node:20-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=server-build /build/server/dist ./dist
COPY --from=web-build /build/web/dist/web/browser ./public

COPY USER_README.md ./USER_README.md

# The compiled server serves both the JSON API under /api and the built
# application shell, so there is one origin and one port.
ENV STATIC_DIR=/app/public
ENV PORT=4173
ENV BIND_HOST=0.0.0.0

# The container-internal port named by the brief. Every service address is read
# from the environment at container start; none is baked in here.
EXPOSE 4173

USER node

# A readiness probe that answers only once the schema and the seed are applied.
HEALTHCHECK --interval=10s --timeout=5s --start-period=40s --retries=6 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4173)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# In the foreground, as PID 1.
CMD ["node", "dist/index.js"]
