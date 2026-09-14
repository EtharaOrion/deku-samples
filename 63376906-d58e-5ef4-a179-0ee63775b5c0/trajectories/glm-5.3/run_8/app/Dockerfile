# Ravel. One image: the Preact client built to static files, the Hono API, the
# schema and the seed applied at container start. No service is reachable at
# build time; every dependency is vendored under vendor/npmtars.

FROM node:20-bookworm-slim

WORKDIR /app

COPY package.json ./
COPY vendor ./vendor
COPY client ./client
COPY server ./server

# Install the vendored dependencies offline: no registry, no network.
RUN mkdir -p node_modules && \
    for f in vendor/npmtars/*.tgz; do \
      n=$(basename "$f" .tgz); \
      base=$(echo "$n" | sed -E 's/-[0-9]+(\.[0-9]+)*$//'); \
      case "$n" in \
        @esbuild+*) d="node_modules/@esbuild/$(echo "$base" | sed 's/^@esbuild+//')";; \
        hono-node-server-*) d="node_modules/@hono/node-server";; \
        *) d="node_modules/$base";; \
      esac; \
      mkdir -p "$d" && \
      tar xzf "$f" -C "$d" --strip-components=1; \
    done && \
    chmod +x node_modules/esbuild/bin/esbuild node_modules/@esbuild/*/bin/esbuild 2>/dev/null || true

# Build the client into server/public from the vendored toolchain.
RUN node client/build.mjs

ENV NODE_ENV=production \
    PORT=4173

EXPOSE 4173

# The schema, the seed and the record-chain fixup are applied by the app itself
# on start, then the API and the static client are served in the foreground.
CMD ["node", "server/index.mjs"]
