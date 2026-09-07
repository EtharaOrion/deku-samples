# Vela storefront. One image, one process, serving the server-rendered pages and
# the /api routes on the same origin.

# ---- build ----------------------------------------------------------------
FROM node:20-bookworm-slim AS build
WORKDIR /app

ENV NPM_CONFIG_FUND=false \
    NPM_CONFIG_AUDIT=false \
    NPM_CONFIG_UPDATE_NOTIFIER=false

# Dependencies first, so a source change does not re-resolve the tree.
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund || npm install --no-audit --no-fund

# Sources. No backing service is reachable during the build, so nothing here
# touches the database, the billing platform or the mail server.
COPY astro.config.mjs ./
COPY public ./public
COPY src ./src
COPY server ./server

RUN npm run build

# Drop the build-only dependencies from the tree that ships.
RUN npm prune --omit=dev

# ---- run ------------------------------------------------------------------
FROM node:20-bookworm-slim AS run
WORKDIR /app

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4173 \
    TZ=UTC

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/server ./server
COPY USER_README.md ./USER_README.md

# Reserved directories, present and empty in the image.
RUN mkdir -p /app/.browser_screenshots /app/.downloads

# The container-internal port the brief names. The mapping to the outside world
# is ${APP_PUBLIC_PORT}:4173 and is made by whoever runs this image.
EXPOSE 4173

# Every service address is read from the environment at container start.
# Bound to 0.0.0.0, in the foreground, as PID 1's child under tini-style
# signal handling provided by node's own SIGTERM handler in server/index.js.
USER node

HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=10 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4173)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/index.js"]
