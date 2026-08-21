#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NAME="dj-carl-events-deploy"
OUT="$ROOT/dist/${NAME}.zip"

mkdir -p "$ROOT/dist"
rm -f "$OUT"

cd "$ROOT"
zip -r "$OUT" . \
  -x "node_modules/*" \
  -x "data/*.db" \
  -x "data/*.db-wal" \
  -x "data/*.db-shm" \
  -x ".env" \
  -x "dist/*" \
  -x ".DS_Store" \
  -x "*.zip"

echo "Archive créée : $OUT"
echo "Taille : $(du -h "$OUT" | cut -f1)"
