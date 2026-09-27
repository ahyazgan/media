# Dağıtım rehberi

Bu belge Kaynak'ı canlıya almayı adım adım anlatır. Hesap ve anahtar gerektiren işlerin tam listesi [YAYINA-HAZIRLIK.md](YAYINA-HAZIRLIK.md)'dedir; burası sunucu tarafıdır.

## Hangi mod?

| | Mod A — tek sunucu (önerilen) | Mod B — web Vercel'de |
|---|---|---|
| Çalışan yer | Web, worker, Postgres, Redis, yedek, HTTPS: hepsi Hetzner'de | Web Vercel'de; worker, Postgres, Redis Hetzner'de |
| Veritabanı | İnternete kapalı | 5432 portu internete açık (TLS + parola) |
| Fatura | Tek sunucu | Sunucu + Vercel (ticari kullanımda ücretli plan gerekir) |
| Kurulum | `setup-vps.sh` | `setup-vps.sh --vercel` + Vercel projesi |
| Ne zaman | Başlangıç, düşük/orta trafik | Trafik tek sunucuyu aşınca, CDN gerekince |

Şartname Vercel + VPS öneriyor ve "bütçe daralırsa hepsi VPS'e taşınabilir" diyor. Başlangıçta Mod A daha basit ve daha güvenli: veritabanı hiç dışarı açılmaz. Geçiş sonradan yalnızca web'i taşımaktır; veri yerinde kalır.

## 1. Ön koşullar

1. **Hetzner Cloud sunucusu:** en az 2 vCPU ve 4 GB RAM (ör. CX22 sınıfı), Ubuntu 24.04, SSH anahtarıyla giriş. Güncel fiyatı Hetzner'de kontrol edin.
2. **Alan adı:** DNS'te `A` kaydı (ve IPv6 varsa `AAAA`) sunucu IP'sine; `www` için de aynı kayıt. HTTPS sertifikası DNS yayıldıktan sonra alınabilir.
3. **Depo erişimi:** depo herkese açıkken giriş gerekmez. Özel yaparsanız sunucuya salt okunur bir deploy key ekleyin ve `REPO_URL=git@github.com:ahyazgan/media.git` ile çalıştırın.

## 2. Mod A kurulumu

Sunucuya SSH ile bağlanıp:

```bash
curl -fsSL https://raw.githubusercontent.com/ahyazgan/media/main/deploy/setup-vps.sh -o setup-vps.sh
sudo bash setup-vps.sh --domain kaynak.com.tr --email siz@ornek.com
```

Betik şunları yapar ve tekrar çalıştırılması güvenlidir:

- Sistem güncellemesi, otomatik güvenlik yamaları, fail2ban.
- Docker kurulumu.
- Güvenlik duvarı: yalnızca SSH, 80 ve 443 açık.
- 2 GB swap (Next derlemesi bellek ister).
- Kodu `/opt/kaynak` altına çeker, `.env` oluşturur.
- `POSTGRES_PASSWORD`, `REVALIDATE_SECRET`, `INDEXNOW_KEY` ve `ADMIN_PASSWORD` değerlerini üretir. Admin parolası ekranda bir kez görünür; not alın.

Servisleri **başlatmaz**. Önce `.env`'yi tamamlayın:

```bash
nano /opt/kaynak/.env
```

Asgari doldurulması gerekenler: `ANTHROPIC_API_KEY`, künye alanları (`PUBLISHER_*`, `RESPONSIBLE_EDITOR`, `HOSTING_PROVIDER`). Telegram, SMTP, VAPID ve reklam alanları boş kalabilir; ilgili özellik sessizce kapalı kalır.

Sonra başlatın:

```bash
cd /opt/kaynak
docker compose --env-file .env -f deploy/docker-compose.prod.yml --profile selfhost up -d --build
```

İlk derleme birkaç dakika sürer. Caddy, sertifikayı ilk HTTPS isteğinde Let's Encrypt'ten alır.

## 3. Mod B farkları (Vercel)

1. Sunucuda `sudo bash setup-vps.sh --domain <alan-adı> --email <e-posta> --vercel`. Betik 5432 portunu açar ve Postgres için kendinden imzalı bir TLS sertifikası üretir.
2. Başlatma: `docker compose --env-file .env -f deploy/docker-compose.prod.yml -f deploy/docker-compose.vercel.yml up -d --build` (web ve Caddy başlamaz).
3. Vercel'de yeni proje, bu depo:
   - **Root Directory:** `apps/web`
   - **Framework:** Next.js, **Node.js:** 24.x
   - Kurulum ve derleme komutları varsayılan kalır (pnpm çalışma alanı otomatik tanınır).
