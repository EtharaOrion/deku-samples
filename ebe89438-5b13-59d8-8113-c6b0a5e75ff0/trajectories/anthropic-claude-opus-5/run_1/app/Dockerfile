# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# 1. Build the Angular application with its production builder.
# ---------------------------------------------------------------------------
FROM node:20-bookworm-slim AS web
WORKDIR /build/web

COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY web/tsconfig.json web/tsconfig.app.json web/angular.json ./
COPY web/public ./public
COPY web/src ./src

# the production configuration is this project's default for `ng build`
RUN npx ng build --configuration production

# ---------------------------------------------------------------------------
# 2. Compile the Hono API.
# ---------------------------------------------------------------------------
FROM node:20-bookworm-slim AS api
WORKDIR /build/server

COPY server/package.json server/package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY server/tsconfig.json ./
COPY server/src ./src
RUN npx tsc -p tsconfig.json

# ---------------------------------------------------------------------------
# 3. The runtime image: production dependencies, compiled server, static build.
# ---------------------------------------------------------------------------
FROM node:20-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

COPY --from=api /build/server/dist ./dist
# the compiled server serves this directory as the application shell
COPY --from=web /build/web/dist/web/browser ./public
COPY USER_README.md ./USER_README.md

# Reserved directories, kept out of the shipped source by .dockerignore and
# re-created empty here so the app root always carries them.
RUN mkdir -p /app/.browser_screenshots /app/.downloads \
 && chown -R node:node /app

USER node

# The container-internal port. APP_PUBLIC_PORT is what the outside world maps
# onto it, and neither address is hardcoded: every one is read from the
# environment at container start.
ENV PORT=4173
ENV HOST=0.0.0.0
EXPOSE 4173

HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4173)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Runs in the foreground, applies its own schema and seed, then binds 0.0.0.0.
CMD ["node", "dist/index.js"]
