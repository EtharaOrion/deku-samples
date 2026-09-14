# Ravel. Preact client + Hono API + postgres, one image, one origin.
# The client is built inside the image so the shipped artifact is the build.

FROM node:20-bookworm-slim AS clientbuild
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci
COPY client ./client
# The subset faces are committed under client/public/fonts: Liberation, SIL OFL
# 1.1, subset to the characters this site uses by scripts/subset-fonts.py. The
# build serves them as-is; a fresh subsetting needs fontTools and is not part
# of the image build.
RUN cd client && npx vite build

FROM node:20-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:20-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY server ./server
COPY --from=clientbuild /build/client/dist ./client/dist
RUN mkdir -p .browser_screenshots .downloads
EXPOSE 4173
# The port is read from the environment at start; 4173 is the container default.
ENV PORT=4173
CMD ["node", "server/index.js"]
