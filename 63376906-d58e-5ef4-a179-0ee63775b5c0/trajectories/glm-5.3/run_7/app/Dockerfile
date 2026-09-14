# syntax=docker/dockerfile:1
# Ravel: one image, one origin. Preact client built by Vite, Hono API on Node 20,
# every service address read from the environment at container start.

FROM node:20-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY tsconfig.json vite.config.ts ./
COPY client ./client
COPY server ./server
COPY tools ./tools

# The client and the server bundle are built here; no service is reachable at
# build time and none is contacted.
RUN npm run build

FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4173

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

COPY --from=build /app/dist ./dist
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/server/schema.sql ./server/schema.sql
COPY --from=build /app/server/seed.sql ./server/seed.sql

# schema and seed are read beside the bundle at start
RUN cp server/schema.sql server/dist/schema.sql && cp server/seed.sql server/dist/seed.sql \
 && mkdir -p .browser_screenshots .downloads

EXPOSE 4173
CMD ["node", "server/dist/start.mjs"]
