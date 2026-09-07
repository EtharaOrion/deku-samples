# syntax=docker/dockerfile:1

# ---- Build the client ------------------------------------------------------
# No service is reachable during the build, so nothing here touches postgres,
# keycloak or mailpit.
FROM node:20-bookworm-slim AS build

WORKDIR /build

# The manifest first, so the install layer is cached against it.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# The client sources and everything the production build reads.
COPY index.html vite.config.js ./
COPY src ./src
COPY public ./public

RUN npm run build

# ---- The runtime image -----------------------------------------------------
FROM node:20-bookworm-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app

# Production dependencies only: hono, the node server, pg, nodemailer, preact.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

# The API, the schema and the seed.
COPY server ./server

# The production build of the client, served as static files from this origin.
COPY --from=build /build/dist ./dist

# The reserved directories, present and empty at the app root.
RUN mkdir -p /app/.browser_screenshots /app/.downloads

# The credentials note the deployment contract asks for.
COPY USER_README.md ./USER_README.md

# 4173 is the container-internal port. The outside world reaches it through
# APP_PUBLIC_PORT; neither is hardcoded anywhere in the application, which reads
# DATABASE_URL, AUTH_ISSUER_URL, AUTH_CLIENT_ID, AUTH_CLIENT_SECRET, SMTP_HOST
# and SMTP_PORT from the environment at container start.
EXPOSE 4173

# Runs in the foreground as PID 1, bound to 0.0.0.0 by server/index.js.
# The schema is applied and the seed written on start, so the image brings its
# own database state up from an empty database with no manual step.
CMD ["node", "server/index.js"]
