# Ravel: a Preact client and a Hono API, served as one production build from one origin.
FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY vite.config.js vitest.config.js ./
RUN npm ci --no-audit --no-fund
COPY client ./client
COPY api ./api
COPY schema ./schema
RUN npx vite build

FROM node:20-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY api ./api
COPY schema ./schema
COPY --from=build /app/client/dist ./client/dist
RUN mkdir -p .browser_screenshots .downloads
ENV PORT=4173
EXPOSE 4173
# The app applies its own schema and seed at start; every service address comes from the environment.
CMD ["node", "api/src/index.js"]
