#!/bin/bash
cd "$(dirname "$0")"

echo "======================================"
echo "  DJ Carl Quiz — démarrage du serveur"
echo "======================================"
echo ""

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js n'est pas installé."
  echo "Télécharge-le sur https://nodejs.org puis relance ce script."
  echo ""
  read -r -p "Appuie sur Entrée pour fermer…"
  exit 1
fi

if [ ! -d "node_modules" ]; then
  echo "Première installation des dépendances…"
  npm install
  if [ $? -ne 0 ]; then
    echo ""
    echo "Erreur lors de npm install."
    read -r -p "Appuie sur Entrée pour fermer…"
    exit 1
  fi
  echo ""
fi

PORT_PID="$(lsof -t -iTCP:3000 -sTCP:LISTEN 2>/dev/null || true)"
if [ -n "$PORT_PID" ]; then
  echo "Un ancien serveur tourne déjà sur le port 3000 — arrêt…"
  kill $PORT_PID 2>/dev/null || true
  sleep 1
fi

echo "Serveur en cours de démarrage…"
echo "Ferme cette fenêtre pour arrêter le serveur."
echo ""

node server.js

echo ""
read -r -p "Serveur arrêté. Appuie sur Entrée pour fermer…"
