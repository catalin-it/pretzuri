# Pretzuri feed worker. Built on the NAS by infra/nas/deploy-worker.sh.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
# Small sample feeds; only readable when WORKER_ALLOW_FIXTURES=1 (DEV).
COPY fixtures ./fixtures
USER node
# Heap cap well under the container mem_limit (768m).
CMD ["node", "--max-old-space-size=384", "dist/index.js"]
