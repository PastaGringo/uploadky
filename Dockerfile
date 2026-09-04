# --- build ---------------------------------------------------------------
FROM oven/bun:1-alpine AS build
WORKDIR /app

COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

COPY . .
# No VITE_* here on purpose: every deployment-dependent value is read at
# RUNTIME from /config.json, so one image serves every environment.
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
