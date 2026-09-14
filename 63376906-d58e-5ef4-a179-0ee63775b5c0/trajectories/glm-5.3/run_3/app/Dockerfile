FROM node:20-bookworm-slim AS deps
WORKDIR /app
ENV NODE_ENV=development
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:20-bookworm-slim AS build
WORKDIR /app
ENV NODE_ENV=development
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json vite.config.js index.html ./
COPY src ./src
COPY public ./public
RUN npm run build

FROM node:20-bookworm-slim AS prune
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=4173
COPY --from=prune /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY server ./server
COPY package.json ./
COPY USER_README.md ./
RUN mkdir -p /app/.browser_screenshots /app/.downloads
EXPOSE 4173
CMD ["sh", "-c", "node server/migrate.js && node server/seed.js && exec node server/index.js"]
