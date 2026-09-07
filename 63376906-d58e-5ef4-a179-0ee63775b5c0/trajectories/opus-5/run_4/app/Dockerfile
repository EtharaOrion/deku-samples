# Ravel — one production build, one origin, served in the foreground.
#
# The build stage compiles the Preact client. No service is reachable during
# `docker build`, so nothing here contacts postgres, keycloak or mailpit: the
# schema, the migration and the seed are all applied by the container at start.

FROM node:20-slim AS build
WORKDIR /build

# Dependencies first, so a source change does not re-resolve the tree.
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund

# The client sources and everything the build reads.
COPY vite.config.js index.html ./
COPY public ./public
COPY client ./client

RUN npm run build


FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Runtime dependencies only: the API needs pg, hono, nodemailer and jose.
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

# The API, the schema and the seed.
COPY server ./server

# The compiled client, served as static files from the same origin.
COPY --from=build /build/dist ./dist

# Reserved, and empty.
RUN mkdir -p /app/.browser_screenshots /app/.downloads

COPY USER_README.md ./USER_README.md

# 4173 is the container-internal port. The outside world reaches it through
# whatever APP_PUBLIC_PORT maps to it; neither is hardcoded in the app, which
# reads every service address from the environment at start.
EXPOSE 4173

# Ready once the schema is applied and the seed has run.
HEALTHCHECK --interval=10s --timeout=5s --start-period=40s --retries=12 \
  CMD node -e "fetch('http://127.0.0.1:4173/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# In the foreground, bound to 0.0.0.0 by the server itself.
CMD ["node", "server/index.js"]
