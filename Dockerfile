# --- build ---------------------------------------------------------------
FROM oven/bun:1-alpine AS build
WORKDIR /app

COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

COPY . .

# Settings are baked at build time. There is no runtime config endpoint: it
# blocked first paint on a round-trip for values that never change.
ARG VITE_HOMESERVER_HTTP_BASE
ARG VITE_SHARE_BASE
ARG VITE_PUBKY_TESTNET
ARG VITE_PUBKY_TESTNET_HOST
ARG VITE_PUBKY_HTTP_RELAY
RUN bun run build

# --- runtime -------------------------------------------------------------
FROM oven/bun:1-alpine
WORKDIR /app

COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server

ENV PORT=8080
ENV UPLOADKY_DIST=/app/dist
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1

USER bun
CMD ["bun", "run", "server/index.ts"]
