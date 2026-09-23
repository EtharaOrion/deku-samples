# Vela storefront. Astro (SSR, standalone node adapter) + Hono API, against
# PostgreSQL, Kill Bill and Mailpit.
#
# Grading rebuilds from source in a fresh container, so nothing from a warm
# working copy comes with it: schema and seed are applied by the app itself on
# first boot (src/server/seed.ts), and every service address is read from the
# environment at container start rather than baked in at build time.

FROM node:20-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4173

# astro.config.mjs imports src/server/env.ts, so the sources must be in place
# before the build runs. The dev toolchain is needed to build and is pruned
# afterwards, leaving only the runtime tree in the shipped image.
COPY package.json package-lock.json ./
COPY astro.config.mjs tsconfig.json ./
COPY src ./src
COPY public ./public
RUN npm ci --include=dev --no-audit --no-fund \
 && npm run build \
 && npm prune --omit=dev --no-audit --no-fund

# Reserved runtime directories. .vela-runtime-secret is written beside the app on
# first boot when APP_SECRET is not injected, so /app must stay writable.
RUN mkdir -p /app/.browser_screenshots /app/.downloads

EXPOSE 4173

# Serves in the foreground on 0.0.0.0:4173.
CMD ["node", "dist/server/entry.mjs"]
