# syntax=docker/dockerfile:1
# node:22-alpine is >= 22.18 (types are stripped at runtime: server.ts, scripts/*.ts, src/lib/**).
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOST=0.0.0.0
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY package.json server.ts ./
COPY src/lib ./src/lib
COPY db/migrations ./db/migrations
COPY scripts ./scripts
COPY data/questions ./data/questions
COPY data/aktivity ./data/aktivity
# ConsoleMailer (no SMTP) writes here; the volume mount point must be writable by `node`.
RUN mkdir -p data/outbox && chown -R node:node /app/data/outbox
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/api/health" >/dev/null || exit 1
ENTRYPOINT ["./scripts/docker-entrypoint.sh"]
