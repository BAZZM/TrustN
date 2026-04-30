#!/usr/bin/env bash
# Trust Network - Clean Docker rebuild
# Usage:
#   ./scripts/docker-rebuild.sh         # Rebuild and start (keeps existing DB volume)
#   ./scripts/docker-rebuild.sh --reset # Rebuild, remove volumes, then start (fresh DB)

set -e
cd "$(dirname "$0")/.."

if [ "$1" = "--reset" ]; then
  echo "Stopping and removing containers and volumes..."
  docker compose down -v
fi

echo "Building images (no cache)..."
docker compose build --no-cache

echo "Starting services..."
docker compose up -d

echo "Done. Backend: http://localhost:3000  Frontend: http://localhost:80  DB: localhost:5433"
