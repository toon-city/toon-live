############################################################
# game-assets  — Nginx (statique) + Bun (upload sécurisé)
############################################################

# ── Stage 1 : Dépendances Bun ─────────────────────────────
FROM oven/bun:1.2-alpine AS deps

WORKDIR /app/upload
COPY package.json ./
RUN bun install --frozen-lockfile --production

# ── Stage 2 : Image finale ────────────────────────────────
FROM nginx:1.27-alpine

# Bun runtime
COPY --from=oven/bun:1.2-alpine /usr/local/bin/bun /usr/local/bin/bun

# Dépendances Node
COPY --from=deps /app/upload/node_modules /app/upload/node_modules
COPY package.json /app/upload/package.json
COPY src/server.ts /app/upload/src/server.ts

# Nginx config
COPY nginx.conf /etc/nginx/nginx.conf

# Supervisord pour lancer les deux services
RUN apk add --no-cache supervisor

COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf

# Répertoire public (monté en volume en prod)
RUN mkdir -p /usr/share/nginx/html

EXPOSE 80

CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
