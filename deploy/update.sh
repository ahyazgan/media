#!/usr/bin/env bash
# Sunucuda yeni sürüme geçiş: kodu çek, imajları derle, servisleri yenile. Kök dizinden: ./deploy/update.sh
set -euo pipefail
cd "$(dirname "$0")/.."
MODE_ARGS=(--profile selfhost)
if [ -f deploy/.mode ] && [ "$(cat deploy/.mode)" = "vercel" ]; then MODE_ARGS=(-f deploy/docker-compose.vercel.yml); fi
DC=(docker compose --env-file .env -f deploy/docker-compose.prod.yml "${MODE_ARGS[@]}")

before=$(git rev-parse --short HEAD)
git pull --ff-only
after=$(git rev-parse --short HEAD)
echo "[update] $before → $after"
echo "[update] güncellemeden önce yedek alınıyor"
"${DC[@]}" exec -T backup sh /backup.sh now || echo "[update] UYARI: yedek alınamadı (ilk kurulumda normal)"
"${DC[@]}" build
"${DC[@]}" up -d --remove-orphans
docker image prune -f >/dev/null
sleep 5
"${DC[@]}" ps
echo "[update] tamam. Günlük: docker compose --env-file .env -f deploy/docker-compose.prod.yml logs -f worker"
