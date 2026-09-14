# Vela storefront. Grading builds this from source; the image applies its own
# schema and seed at start and serves the app in the foreground on 4173.
FROM node:20-bookworm-slim AS build
WORKDIR /app

ENV NODE_ENV=development
ENV ASTRO_TELEMETRY_DISABLED=1

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build && node scripts/build-server.mjs

FROM node:20-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4173
ENV HOST=0.0.0.0
ENV ASTRO_TELEMETRY_DISABLED=1

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

COPY --from=build /app/dist ./dist

# Reserved directories, present and empty.
RUN mkdir -p /app/.browser_screenshots /app/.downloads

EXPOSE 4173
CMD ["node", "./dist/server/entrypoint.mjs"]
