# Toon City — Monorepo

Plateforme de jeu social isométrique 2D en ligne.

## Architecture

```
toon-live/
├── game-api/          # REST API — Spring Boot 3.2 / Java 21
├── game-server-java/  # WebSocket STOMP — Spring Boot 3.2 / Java 21
├── game-web/          # Frontend — Angular 17
├── game-core/         # Moteur Pixi.js 8 — TypeScript
├── game-socket/       # Client STOMP — TypeScript
├── game-types/        # Types partagés — TypeScript
└── game-server/       # Serveur BunJS (legacy)
```

Les modules TypeScript (`game-core`, `game-socket`, `game-types`, `game-web`) partagent un workspace Bun.  
Les modules Java (`game-api`, `game-server-java`) sont des projets Gradle indépendants.

## Prérequis

- **Bun** ≥ 1.0
- **Java** 21+
- **Docker** + **Docker Compose**
- **tmux** (pour `make dev`)

## Démarrage rapide

```bash
# 1. Copier les variables d'environnement
cp .env.example .env

# 2. Installer les dépendances JavaScript
bun install

# 3. Lancer tout l'environnement de développement (tmux)
make dev
```

`make dev` démarre dans des panneaux tmux séparés :
- PostgreSQL (Docker)
- game-api (Spring Boot)
- game-server-java (Spring Boot)
- game-web (Angular)

## Commandes utiles

```bash
make dev          # Lance tout (BDD + API + serveur + frontend)
make dev-kill     # Arrête la session tmux
make dev-db       # Lance uniquement PostgreSQL + Adminer
make dev-api      # Lance uniquement game-api
make dev-server   # Lance uniquement game-server-java
make dev-web      # Lance uniquement le frontend
make prod         # Lance en production (Docker Compose)
```

## Variables d'environnement

Créer un fichier `.env` à la racine (voir `.env.example`) :

```env
DB_URL=jdbc:postgresql://localhost:5432/toonlive
DB_USER=postgres
DB_PASSWORD=postgres
JWT_SECRET=<min 32 caractères>
CORS_ORIGINS=http://localhost:4200
```

## Ports

| Service | Port |
|---------|------|
| game-api (REST) | 8080 |
| game-server-java (WS) | 8081 |
| game-web (Angular) | 4200 |
| PostgreSQL | 5432 |
| Adminer | 8888 |
