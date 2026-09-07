# ---- Stage 1: the Angular front end, built with its production builder ----
FROM node:20-bookworm-slim AS web
WORKDIR /build
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY web/angular.json ./
COPY web/tsconfig.json web/tsconfig.app.json ./
COPY web/src ./src
RUN npx ng build --configuration production

# ---- Stage 2: the Hono API server, compiled then pruned to runtime deps ----
FROM node:20-bookworm-slim AS server
WORKDIR /build
COPY server/package.json server/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY server/tsconfig.json ./
COPY server/src ./src
RUN npx tsc -p tsconfig.json && npm prune --omit=dev

# ---- Stage 3: run in the foreground ----
FROM node:20-bookworm-slim
ENV NODE_ENV=production
ENV PORT=4173
ENV HOST=0.0.0.0
WORKDIR /app

COPY --from=server /build/node_modules ./node_modules
COPY --from=server /build/dist ./server/dist
COPY server/db ./server/db
COPY server/package.json ./server/package.json
COPY --from=web /build/dist/web/browser ./web-dist

# The schema, migrations and seed are applied by the image itself on start.
ENV WEB_DIR=/app/web-dist
ENV DB_DIR=/app/server/db

EXPOSE 4173
CMD ["node", "server/dist/index.js"]
