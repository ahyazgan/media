#!/bin/sh
# Günlük yedek (backup konteynerinde çalışır): Postgres özel biçim dökümü + belge deposu arşivi.
# Elle anında yedek: docker compose --env-file .env -f deploy/docker-compose.prod.yml exec backup sh /backup.sh now
set -eu
TIME="${BACKUP_TIME:-03:30}"
KEEP="${BACKUP_KEEP_DAYS:-14}"
DIR=/backups
mkdir -p "$DIR"

run() {
  ts=$(date +%Y%m%d-%H%M%S)
  echo "[backup] $ts başladı"
  pg_dump -h postgres -U kaynak -d kaynak -Fc -f "$DIR/db-$ts.dump.part"
  mv "$DIR/db-$ts.dump.part" "$DIR/db-$ts.dump"
  if [ -d /storage ]; then tar -czf "$DIR/storage-$ts.tar.gz.part" -C /storage . && mv "$DIR/storage-$ts.tar.gz.part" "$DIR/storage-$ts.tar.gz"; fi
  # Döküm okunabilir mi? (sessizce bozuk yedek, yedeksizlikten kötüdür)
  pg_restore -l "$DIR/db-$ts.dump" >/dev/null
  find "$DIR" -name 'db-*.dump' -mtime +"$KEEP" -delete
  find "$DIR" -name 'storage-*.tar.gz' -mtime +"$KEEP" -delete
  find "$DIR" -name '*.part' -mmin +120 -delete
  echo "[backup] $ts tamam: $(du -h "$DIR/db-$ts.dump" | cut -f1) veritabanı"
}

if [ "${1:-}" = "now" ]; then run; exit 0; fi

echo "[backup] her gün $TIME (Europe/Istanbul), saklama $KEEP gün"
while true; do
  if [ "$(date +%H:%M)" = "$TIME" ]; then
    run || echo "[backup] HATA: yedek alınamadı"
    sleep 61
  fi
  sleep 20
done
