# Ravel: Preact client + Hono API + postgres + keycloak + mailpit.
# No service is reachable during docker build; every address is read at start.

FROM node:20-bookworm-slim AS build
WORKDIR /app
ENV NODE_ENV=development

# Install the whole dependency set first so the layer caches.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# Build the client.
COPY tsconfig.json vite.config.js index.html ./
COPY src ./src
COPY public ./public
RUN npx vite build

# Copy the fonts into the dist output next to the hashed assets.
RUN cp -r public/assets/fonts dist/assets/fonts/

# ---- runtime ----
FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4173

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

COPY server ./server
COPY --from=build /app/dist ./dist

# Reserved directories exist and are empty.
RUN mkdir -p /app/.browser_screenshots /app/.downloads

EXPOSE 4173
CMD ["node", "server/index.js"]