4. Vercel ortam değişkenleri: sunucudaki `.env` ile aynı `REVALIDATE_SECRET`, `ADMIN_*`, `PUBLISHER_*`, `VAPID_*`, `SMTP_URL`, `NEXT_PUBLIC_*` ve:
   - `SITE_URL=https://<alan-adı>` (sunucudaki `.env`'de de aynı olmalı; worker yayın sonrası bu adrese revalidate isteği atar)
   - `DATABASE_URL=postgres://kaynak:<POSTGRES_PASSWORD>@<sunucu-ip>:5432/kaynak?sslmode=no-verify`
5. Alan adını Vercel'e bağlayın (DNS kaydı Vercel'i göstermeli, sunucuyu değil).

**Güvenlik notu:** `sslmode=no-verify` trafiği şifreler ama sunucu sertifikasını doğrulamaz. Asıl koruma 48 karakterlik rastgele paroladır. Daha sağlam seçenek, Postgres'i yönetilen bir servise (Neon, Supabase vb.) taşımak ve sunucuda yalnızca worker ile Redis bırakmaktır; o zaman 5432 portu hiç açılmaz.

## 4. Resmi Gazete sertifikası

resmigazete.gov.tr'nin sertifika zinciri TÜBİTAK Kamu SM köküne dayanır. Node bu kökü tanımaz ve `UNABLE_TO_VERIFY_LEAF_SIGNATURE` hatası verir. Doğrulamayı kapatmak yerine kökü ekleyin:

1. Sunucuda zincirin hangi köke dayandığını görün:
   ```bash
   openssl s_client -connect www.resmigazete.gov.tr:443 -showcerts </dev/null 2>/dev/null | grep -E 's:|i:'
   ```
2. En üstteki `i:` satırındaki kök sertifikayı Kamu SM'nin resmi sertifika deposundan (kamusm.gov.tr) indirin ve parmak izini oradaki değerle karşılaştırın.
3. DER biçimindeyse PEM'e çevirip yerine koyun:
   ```bash
   openssl x509 -inform der -in indirilen.crt -out /opt/kaynak/deploy/certs/kamusm.pem
   ```
4. Worker'ı yeniden başlatıp deneyin:
   ```bash
   docker compose --env-file .env -f deploy/docker-compose.prod.yml restart worker
   docker compose --env-file .env -f deploy/docker-compose.prod.yml exec worker node -e "fetch('https://www.resmigazete.gov.tr').then(r=>console.log('HTTP', r.status))"
   ```

## 5. İlk çalıştırma kontrolü

| Kontrol | Komut ya da adres | Beklenen |
|---|---|---|
| Servisler | `docker compose --env-file .env -f deploy/docker-compose.prod.yml ps` | Hepsi `running`, postgres ve redis `healthy` |
| Sağlık | `https://<alan-adı>/api/health` | `"ok":true` |
| Worker döngüsü | `... logs -f worker` | `watch` satırları, hata yok |
| Admin | `https://<alan-adı>/admin` | Basic auth sorar, `.env`'deki parolayla açılır |
| İlk Resmi Gazete günü | `... exec worker pnpm pipeline:run -- --date <YYYY-MM-DD>` | `published` / `review` / `skipped` özeti |

Kısaltma: `...` = `docker compose --env-file .env -f deploy/docker-compose.prod.yml`. Kolaylık için sunucuda bir takma ad tanımlayın:

```bash
echo "alias kc='docker compose --env-file /opt/kaynak/.env -f /opt/kaynak/deploy/docker-compose.prod.yml --profile selfhost'" >> ~/.bashrc
```

## 6. Yedekler

- `backup` servisi her gün `BACKUP_TIME` (varsayılan 03:30, İstanbul saati) veritabanı dökümü ve belge deposu arşivi alır: `/opt/kaynak/backups/`. `BACKUP_KEEP_DAYS` (varsayılan 14) günden eskiler silinir. Her döküm alındıktan sonra okunabilirliği kontrol edilir.
- Elle anında yedek: `... exec backup sh /backup.sh now`
- **Sunucu dışı kopya şart:** sunucu kaybolursa aynı diskteki yedek de kaybolur. En basit yol Hetzner Storage Box'a gece rsync:
  ```bash
  # crontab -e (root) — Storage Box kullanıcı adını ve SSH anahtarını önceden ayarlayın
  15 4 * * * rsync -az --delete -e "ssh -p 23" /opt/kaynak/backups/ uXXXXX@uXXXXX.your-storagebox.de:kaynak-backups/
  ```
