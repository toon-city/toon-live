# ── Stage 1 : build Angular ───────────────────────────────────────────────────
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ── Stage 2 : servir via Nginx ────────────────────────────────────────────────
FROM nginx:alpine
COPY --from=build /app/dist/game-admin/browser /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
