# syntax=docker/dockerfile:1

# ---------------------------------------------------------------- build stage
FROM node:20-bookworm-slim AS build

WORKDIR /app

# Dependencies first, so a source change does not re-resolve the tree.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# Sources needed to produce the production build.
COPY astro.config.mjs ./
COPY public ./public
COPY src ./src
COPY server ./server

# No backing service is reachable during a build, and this step needs none:
# Astro renders at request time, so the build only compiles.
RUN npm run build

# Drop the dev dependencies from the tree that ships.
RUN npm prune --omit=dev


# --------------------------------------------------------------- runtime stage
FROM node:20-bookworm-slim AS runtime

ENV NODE_ENV=production
# The container-internal port named by the deployment contract. The host
# mapping is the outside world's business and is never hardcoded here.
ENV PORT=4173
ENV HOST=0.0.0.0

WORKDIR /app

# Runs as an unprivileged user; the base image already carries `node`.
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/server ./server
COPY --from=build --chown=node:node /app/package.json ./package.json

# Reserved directories named by the deployment contract, present and empty.
RUN mkdir -p /app/.browser_screenshots /app/.downloads \
 && chown -R node:node /app/.browser_screenshots /app/.downloads

COPY --chown=node:node USER_README.md ./USER_README.md

USER node

EXPOSE 4173

# Every service address is read from the environment at container start. The
# app applies its own schema and seed on boot, so a database created from
# scratch is enough.
HEALTHCHECK --interval=10s --timeout=5s --start-period=40s --retries=12 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4173)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Serves the production build in the foreground. Never a dev server.
CMD ["node", "server/index.mjs"]
