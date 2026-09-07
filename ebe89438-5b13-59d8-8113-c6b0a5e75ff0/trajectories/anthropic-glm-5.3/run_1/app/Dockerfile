# syntax=docker/dockerfile:1

# ---------- Stage 1: build the Angular front end ----------
FROM node:20-bookworm-slim AS web-build
WORKDIR /build/web
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY web/angular.json web/tsconfig.json web/tsconfig.app.json ./
COPY web/src ./src
COPY web/public ./public
RUN ./node_modules/.bin/ng build --configuration production

# ---------- Stage 2: build the Hono server ----------
FROM node:20-bookworm-slim AS server-build
WORKDIR /build/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY server/tsconfig.json ./
COPY server/src ./src
RUN ./node_modules/.bin/tsc -p tsconfig.json

# ---------- Stage 3: production install of server runtime deps ----------
FROM node:20-bookworm-slim AS server-deps
WORKDIR /deps
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

# ---------- Stage 4: the image that runs ----------
FROM node:20-bookworm-slim
ENV NODE_ENV=production
ENV PORT=4173
WORKDIR /app

COPY --from=server-deps /deps/node_modules ./server/node_modules
COPY --from=server-build /build/server/dist ./server/dist
COPY server/package.json ./server/package.json
COPY --from=web-build /build/web/dist/web ./web/dist/web

# every service address is read from the environment at container start
ENV WEB_DIST=/app/web/dist/web/browser

EXPOSE 4173
CMD ["node", "server/dist/index.js"]
