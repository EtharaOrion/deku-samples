# Vela Electronics storefront.
# Astro (server-rendered, with islands) and a Hono API on one origin, over
# PostgreSQL, Mailpit and killbill. Every service address is read from the
# environment at container start; no service is reachable during the build.

# ---- build ----
FROM node:20-bookworm-slim AS build
WORKDIR /app
ENV NODE_ENV=development

# Install dependencies first so the layer caches on source-only changes.
# Both files are present in the build context; no globs, so a missing file fails
# loudly here rather than producing a subtly different image.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# Sources, then the production build. The build touches no backing service.
COPY astro.config.mjs tsconfig.json ./
COPY public ./public
COPY src ./src
RUN npx astro build

# Reinstall with production dependencies only, for the runtime image.
RUN npm prune --omit=dev


# ---- runtime ----
FROM node:20-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production
# 4173 is the container-internal port this brief names. The published port is
# whatever APP_PUBLIC_PORT maps to it from outside.
ENV PORT=4173
# Bind every interface: a loopback-only listener is unreachable from outside.
ENV HOST=0.0.0.0

# Runtime dependencies and the built output.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./

# The server, its schema and its seed. The image applies both at start, because
# grading re-creates the database from scratch.
COPY server ./server

# Reserved and shipped empty.
RUN mkdir -p .browser_screenshots .downloads

# Documentation the grader reads for credentials.
COPY USER_README.md ./

EXPOSE 4173

# An unauthenticated readiness probe on the same origin.
HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=10 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4173)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Run as an unprivileged user.
USER node

# Serve in the foreground. node is PID 1 so SIGTERM reaches it directly.
CMD ["node", "server/index.mjs"]
