# syntax=docker/dockerfile:1

# ---------- stage 1: build the Angular application with its production builder
FROM node:20-bookworm-slim AS web-build
WORKDIR /build/web

COPY web/package.json web/package-lock.json ./
RUN npm ci

COPY web/angular.json web/tsconfig.json web/tsconfig.app.json ./
COPY web/src ./src
RUN npm run build -- --configuration production

# ---------- stage 2: compile the Hono API to JavaScript
FROM node:20-bookworm-slim AS server-build
WORKDIR /build/server

COPY server/package.json server/package-lock.json ./
RUN npm ci

COPY server/tsconfig.json ./
COPY server/src ./src
RUN npx tsc -p tsconfig.json

# ---------- stage 3: the runtime image
FROM node:20-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

# Production dependencies only.
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=server-build /build/server/dist ./dist
COPY --from=web-build /build/web/dist/web/browser ./public

# The container-internal port this brief names. Every service address is read
# from the environment at container start, never baked in here.
ENV PORT=4173
ENV HOST=0.0.0.0
ENV STATIC_DIR=/app/public
EXPOSE 4173

# One Node process serves the static production build and the JSON API on the
# same origin, in the foreground, bound to 0.0.0.0.
CMD ["node", "dist/index.js"]