- Geri yükleme: `./deploy/restore.sh backups/db-<zaman>.dump [backups/storage-<zaman>.tar.gz]`. Onay ister, worker ve web'i durdurup yükler ve yeniden başlatır.
- **Ayda bir geri yükleme provası yapın.** Denenmemiş yedek, yedek sayılmaz. Şartname içeriğin 2 yıl saklanmasını istiyor; bunun için sunucu dışı kopyada daha uzun saklama tanımlayın.

## 7. Güncelleme

```bash
cd /opt/kaynak && ./deploy/update.sh
```

Önce yedek alır, sonra `git pull`, imaj derleme ve servisleri yenileme yapar. Migration'lar worker açılırken otomatik uygulanır. Mod B'de web tarafı Vercel'e push ile ayrıca dağıtılır.

## 8. İzleme

- İki adresi bir uptime servisiyle (UptimeRobot, BetterStack) izleyin:
  - `/api/health` (1 dk): site ve veritabanı ayakta mı. `ok:false` ya da sürekli artan `pendingEvents` worker'ın durduğunu gösterir.
  - `/api/health/sources` (10 dk): etkin bir kaynak **Bozuk** ya da **Sessiz** ise 503 döner. Hata ayrıntısı herkese açık uçta gösterilmez; `/admin/kaynaklar` sayfasındadır.
- **Kaynak alarmları:** `.env`'de `ALERT_EMAIL` (SMTP_URL gerekir) ve/veya `ALERT_TELEGRAM_CHAT_ID` (TELEGRAM_BOT_TOKEN'daki bot bu sohbete yazar; yayın kanalını değil, kendi sohbetinizi ya da editör grubunu verin). Kurallar:
  - Sayfa yapısı değişti, engelleme sayfası geldi, TLS ya da robots.txt sorunu: ilk taramada uyarı.
  - Ağ/HTTP hatası: üst üste 3 taramada uyarı (tek seferlik kesintiler susturulur).
  - Sessizlik: kaynak kendi süresinden uzun hiç öğe döndürmezse (Resmi Gazete 30 sa, KAP 96 sa, TCMB/TÜİK 14 gün) uyarı; worker bunu 30 dakikada bir kontrol eder.
  - Bozuk kaldıkça 24 saatte bir hatırlatma, düzelince "yeniden çalışıyor" mesajı.
- Disk: `df -h` ve `du -sh /opt/kaynak/backups`. Belgeler ve yedekler zamanla büyür.
- Günlükler Docker tarafından döndürülür (servis başına 5 × 20 MB).

## 9. Sorun giderme

| Belirti | Olası neden | Çözüm |
|---|---|---|
| Caddy sertifika alamıyor | DNS henüz yayılmadı ya da 80 portu kapalı | `dig +short <alan-adı>` sunucu IP'sini göstermeli; `ufw status` |
| Web derlemesi `Killed` ile bitiyor | Bellek yetmiyor | Swap açık mı (`swapon --show`); gerekirse sunucuyu büyütün |
| Worker `UNABLE_TO_VERIFY_LEAF_SIGNATURE` | Kamu SM kökü yok | §4 |
| `/api/health/sources` 503 | Bir kaynak bozuk ya da sessiz | `/admin/kaynaklar`'da hata türüne bakın: `structure` → site değişmiş, ayrıştırıcı güncellenmeli; `tls` → §4; `robots` → kaynak botları engelliyor |
| Admin 503 dönüyor | `ADMIN_PASSWORD` boş ya da `change-me` | `.env`'de değiştirip `... up -d web` |
| `POSTGRES_PASSWORD .env içinde tanımlı olmalı` | Compose `.env`'yi bulamadı | Komutları `/opt/kaynak` içinden, `--env-file .env` ile çalıştırın |
| Parolayı değiştirdim, bağlanamıyor | Postgres parolası yalnızca ilk kurulumda uygulanır | `... exec postgres psql -U kaynak -c "ALTER USER kaynak PASSWORD '<yeni>'"` |

## 10. Bu paketin doğrulanma durumu

- Compose dosyaları ve her iki imaj CI'da (GitHub Actions, `docker` işi) derlenir; worker gerçek Postgres'e karşı migration ve seed yapar, web imajı `/api/health` ve ana sayfayla duman testinden geçer.
- Sunucu kurulum betiği gerçek bir Hetzner makinesinde henüz çalıştırılmadı. İlk kurulumda çıkan her sorunu bu belgeye ekleyin.
