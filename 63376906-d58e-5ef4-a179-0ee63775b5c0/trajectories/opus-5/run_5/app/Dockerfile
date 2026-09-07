# Ravel. One production build, one origin, served in the foreground.
#
# No service is reachable during the build, so nothing here contacts postgres,
# keycloak or mailpit. Every address is read from the environment at container
# start, and the schema, the migrations and the seed are applied by the image
# itself when the process comes up.

# ---------------------------------------------------------------- build stage
FROM node:20-bookworm-slim AS build

WORKDIR /build

# Dependencies first, so a source change does not re-resolve the tree.
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund

# The client sources and the build configuration.
COPY vite.config.js ./
COPY client ./client

# The production client build. Never a dev server, and no source map ships.
RUN npm run build \
 && test -f client/dist/index.html \
 && test -d client/dist/assets \
 && test -f client/dist/fonts/literata.woff2 \
 && test -f client/dist/fonts/inter.woff2 \
 && test -f client/dist/fonts/jetbrains-mono.woff2 \
 && if find client/dist -name '*.map' -print -quit | grep -q .; then echo 'a source map was emitted'; exit 1; fi

# --------------------------------------------------------------- runtime image
FROM node:20-bookworm-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app

# Only the runtime dependencies. The build toolchain does not ship.
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

# The API, the migrations and the seed.
COPY server ./server
COPY db ./db

# The built client, served from the same origin under the same server.
COPY --from=build /build/client/dist ./client/dist

# Login credentials for a reader arriving at this image.
COPY USER_README.md ./USER_README.md

# Reserved directories, present and empty, and owned by the user the process
# runs as so that anything writing into them can. The app itself writes no file:
# every record it keeps is in postgres.
RUN mkdir -p /app/.browser_screenshots /app/.downloads \
 && chown -R node:node /app/.browser_screenshots /app/.downloads

# 4173 is the container-internal port named in the deployment contract. The
# outside mapping is APP_PUBLIC_PORT and is never read here.
EXPOSE 4173

# The server binds 0.0.0.0 so it is reachable from outside the container, and it
# answers GET /api/health with 200 once the migrations and the seed have run.
HEALTHCHECK --interval=10s --timeout=5s --start-period=45s --retries=12 \
  CMD node -e "fetch('http://127.0.0.1:4173/api/health').then(r=>process.exit(r.status===200?0:1)).catch(()=>process.exit(1))"

USER node

# The process runs in the foreground as PID 1's child under node's own signal
# handling, so the container stays up for as long as the server does.
CMD ["node", "server/src/index.js"]
