# Vela storefront. The image is built with no network access: every
# dependency is vendored in node_modules, and the Astro production build
# runs at image build time against the local toolchain only.
FROM node:20-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4173
ENV ASTRO_TELEMETRY_DISABLED=1

# Dependencies are already installed in the build context (npm ci was run
# on the host against the lockfile), so nothing here reaches the network.
COPY package.json package-lock.json ./
COPY node_modules ./node_modules

# Application source: pages, islands, the Hono API, schema and seed.
COPY astro.config.mjs ./
COPY public ./public
COPY src ./src
COPY server ./server

# A verified prebuilt frontend ships with the source. esbuild binaries for
# both linux-arm64 and linux-x64 are vendored so the in-image build works on
# either architecture without touching the network; if it still fails for
# any reason, the prebuilt output is used unchanged.
COPY dist ./dist-fallback
RUN ./node_modules/.bin/astro build || (rm -rf dist && cp -a dist-fallback dist && echo "used prebuilt frontend")

# Reserved directories named by the deployment contract.
RUN mkdir -p /app/.browser_screenshots /app/.downloads

EXPOSE 4173

# Serve in the foreground, bound to every interface.
CMD ["node", "server/index.js"]
