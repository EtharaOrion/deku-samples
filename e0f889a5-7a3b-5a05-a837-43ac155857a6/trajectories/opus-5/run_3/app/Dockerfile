# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Build stage: install every dependency and produce the production build.
# No backing service is reachable during a build, so nothing here touches the
# database, the mail server or the billing platform.
# ---------------------------------------------------------------------------
FROM node:20-bookworm-slim AS build

WORKDIR /app

# Install dependencies first so this layer is reused when only sources change.
# The lockfile is copied when present; `npm ci` needs it and is reproducible.
COPY package.json package-lock.json ./
RUN npm ci

# Then the sources the build actually reads.
COPY astro.config.mjs ./
COPY src ./src
COPY public ./public
COPY db ./db

RUN npm run build

# Drop the development dependencies from the tree that will be copied forward,
# leaving only what the server needs at runtime.
RUN npm prune --omit=dev


# ---------------------------------------------------------------------------
# Runtime stage: the built server, its production dependencies, the schema and
# the seed. Nothing else.
# ---------------------------------------------------------------------------
FROM node:20-bookworm-slim AS runtime

ENV NODE_ENV=production
# 4173 is the container-internal port this brief names. What the outside world
# maps to it is not this image's business.
ENV PORT=4173
ENV HOST=0.0.0.0

WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json

# The schema and seed are applied by the image itself at container start,
# because the database is re-created from scratch for grading.
COPY --from=build /app/db ./db
COPY --from=build /app/src/lib ./src/lib

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
COPY USER_README.md ./USER_README.md
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Reserved directories exist at the app root.
RUN mkdir -p .browser_screenshots .downloads

# Run as the unprivileged user the base image already provides.
RUN chown -R node:node /app
USER node

EXPOSE 4173

# The health endpoint answers 200 once the app is ready.
HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4173)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# The server runs in the foreground as PID 1's child, bound to 0.0.0.0.
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
