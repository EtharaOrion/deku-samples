# ---------- Stage 1: build the Angular application ----------
# node_modules and dist are excluded by .dockerignore, so this copies source only.
FROM node:20-bookworm-slim AS web-build
WORKDIR /web

COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY web ./
RUN npx ng build --configuration production

# ---------- Stage 2: build the server ----------
FROM node:20-bookworm-slim AS server-build
WORKDIR /server

COPY server/package.json server/package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY server ./
RUN npm run build

# ---------- Stage 3: runtime ----------
FROM node:20-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

# The server bundle keeps `pg` and the node adapter external, so the runtime
# image needs them in node_modules.
COPY server/package.json server/package-lock.json ./
RUN npm ci --no-audit --no-fund --omit=dev

COPY --from=server-build /server/dist ./dist
COPY --from=web-build /web/dist/app/browser ./dist/web

# Readiness probe against the endpoint the brief pins.
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:4173/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Bind 0.0.0.0 on the container-internal port, in the foreground.
# PORT/HOST may be overridden; 4173 is the container-internal default.
ENV PORT=4173 HOST=0.0.0.0
EXPOSE 4173
CMD ["node", "dist/server.js"]
