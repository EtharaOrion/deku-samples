# Vela storefront. Astro server-rendered HTML plus a Hono API on one origin.
#
# No backing service is reachable during the build, so nothing here touches
# PostgreSQL, killbill or SMTP. Every host and port is read from the
# environment at container start.

FROM node:20-bookworm-slim AS build
WORKDIR /app

# Install with the lockfile so the build is reproducible, then build the site.
COPY package.json package-lock.json ./
RUN npm ci

COPY astro.config.mjs ./
COPY public ./public
COPY src ./src
COPY db ./db
COPY server ./server
RUN npm run build

# Drop the build-only dependencies from what we ship.
RUN npm prune --omit=dev


FROM node:20-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production
# The container-internal port the brief names. The outside mapping is the
# caller's business; the app only ever binds this one, on every interface.
ENV PORT=4173
ENV HOST=0.0.0.0

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/public ./public
COPY --from=build /app/db ./db
COPY --from=build /app/server ./server
COPY USER_README.md ./USER_README.md

# Reserved and empty, as the deployment contract requires.
RUN mkdir -p /app/.browser_screenshots /app/.downloads

EXPOSE 4173

# Run as an unprivileged user. node:20 ships the `node` user already.
RUN chown -R node:node /app
USER node

HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4173)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# In the foreground, as PID 1, so the container's lifetime is the app's.
CMD ["node", "server/entry.js"]
