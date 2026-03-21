# ─── Toon Live — Makefile dev ─────────────────────────────────────────────────

.PHONY: dev dev-kill dev-db dev-api watch-api dev-server watch-server dev-web dev-stop prod prod-build prod-stop logs

## Lance tout l'environnement de dev dans une session tmux (une seule commande)
dev:
	./dev.sh

## Arrête la session tmux de dev
dev-kill:
	./dev.sh --kill

## Lance uniquement la BDD + Adminer (développement)
dev-db:
	docker compose -f docker-compose.dev.yml up -d
	@echo ""
	@echo "✓  PostgreSQL → localhost:5432"
	@echo "✓  Adminer    → http://localhost:8888  (server: postgres, user: postgres)"

## Arrête l'environnement de dev
dev-stop:
	docker compose -f docker-compose.dev.yml down

## Lance game-api en mode développement (avec hot reload DevTools)
## Terminal A : make dev-api   → bootRun
## Terminal B : make watch-api  → recompile à chaque sauvegarde
dev-api:
	cd game-api && JWT_SECRET=toon-live-super-secret-jwt-key-change-in-prod! \
		DB_URL=jdbc:postgresql://localhost:5432/toonlive \
		DB_USER=postgres DB_PASSWORD=postgres \
		./gradlew bootRun

## Recompilation continue game-api (ouvrir dans un terminal séparé)
watch-api:
	cd game-api && ./gradlew classes -t

## Lance game-server en mode développement
## Terminal A : make dev-server   → bootRun
## Terminal B : make watch-server → recompile à chaque sauvegarde
dev-server:
	cd game-server-java && JWT_SECRET=toon-live-super-secret-jwt-key-change-in-prod! \
		DB_URL=jdbc:postgresql://localhost:5432/toonlive \
		DB_USER=postgres DB_PASSWORD=postgres \
		./gradlew bootRun

## Recompilation continue game-server (ouvrir dans un terminal séparé)
watch-server:
	cd game-server-java && ./gradlew classes -t

## Lance le frontend Angular (proxy vers :8080/:8081 actif)
dev-web:
	cd game-web && bun run start

## Lance tout en production
prod-build:
	docker compose build

prod:
	docker compose up -d

prod-stop:
	docker compose down

## Voir les logs de prod
logs:
	docker compose logs -f
