# Vela storefront: Astro islands over a Hono API, one origin, one process.
#
# The build compiles the site; no backing service is contacted here. Every host
# and port is read from the environment when the container starts.

FROM node:20-bookworm-slim AS build
WORKDIR /app

ENV NPM_CONFIG_FUND=false \
    NPM_CONFIG_AUDIT=false \
    NPM_CONFIG_UPDATE_NOTIFIER=false

# Dependencies first, so a source change does not re-resolve the tree.
COPY package.json package-lock.json ./
RUN npm ci

# Sources needed by the Astro build.
COPY astro.config.mjs ./
COPY public ./public
COPY src ./src
COPY server ./server

RUN npm run build


FROM node:20-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    PORT=4173 \
    TZ=UTC

# The Astro server build imports `astro/app/node`, so the tree stays whole.
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --chown=node:node server ./server
COPY --chown=node:node USER_README.md ./USER_README.md

# Reserved, and empty, at the app root.
RUN mkdir -p /app/.browser_screenshots /app/.downloads \
 && chown node:node /app/.browser_screenshots /app/.downloads

USER node

EXPOSE 4173

# The schema, the seed and the listener all start here. The server binds 0.0.0.0,
# runs in the foreground, and handles SIGTERM itself.
CMD ["node", "server/index.js"]
