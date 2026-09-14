# Vela storefront. Multi-stage: build the Astro app, then run it on a slim image.

FROM node:20-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
# The build needs no service addresses: every host is read at container start.
RUN npm run build

# The release artifacts are generated at build time from deterministic bytes.
RUN node scripts/make-artifacts.mjs

FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY --from=build /app/src ./src
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/.downloads-cache ./.downloads-cache
COPY --from=build /app/public ./public

# Schema and seed are applied by the image itself before serving.
ENV ARTIFACT_DIR=/app/.downloads-cache
EXPOSE 4173

CMD ["sh", "-c", "node scripts/migrate.mjs && node server/index.js"]
