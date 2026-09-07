FROM node:20-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production

# Dependencies first, so a source change does not reinstall them.
COPY package.json package-lock.json* ./
RUN npm install --include=dev --no-audit --no-fund

# The application source.
COPY vite.config.js index.html ./
COPY public ./public
COPY src ./src
COPY server ./server

# The production build of the client. No service is reachable during the build,
# and nothing here needs one.
RUN npm run build && npm prune --omit=dev && npm cache clean --force

# 4173 is the container-internal port the brief names. The outside mapping is
# APP_PUBLIC_PORT and is not this image's concern.
EXPOSE 4173

# Every service address is read from the environment at container start.
# The server binds 0.0.0.0, applies its schema, seeds on first start, and runs
# in the foreground as PID 1.
CMD ["node", "server/index.js"]
