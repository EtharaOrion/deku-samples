# Ravel. One production build, one origin, one foreground process.
# No service is reachable during the build, so nothing here touches the network
# beyond the package registry: the schema and the seed are applied by the image
# itself, at container start, against the database named in the environment.

# ---------------------------------------------------------------- build stage
FROM node:20-bookworm-slim AS build
WORKDIR /build

# Dependencies first, so a source change does not re-resolve the tree.
COPY package.json package-lock.json ./
RUN npm ci

# The client is built here; the server is plain ES modules and needs no build.
COPY vite.config.js ./
COPY client ./client
RUN npm run build

# Only what the server needs at runtime, resolved without the dev tree.
RUN npm ci --omit=dev

# -------------------------------------------------------------- runtime stage
FROM node:20-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY --from=build /build/node_modules ./node_modules
COPY --from=build /build/dist ./dist
COPY package.json ./
COPY server ./server
COPY db ./db
COPY USER_README.md ./

# Reserved and empty, as the deployment contract requires.
RUN mkdir -p /app/.browser_screenshots /app/.downloads \
 && chown -R node:node /app

USER node

# 4173 is the container-internal port. What the outside world uses is the
# published mapping and is never read from in here.
EXPOSE 4173

# Ready means the database is migrated, the seed is applied and the client is
# on disk. Until then this answers 503 rather than pretending.
HEALTHCHECK --interval=10s --timeout=5s --start-period=40s --retries=12 \
  CMD node -e "fetch('http://127.0.0.1:4173/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# The server binds 0.0.0.0 and runs in the foreground as PID 1's child, so the
# container's lifetime is the app's lifetime.
CMD ["node", "server/index.js"]
