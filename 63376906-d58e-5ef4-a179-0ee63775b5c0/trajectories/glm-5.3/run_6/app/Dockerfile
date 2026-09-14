# Ravel: Preact client + Hono API + postgres/keycloak/mailpit, one origin.
FROM node:20-slim AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund
COPY web ./web
COPY vite.config.js ./
RUN npx vite build

FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4173
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund
COPY server ./server
COPY --from=build /app/dist ./dist
RUN mkdir -p /app/.browser_screenshots /app/.downloads
EXPOSE 4173
CMD ["node", "server/index.js"]
