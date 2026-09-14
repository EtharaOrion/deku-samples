# Vela storefront. Astro (SSR) + Hono API + PostgreSQL + killbill + Mailpit.

FROM node:20-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4173
ENV HOST=0.0.0.0

# The lockfile is present, so install the whole tree once: the build needs the
# dev toolchain and `npm prune` afterwards leaves only runtime dependencies.
COPY package.json package-lock.json ./
COPY astro.config.mjs tsconfig.json ./
COPY src ./src
COPY public ./public
RUN npm ci --include=dev --no-audit --no-fund \
 && npm run build \
 && npm prune --omit=dev --no-audit --no-fund

# Runtime state directories.
RUN mkdir -p /app/.browser_screenshots /app/.downloads

EXPOSE 4173

# The container serves in the foreground on 0.0.0.0:4173.
CMD ["node", "dist/server/entry.mjs"]
