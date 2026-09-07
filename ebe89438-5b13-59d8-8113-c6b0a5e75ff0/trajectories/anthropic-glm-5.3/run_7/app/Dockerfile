# Community Calendar — production image.
#
# Install, compile the server, build the front end with the production
# builder, then run the app in the foreground on 4173 bound to 0.0.0.0. Every
# service address is read from the environment at start, so nothing is
# reachable during the build itself.

FROM node:20-bookworm-slim

WORKDIR /app

ENV NPM_CONFIG_FUND=false \
    NPM_CONFIG_AUDIT=false \
    CI=1

# Root manifests first so the install layer can be cached. Dev dependencies
# are installed because the Angular builder is one.
COPY package.json package-lock.json ./
COPY server/package.json server/package.json
COPY web/package.json web/package.json
RUN npm ci --workspaces --include-workspace-root --include=dev

# Server: TypeScript to JavaScript.
COPY server/tsconfig.json server/package.json server/
COPY server/src server/src
RUN cd server && npx tsc -p tsconfig.json

# Web: the production builder, output to web/dist/web/browser.
COPY web/angular.json web/tsconfig.json web/tsconfig.app.json web/
COPY web/public web/public
COPY web/src web/src
RUN cd web && npx ng build --configuration production

# Runtime: serving only.
ENV NODE_ENV=production \
    PORT=4173 \
    WEB_DIST=/app/web/dist/web/browser

EXPOSE 4173

# The app applies its schema and seeds on boot, then serves the API and the
# browser shell from one origin.
CMD ["node", "server/dist/index.js"]
