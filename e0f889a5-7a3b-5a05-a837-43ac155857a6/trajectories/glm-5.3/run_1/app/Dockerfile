# syntax=docker/dockerfile:1
# Vela storefront: Astro (SSR) + Hono API + PostgreSQL + killbill + Mailpit.

FROM node:20-bookworm-slim AS deps
WORKDIR /app
ENV NODE_ENV=development
# Install the full dependency graph (build tools need devDependencies).
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:20-bookworm-slim AS build
WORKDIR /app
ENV NODE_ENV=development
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json astro.config.mjs ./
COPY src ./src
COPY server ./server
COPY data ./data
COPY public ./public
# The build needs no service reachable: it only compiles pages.
RUN npx astro build

FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl \
 && rm -rf /var/lib/apt/lists/*
# Production dependencies only. The node adapter's runtime helpers (send,
# server-destroy) are its own dependencies, so the adapter is a prod dependency.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY --from=build /app/dist ./dist
COPY server ./server
COPY data ./data
COPY public ./public
COPY server.mjs ./
COPY USER_README.md ./
# Reserved, empty, and kept out of the image context by .dockerignore locally,
# but created here so they always exist at the app root.
RUN mkdir -p /app/.browser_screenshots /app/.downloads
ENV APP_INTERNAL_PORT=4173 \
    NODE_ENV=production \
    HOST=0.0.0.0
EXPOSE 4173
# Schema and seed are applied by the image itself at start.
CMD ["node", "server.mjs"]
