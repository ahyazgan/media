#!/usr/bin/env bash
# Yedekten geri yükleme. Kök dizinden: ./deploy/restore.sh backups/db-20261001-033000.dump [backups/storage-....tar.gz]
set -euo pipefail
cd "$(dirname "$0")/.."
DUMP="${1:?kullanım: deploy/restore.sh <db-*.dump> [storage-*.tar.gz]}"
STORE="${2:-}"
[ -f "$DUMP" ] || { echo "bulunamadı: $DUMP"; exit 1; }
DC=(docker compose --env-file .env -f deploy/docker-compose.prod.yml)

echo "UYARI: 'kaynak' veritabanının içeriği $DUMP ile DEĞİŞTİRİLECEK."
read -r -p "Devam etmek için 'evet' yazın: " ok
[ "$ok" = "evet" ] || { echo "iptal"; exit 1; }

echo "[restore] worker ve web durduruluyor"
"${DC[@]}" stop worker web 2>/dev/null || true
echo "[restore] veritabanı yükleniyor"
"${DC[@]}" exec -T postgres pg_restore --clean --if-exists --no-owner -U kaynak -d kaynak < "$DUMP"
if [ -n "$STORE" ]; then
  echo "[restore] belge deposu yükleniyor"
  "${DC[@]}" run --rm -T --entrypoint sh -v "$(pwd)/$STORE:/in.tar.gz:ro" worker -c 'rm -rf /app/storage/* && tar -xzf /in.tar.gz -C /app/storage'
fi
echo "[restore] servisler başlatılıyor"
"${DC[@]}" start worker
"${DC[@]}" start web 2>/dev/null || true
echo "[restore] tamam. Kontrol: curl -s https://\$DOMAIN/api/health"
