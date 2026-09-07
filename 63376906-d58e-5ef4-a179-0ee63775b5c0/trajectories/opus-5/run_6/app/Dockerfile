# Ravel: one production build, one origin, serving the Preact client and the Hono API.
FROM node:20-bookworm-slim AS build

WORKDIR /app

# install every dependency, including the dev dependencies vite needs to build
COPY package.json package-lock.json ./
RUN npm ci

# the client source, the static assets and the build configuration
COPY vite.config.js ./
COPY client ./client
COPY public ./public

# produce the production build into /app/dist; no dev server ever runs
RUN npm run build


FROM node:20-bookworm-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app

# only the runtime dependencies reach the final image
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# the server, the schema and the seed
COPY server ./server
COPY db ./db

# the built client, from the build stage
COPY --from=build /app/dist ./dist

# reserved directories, present and empty
RUN mkdir -p /app/.browser_screenshots /app/.downloads

# the login credentials, or a statement that there are none
COPY USER_README.md ./USER_README.md

# 4173 is the container-internal port; the outside world reaches it through
# APP_PUBLIC_PORT. Every service address is read from the environment at start.
EXPOSE 4173

# the server binds 0.0.0.0 and runs in the foreground as PID 1
CMD ["node", "server/index.js"]
