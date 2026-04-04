#!/usr/bin/env bash
# ─── Toon Live — Dev launcher ──────────────────────────────────────────────────
# Lance la BDD, l'API, le serveur de jeu et le frontend dans une session tmux.
# Usage : ./dev.sh [--kill]
# ──────────────────────────────────────────────────────────────────────────────

SESSION="toon-dev"
ROOT="$(cd "$(dirname "$0")" && pwd)"
JAVA_ENV="JWT_SECRET=toon-live-super-secret-jwt-key-change-in-prod! \
DB_URL=jdbc:postgresql://localhost:5432/toonlive \
DB_USER=postgres DB_PASSWORD=postgres"

if [[ "$1" == "--kill" ]]; then
  tmux kill-session -t "$SESSION" 2>/dev/null && echo "✓ Session '$SESSION' arrêtée." || echo "Aucune session active."
  exit 0
fi

if tmux has-session -t "$SESSION" 2>/dev/null; then
  echo "↩  Session '$SESSION' déjà active – reconnexion..."
  tmux attach-session -t "$SESSION"
  exit 0
fi

# ── Fenêtre 0 : Base de données ────────────────────────────────────────────────
tmux new-session -d -s "$SESSION" -n "db" -x 220 -y 50
tmux send-keys -t "$SESSION:db" \
  "cd '$ROOT' && docker compose -f docker-compose.dev.yml up" C-m

# ── Fenêtre 1 : API (bootRun + watch en split) ─────────────────────────────────
tmux new-window -t "$SESSION" -n "api"
tmux split-window -v -t "$SESSION:api" -p 30
# Pane supérieur : bootRun
tmux send-keys -t "$SESSION:api.0" \
  "sleep 3 && cd '$ROOT' && $JAVA_ENV ./game-api/gradlew -p game-api bootRun" C-m
# Pane inférieur : recompilation continue (déclenche DevTools)
tmux send-keys -t "$SESSION:api.1" \
  "sleep 5 && cd '$ROOT/game-api' && ./gradlew classes -t" C-m

# ── Fenêtre 2 : Game-server (bootRun + watch en split) ─────────────────────────
tmux new-window -t "$SESSION" -n "server"
tmux split-window -v -t "$SESSION:server" -p 30
tmux send-keys -t "$SESSION:server.0" \
  "sleep 3 && cd '$ROOT' && $JAVA_ENV ./game-server-java/gradlew -p game-server-java bootRun" C-m
tmux send-keys -t "$SESSION:server.1" \
  "sleep 5 && cd '$ROOT/game-server-java' && ./gradlew classes -t" C-m

# ── Fenêtre 3 : Frontend Angular ───────────────────────────────────────────────
tmux new-window -t "$SESSION" -n "web"
tmux send-keys -t "$SESSION:web" \
  "sleep 4 && cd '$ROOT/game-web' && bun run start" C-m

# ── Fenêtre 4 : Panel d'administration ──────────────────────────────────────────
tmux new-window -t "$SESSION" -n "admin"
tmux send-keys -t "$SESSION:admin" \
  "sleep 4 && cd '$ROOT/game-admin' && npm start" C-m

# ── Focus sur la fenêtre db ────────────────────────────────────────────────────
tmux select-window -t "$SESSION:db"

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║           Toon Live — Environnement de dev           ║"
echo "╠══════════════════════════════════════════════════════╣"
echo "║  Fenêtres tmux :                                     ║"
echo "║  [0] db      → PostgreSQL + Adminer (:8888)          ║"
echo "║              → Assets statiques    (:3001)           ║"
echo "║  [1] api     → Spring Boot :8080  (hot reload)       ║"
echo "║  [2] server  → Spring Boot :8081  (hot reload)       ║"
echo "║  [3] web     → Angular :4200      (HMR)              ║"
echo "║  [4] admin   → Angular :4201      (panel admin)      ║"
echo "╠══════════════════════════════════════════════════════╣"
echo "║  Ctrl+B, puis 0-4 pour naviguer entre les fenêtres  ║"
echo "║  ./dev.sh --kill  pour tout arrêter                  ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

tmux attach-session -t "$SESSION"
