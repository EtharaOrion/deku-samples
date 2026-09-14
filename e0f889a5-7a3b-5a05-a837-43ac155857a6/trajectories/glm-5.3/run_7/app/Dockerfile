# Vela storefront. Builds the Astro app and serves it in the foreground.
# Every service address is read from the environment at container start.

FROM node:20-bookworm-slim AS build
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund

COPY . .
RUN npm run build

FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4173

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/public ./public

# Reserved directories, present and empty.
RUN mkdir -p /app/.browser_screenshots /app/.downloads

EXPOSE 4173
CMD ["node", "dist/server/entry.mjs"]
