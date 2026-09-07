# Gatherline — community calendar hosting
# Angular SPA (production build) + Hono API + PostgreSQL + Mailpit SMTP.

# ---- build the web bundle ----
FROM node:20-bookworm-slim AS web
ENV NG_CLI_ANALYTICS=false CI=1
WORKDIR /build/web
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY web/angular.json web/tsconfig.json web/tsconfig.app.json ./
COPY web/src ./src
RUN npx ng build

# ---- build the server ----
FROM node:20-bookworm-slim AS server
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY server/tsconfig.json ./server/tsconfig.json
COPY server/src ./server/src
RUN npx tsc -p server/tsconfig.json

# ---- runtime ----
FROM node:20-bookworm-slim AS run
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY --from=server /build/server/dist ./server/dist
COPY --from=web /build/web/dist/web ./web-dist

# The schema, the seed and the static shell are applied by the app at start.
ENV PORT=4173
EXPOSE 4173
CMD ["node", "server/dist/main.js"]
