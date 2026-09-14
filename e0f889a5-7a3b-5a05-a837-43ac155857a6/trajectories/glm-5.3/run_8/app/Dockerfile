FROM node:20-bookworm-slim

WORKDIR /app

# Dependencies first so the layer caches.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# Source and the production build. No backing service is reachable at build time;
# the build only compiles, it never connects.
COPY . .
RUN npm run build

# The container-internal port is fixed by the deployment contract; the public
# port arrives in APP_PUBLIC_PORT and is read from the environment at start.
ENV PORT=4173
ENV HOST=0.0.0.0
EXPOSE 4173

# boot.js applies schema and seed, then runs the server in the foreground.
CMD ["node", "server/boot.js"]
