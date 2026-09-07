# Ravel. One production build, one origin, served in the foreground on 4173.
#
# No backing service is reachable during the build, so nothing here talks to postgres,
# keycloak or mailpit. Every service address is read from the environment at container
# start, in server/src/db.js, server/src/auth.js and server/src/mail.js.

# ---------------------------------------------------------------- the client
FROM node:20-bookworm-slim AS client

WORKDIR /build/client

# Dependencies first, so a source change does not re-resolve the tree.
COPY client/package.json client/package-lock.json ./
RUN npm ci --no-audit --no-fund

# The fonts are committed under client/public/fonts: three openly licensed variable faces
# (SIL Open Font License), already subset to the characters the site uses.
COPY client/ ./

# Produces client/dist: index.html, one CSS file, one JS file and the fonts.
# No source map ships; vite.config.js sets sourcemap false.
RUN npm run build

# ---------------------------------------------------------------- the server
FROM node:20-bookworm-slim AS server

WORKDIR /build/server

COPY server/package.json server/package-lock.json ./
# Production dependencies only: hono, @hono/node-server, pg, nodemailer, jose.
RUN npm ci --omit=dev --no-audit --no-fund

# ----------------------------------------------------------------- the image
FROM node:20-bookworm-slim

ENV NODE_ENV=production
WORKDIR /app

# The API, its schema and its seed.
COPY server/package.json ./server/package.json
COPY server/src ./server/src
COPY --from=server /build/server/node_modules ./server/node_modules

# The built client, served from the same origin under / by the Hono app.
COPY --from=client /build/client/dist ./server/public

# Reserved directories, present and empty in the shipped image.
RUN mkdir -p /app/.browser_screenshots /app/.downloads

COPY USER_README.md ./USER_README.md

# Run as a non-root user. node:20 ships the `node` user already.
RUN chown -R node:node /app
USER node

# The container-internal port. The outside world reaches it through APP_PUBLIC_PORT.
EXPOSE 4173

# The app binds 0.0.0.0 (server/src/index.js), applies its schema and seed on start, and
# answers GET /api/health with 200 once it is ready.
HEALTHCHECK --interval=10s --timeout=5s --start-period=40s --retries=12 \
  CMD node -e "fetch('http://127.0.0.1:4173/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# In the foreground, as PID 1, so a stop signal reaches it.
CMD ["node", "server/src/index.js"]
