# Vela storefront.
#
# One stage: install, build, run. Every service address is read from the
# environment at container start; nothing is reachable during the build.

FROM node:20-bookworm-slim

# OpenSSL and CA certificates for outbound HTTPS to the billing platform;
# tini so the app runs as PID 1 and reaps its children.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl openssl tini \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Dependencies first, so a source change does not reinstall them.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# Then the source, and the production build of the pages.
COPY . .
RUN npm run build

# Reserved directories, kept and empty.
RUN mkdir -p /app/.browser_screenshots /app/.downloads

ENV NODE_ENV=production
ENV PORT=4173

# The container-internal port is fixed by the deployment contract; the app binds
# 0.0.0.0 and reads every backing service from the environment.
EXPOSE 4173

HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=5 \
  CMD curl -fsS http://127.0.0.1:4173/api/health || exit 1

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "server.mjs"]
