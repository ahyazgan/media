#!/usr/bin/env bash
# Hetzner (Ubuntu 24.04) sunucu kurulumu — root olarak, bir kez çalıştırılır; tekrar çalıştırmak güvenlidir.
#   curl -fsSL https://raw.githubusercontent.com/ahyazgan/media/main/deploy/setup-vps.sh -o setup-vps.sh
#   sudo bash setup-vps.sh --domain kaynak.com.tr --email siz@ornek.com          # Mod A: her şey bu sunucuda
#   sudo bash setup-vps.sh --domain kaynak.com.tr --email siz@ornek.com --vercel # Mod B: web Vercel'de
# Betik servisleri BAŞLATMAZ; .env'yi tamamladıktan sonra son satırda yazan komutu çalıştırın.
set -euo pipefail

DOMAIN=""; EMAIL=""; MODE="selfhost"
REPO_URL="${REPO_URL:-https://github.com/ahyazgan/media.git}"
APP_DIR="${APP_DIR:-/opt/kaynak}"
while [ $# -gt 0 ]; do
  case "$1" in
    --domain) DOMAIN="$2"; shift 2 ;;
    --email) EMAIL="$2"; shift 2 ;;
    --vercel) MODE="vercel"; shift ;;
    *) echo "bilinmeyen argüman: $1"; exit 1 ;;
  esac
done
[ "$(id -u)" -eq 0 ] || { echo "root olarak çalıştırın (sudo)"; exit 1; }
[ -n "$DOMAIN" ] && [ -n "$EMAIL" ] || { echo "kullanım: setup-vps.sh --domain <alan-adı> --email <e-posta> [--vercel]"; exit 1; }

log() { echo -e "\n[setup] $*"; }

log "Sistem paketleri"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get upgrade -y
apt-get install -y ca-certificates curl git ufw fail2ban unattended-upgrades openssl
dpkg-reconfigure -f noninteractive unattended-upgrades

log "Docker"
if ! command -v docker >/dev/null; then curl -fsSL https://get.docker.com | sh; fi
systemctl enable --now docker

log "Güvenlik duvarı"
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
if [ "$MODE" = "selfhost" ]; then ufw allow 80/tcp; ufw allow 443/tcp; ufw allow 443/udp; else ufw allow 5432/tcp; fi
ufw --force enable
systemctl enable --now fail2ban

log "Swap (4 GB altı sunucularda Next derlemesi için)"
if ! swapon --show | grep -q .; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

log "Kod: $APP_DIR"
if [ ! -d "$APP_DIR/.git" ]; then git clone "$REPO_URL" "$APP_DIR"; else git -C "$APP_DIR" pull --ff-only; fi
cd "$APP_DIR"
echo "$MODE" > deploy/.mode
mkdir -p backups deploy/certs

setvar() { # setvar KEY VALUE  → .env içinde KEY=... satırını değiştirir ya da ekler
  if grep -q "^$1=" .env; then sed -i "s|^$1=.*|$1=$2|" .env; else echo "$1=$2" >> .env; fi
}
getvar() { { grep "^$1=" .env 2>/dev/null || true; } | head -1 | cut -d= -f2- | sed 's/[[:space:]]*#.*$//'; }
gen() { openssl rand -hex "$1"; }

log ".env"
if [ ! -f .env ]; then cp .env.example .env; echo "  .env.example'dan oluşturuldu"; fi
setvar DOMAIN "$DOMAIN"
setvar ACME_EMAIL "$EMAIL"
setvar SITE_URL "https://$DOMAIN"
[ -n "$(getvar BOT_CONTACT_EMAIL | grep -v example)" ] || setvar BOT_CONTACT_EMAIL "$EMAIL"
# Sırlar yalnızca boşsa ya da örnek değerdeyse üretilir (tekrar çalıştırma mevcut sırları bozmaz).
for k in POSTGRES_PASSWORD:24 REVALIDATE_SECRET:24 INDEXNOW_KEY:16; do
  name="${k%%:*}"; len="${k##*:}"; cur="$(getvar "$name")"
  if [ -z "$cur" ] || [ "$cur" = "change-me" ]; then setvar "$name" "$(gen "$len")"; echo "  $name üretildi"; fi
done
cur="$(getvar ADMIN_PASSWORD)"
if [ -z "$cur" ] || [ "$cur" = "change-me" ]; then ADMIN_PW="$(gen 12)"; setvar ADMIN_PASSWORD "$ADMIN_PW"; echo "  ADMIN_PASSWORD üretildi: $ADMIN_PW  (şimdi not alın)"; fi
chmod 600 .env

if [ "$MODE" = "vercel" ]; then
  log "Postgres TLS sertifikası (kendinden imzalı)"
  mkdir -p deploy/pg
  if [ ! -f deploy/pg/server.key ]; then
    openssl req -new -x509 -days 3650 -nodes -subj "/CN=$DOMAIN" -keyout deploy/pg/server.key -out deploy/pg/server.crt
  fi
  chown 70:70 deploy/pg/server.key deploy/pg/server.crt   # postgres:alpine kullanıcısı
  chmod 600 deploy/pg/server.key
fi

if [ ! -f deploy/certs/kamusm.pem ]; then
  log "UYARI: deploy/certs/kamusm.pem yok. Resmi Gazete HTTPS için TÜBİTAK Kamu SM kök sertifikasını buraya koyun (docs/DAGITIM.md §4)."
fi

ARGS="--profile selfhost"; [ "$MODE" = "vercel" ] && ARGS="-f deploy/docker-compose.vercel.yml"
log "Hazır. Sıradaki adımlar:"
echo "  1) nano $APP_DIR/.env   → ANTHROPIC_API_KEY, künye (PUBLISHER_*), TELEGRAM_*, SMTP_URL ... (docs/YAYINA-HAZIRLIK.md)"
echo "  2) cd $APP_DIR && docker compose --env-file .env -f deploy/docker-compose.prod.yml $ARGS up -d --build"
echo "  3) curl -s https://$DOMAIN/api/health"
