# Ravel: a Preact client and a Hono API served as one production build from one
# origin.
#
# No service is reachable during the build, so nothing here contacts postgres,
# keycloak or mailpit. Every address is read from the environment at container
# start, and the schema and the seed are applied by the image itself when it
# runs.

# ----------------------------------------------------------------- build
FROM node:20-bookworm-slim AS build
WORKDIR /build

# Dependencies first, so a change to the source does not re-resolve the tree.
# The client has no separate manifest: vite, preact and the preact preset are
# devDependencies of the one package.json at the root, so this single install
# covers both halves of the build.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# The client's source, its three subset woff2 faces and its vite config.
COPY client ./client

# The production build. Vite writes client/dist and copies client/public into
# it, so the faces and the favicon land beside the hashed assets.
RUN npx vite build --config client/vite.config.js client

# ------------------------------------------------------------- runtime
FROM node:20-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

# Only the production dependency tree: hono, its node server, pg and nodemailer.
# Vite and Preact are build tools and neither is needed to serve.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

# The server, and the client build produced above.
COPY server ./server
COPY --from=build /build/client/dist ./client/dist

# The two reserved directories exist at the app root, empty.
RUN mkdir -p /app/.browser_screenshots /app/.downloads

# Credentials, or the statement that there are none, live here.
COPY USER_README.md ./USER_README.md

# 4173 is the container-internal port the deployment contract names. What the
# outside world uses is the host side of the mapping and is not this image's
# concern.
EXPOSE 4173

# Bind 0.0.0.0, never loopback: a loopback-only listener is unreachable from
# outside the container. The server does this itself; this is the record of it.
ENV HOST=0.0.0.0

# Node runs in the foreground as PID 1 so the container's lifetime is the
# server's lifetime and a stop signal reaches it.
CMD ["node", "server/index.js"]
