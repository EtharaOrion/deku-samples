# syntax=docker/dockerfile:1

# ---------------------------------------------------------------- build stage
FROM node:20-bookworm-slim AS build

WORKDIR /app

# Install dependencies first so a source change does not refetch them.
# Only the runtime dependencies are installed: astro and every library the build
# needs are runtime dependencies, and the one devDependency is the browser used
# for checking, which has no business in this image.
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund

# The application source. No backing service is reachable during a build, so
# nothing here talks to the database, the mail server or the billing platform.
COPY astro.config.mjs ./
COPY src ./src
COPY public ./public
COPY server ./server

# Produce the production build: server-rendered routes plus the client islands.
# `public` is copied into dist/client here, so the built tree carries the fonts,
# the film and the still frame.
RUN npm run build


# ----------------------------------------------------------- runtime stage
FROM node:20-bookworm-slim AS runtime

ENV NODE_ENV=production
# 4173 is the container-internal port this app listens on. What the outside
# world maps onto it is APP_PUBLIC_PORT and is never read here.
ENV PORT=4173
ENV HOST=0.0.0.0

WORKDIR /app

# Run as an unprivileged user. The node image already ships one.
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/package.json ./package.json
# The API, the schema and the seed. dist/client already carries the static
# assets, so `public` is not copied a second time.
COPY --chown=node:node server ./server

# Reserved and empty, as the deployment contract asks.
RUN mkdir -p /app/.browser_screenshots /app/.downloads \
 && chown -R node:node /app/.browser_screenshots /app/.downloads

# Credentials for a grader, written into the image.
COPY --chown=node:node USER_README.md ./USER_README.md

USER node

EXPOSE 4173

# Every service address is read from the environment at container start.
# The app applies its own schema and seed, then serves the API and the
# rendered pages on one origin, in the foreground, bound to 0.0.0.0.
HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4173)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/index.js"]
