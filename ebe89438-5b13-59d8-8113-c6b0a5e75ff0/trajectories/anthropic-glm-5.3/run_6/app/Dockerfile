# ---------- build the Angular application -------------------------------------
FROM node:20-bookworm-slim AS webbuild
WORKDIR /build
COPY web/package*.json ./
RUN npm ci --no-audit --no-fund
COPY web/angular.json web/tsconfig*.json ./
COPY web/src ./src
COPY web/public ./public
RUN npx ng build --configuration production

# ---------- build the Hono server --------------------------------------------
FROM node:20-bookworm-slim AS serverbuild
WORKDIR /build
COPY server/package*.json ./
RUN npm ci --no-audit --no-fund
COPY server/tsconfig.json ./
COPY server/src ./src
# full install to compile, then a clean production-only install for the runtime
RUN npx tsc && npm ci --omit=dev --no-audit --no-fund

# ---------- the image the container runs -------------------------------------
FROM node:20-bookworm-slim
ENV NODE_ENV=production
ENV PORT=4173
ENV WEBROOT_DIR=/app/web
WORKDIR /app

COPY --from=serverbuild /build/node_modules ./server/node_modules
COPY --from=serverbuild /build/dist ./server/dist
COPY --from=serverbuild /build/package.json ./server/package.json
COPY --from=webbuild /build/dist/web/browser ./web

# the reserved, empty directories the harness reads
RUN mkdir -p /app/.browser_screenshots /app/.downloads

EXPOSE 4173
# every backing service address is read from the environment at start
CMD ["node", "server/dist/index.js"]
