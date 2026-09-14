# syntax=docker/dockerfile:1
FROM node:20-bookworm-slim AS base
WORKDIR /app

# dev deps are needed to build the client; NODE_ENV=production is set only at runtime
FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY package.json vite.config.js index.html ./
COPY src ./src
COPY public ./public
RUN npx vite build

FROM base AS runtime
ENV NODE_ENV=production PORT=4173
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
COPY server ./server
EXPOSE 4173
USER node
CMD ["node", "server/index.js"]
