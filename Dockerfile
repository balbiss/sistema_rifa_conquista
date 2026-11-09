# ---- build do front (React + Vite) ----
FROM oven/bun:1.3.14 AS web
WORKDIR /web
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY index.html vite.config.ts tsconfig.json ./
COPY public ./public
COPY src ./src
RUN bun x vite build

# ---- servidor (API + site estático) ----
FROM oven/bun:1.3.14-slim
WORKDIR /app/server
ENV NODE_ENV=production PORT=3020 STATIC_DIR=/app/dist DB_PATH=/app/data/campanhas.db UPLOAD_DIR=/app/data/uploads
COPY server/package.json ./
COPY server/src ./src
COPY --from=web /web/dist /app/dist
RUN mkdir -p /app/data/uploads && chown -R bun:bun /app/data
USER bun
EXPOSE 3020
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD bun -e "fetch('http://127.0.0.1:3020/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["bun", "src/index.ts"]
