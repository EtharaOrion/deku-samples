# syntax=docker/dockerfile:1

# ---- build -----------------------------------------------------------------
# The build compiles the Astro server and client bundles. No backing service is
# reachable during a build, so nothing here touches the database, the mail
# server or the billing platform.
FROM node:20-bookworm-slim AS build

WORKDIR /app

# Install dependencies first so the layer caches on the manifests alone.
# devDependencies are required here: astro and vite do the build.
COPY package.json package-lock.json ./
RUN npm ci

# Then the sources the build actually reads.
COPY astro.config.mjs tsconfig.json ./
COPY src ./src
COPY public ./public

RUN npm run build

# ---- runtime ---------------------------------------------------------------
FROM node:20-bookworm-slim AS runtime

ENV NODE_ENV=production
# The container-internal port this brief names. The outside mapping is the
# deployer's business, so nothing here hardcodes the published port.
ENV PORT=4173
ENV HOST=0.0.0.0

WORKDIR /app

# Production dependencies only. @node-rs/argon2 ships a prebuilt native binding
# for this platform, so no compiler is needed in the final image.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# The compiled application and the server that serves it.
COPY --from=build /app/dist ./dist
COPY server ./server

# The reserved directories this brief requires at the app root.
RUN mkdir -p /app/.browser_screenshots /app/.downloads

COPY USER_README.md ./USER_README.md

# Run as the unprivileged user the base image already provides.
RUN chown -R node:node /app
USER node

EXPOSE 4173

# Readiness is the app's own health endpoint, which answers 200 only once the
# schema and the seed have been applied.
HEALTHCHECK --interval=10s --timeout=5s --start-period=40s --retries=6 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4173)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# The server runs in the foreground as PID 1 and reads every service address
# from the environment at container start.
CMD ["node", "server/index.mjs"]
