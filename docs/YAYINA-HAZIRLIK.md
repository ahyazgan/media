# Yayına hazırlık kontrol listesi

Kod tarafı Faz 0–5 ile tamamlandı. Aşağıdakiler kod dışı, hesap/anahtar/karar gerektiren ya da canlı ortamda
doğrulanması gereken işlerdir. Sırasıyla ilerleyin; her madde tek başına yapılabilir. Sunucu kurulumu, yedekler ve güncelleme için: [DAGITIM.md](DAGITIM.md).

## 1. Altyapı ve gizli anahtarlar (`.env`)

- [ ] **Veritabanı:** üretimde `DATABASE_URL=postgres://…` (PGlite yalnızca geliştirme; tek süreç kilidi vardır). `pnpm db:migrate`.
- [ ] **Redis:** `REDIS_URL` → worker BullMQ moduna geçer (3 deneme, `dead` kuyruğu, tekrarlayan işler).
- [ ] **Model anahtarı:** `ANTHROPIC_API_KEY`; `MODEL_CLASSIFY` / `MODEL_WRITE` kimliklerini docs.claude.com'daki güncel listeyle doğrulayın.
- [ ] **Site:** `SITE_URL` (HTTPS), `REVALIDATE_SECRET` (rastgele), `BOT_CONTACT_EMAIL` (robots/UA'da görünür).
- [ ] **Admin:** `ADMIN_USER`, güçlü `ADMIN_PASSWORD` (varsayılan "change-me" ile panel 503 döner). Panel yalnızca HTTPS arkasında.
- [ ] **Künye:** `PUBLISHER_NAME`, `PUBLISHER_ADDRESS`, `PUBLISHER_EMAIL`, `PUBLISHER_PHONE`, `HOSTING_PROVIDER`, `RESPONSIBLE_EDITOR` (Basın Kanunu).
- [ ] **E-posta:** `SMTP_URL`, `MAIL_FROM` (SPF/DKIM/DMARC kayıtları); `AD_SALES_EMAIL`.
- [ ] **Push:** `npx web-push generate-vapid-keys` → `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`.
- [ ] **Telegram:** BotFather'dan `TELEGRAM_BOT_TOKEN`; botu kanala yönetici yapın; `TELEGRAM_CHANNEL_ID`.
- [ ] **X:** Developer Portal'da uygulama (Read and Write), resmi hesap için `X_CONSUMER_KEY/SECRET`, `X_ACCESS_TOKEN/SECRET`; `X_MAX_PER_DAY≤30`.
- [ ] **IndexNow:** rastgele 32+ karakter `INDEXNOW_KEY`; `/<key>.txt` yanıt veriyor mu kontrol edin.
- [ ] **EVDS:** `EVDS_API_KEY` → ana sayfa piyasa şeridi (TCMB gösterge kurları). Anahtar evds2.tcmb.gov.tr'den ücretsiz alınır.
- [ ] **Belge deposu:** `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` (+ MinIO için `S3_ENDPOINT`) → belgeler S3'e yazılır; boşsa `STORAGE_DIR`.

## 2. Kaynak erişimi (geliştirme ortamından doğrulanamayanlar)

- [ ] **Resmi Gazete TLS:** TÜBİTAK Kamu SM kök sertifikasını indirip `NODE_EXTRA_CA_CERTS` ile verin; `pnpm pipeline:run -- --date <bugün>` çalışsın.
- [ ] **KAP:** kullanım koşullarını okuyun (ham veri yeniden dağıtımı yok; gerekiyorsa MKK ile lisans); sonra `pnpm db:seed -- --enable kap`.
      Erişim 2026-10-02'de canlıda doğrulandı: liste `POST /tr/api/disclosure/list/main`, belge `/tr/api/BildirimPdf/<no>` (eski
      `GET /tr/api/disclosures` yanıt vermiyor). Filtre sonrası iş gününde ~160 olay. `pnpm --filter @kaynak/sources probe kap` ile yoklanır.
- [x] **TCMB / TÜİK:** canlıda doğrulandı (2026-10-02, `pnpm --filter @kaynak/sources probe tcmb tuik calendar`). TCMB: Atom beslemesi
      `.../Bottom+Menu/Diger/RSS/Basin+Duyurulari`, takvim `.../Main+Menu/Duyurular/Takvim`. TÜİK: veriportali.tuik.gov.tr JSON API
      (`X-Requested-With` başlığı şart), takvim `www.tuik.gov.tr/Kurumsal/GetYillikHaberBulteniListesi?yil=`. Adresler değişirse
      `TCMB_FEED_URL`, `TUIK_BASE_URL`, `TCMB_CALENDAR_URL`, `TUIK_CALENDAR_URL`. Üretimde açmak: `pnpm db:seed -- --enable tcmb` / `tuik`.
- [ ] **SPK / BDDK / EPDK / BOTAŞ:** 2026-10-02 yoklamasında dördü de çalışmadı (SPK/EPDK: liste yapısı değişmiş, BDDK: bağlantı
      kurulamadı, BOTAŞ: engelleme sayfası). Adresler/seçiciler güncellenmeli (`--source spk` vb.); sonra `--enable`. Bu kaynaklar için altın örnek
      yok; gerçek belgelerle en az 5'er örnek ekleyip `SOURCES` listesine alın (`packages/agents/test/golden.test.ts`).
- [ ] **Altın örnekler:** `packages/agents/fixtures/{kap,tcmb,tuik}` sentetiktir; gerçek belgelerle değiştirip `LIVE=1 pnpm test:agents` koşun.
      Prompt değişikliği bu test geçmeden merge edilmez.
- [ ] **İnsan onayı eşiği:** `REVIEW_THRESHOLD=4` ile başlayın; ilk haftalarda inceleme kuyruğunu günlük boşaltın, güven kazandıkça 5'e çekin.

## 3. Reklam (Faz 5)

- [ ] AdSense hesabı ya da Ad Manager ağı; `NEXT_PUBLIC_AD_PROVIDER`, `NEXT_PUBLIC_ADSENSE_CLIENT` / `NEXT_PUBLIC_GAM_NETWORK`,
      `NEXT_PUBLIC_AD_UNITS` (derleme anında gömülür → değiştirince yeniden derleyin).
- [ ] `ADS_TXT` satırları (AdSense: `google.com, pub-…, DIRECT, f08c47fec0942fa0`).
- [ ] İlk 6 ay: kayan kutu ve sesli otomatik video yok (kod zaten bunları çizmez); reklam ağı tarafında da kapalı tutun.
- [ ] Canlıda admin panosundaki Core Web Vitals p75 (7 gün) LCP < 2,5 s ve CLS < 0,1 kalıyor mu izleyin; reklam ağı yüklendikten sonra tekrar bakın.

## 4. Dağıtım ve arama motorları

- [ ] Google Publisher Center: yayın adı "Kaynak", `news-sitemap.xml`, künye adresi, logo.
- [ ] Search Console: alan doğrulama, `sitemap.xml` + `news-sitemap.xml`; haber sitemap hatasız olmalı (Faz 4 kabul).
- [ ] Bing Webmaster (IndexNow otomatik), Yandex Webmaster.
- [ ] Telegram kanalı ve X hesabı açıklaması: "Yatırım tavsiyesi değildir" + kaynak politikası.
- [ ] Sabah bülteni: ilk gönderiden önce `pnpm pipeline:run -- --bulletin --dry` ile önizleme; SPF/DKIM doğrulaması.

## 5. Hukuk

- [ ] Künye, KVKK aydınlatma metni, çerez politikası, düzeltme politikası metinlerini hukuk danışmanı gözden geçirsin (şablonlar sitede hazır).
- [ ] İletişim formundan gelen düzeltme/tekzip talepleri için 24 saat yanıt süreci; sorumlu editör ataması.
- [ ] İçerik saklama (2 yıl) — veritabanı yedekleri: Postgres günlük yedek + `storage/` (belgeler) yedeği.

## 6. Kalan geliştirmeler (şartname MVP dışı / sonraki fazlar)

- [x] S3/MinIO belge sürücüsü, SPK/BDDK/EPDK/BOTAŞ liste adapter'ları, son dakika barı, push tercih sayfası, bülten sponsor slotu,
      güvenlik sertleştirme, e2e testleri ve CI — eklendi.
- [ ] **Şirket finansal tablo özetleri** (KAP FR bildirimlerinden tablo çıkarımı).
- [ ] **Muhabir X/Telegram kaynakları** (resmi değil → her zaman review, iki bağımsız kaynak şartı; `official:false` yolu pipeline'da hazır).
- [ ] **Kullanıcı hesapları ve kişiselleştirme** (şirket takibi, kategori tercihi).
- [x] Piyasa şeridi (TCMB EVDS kurları), kategori sponsorluğu, CSP (Report-Only → `CSP_ENFORCE=1`), `/api/health`, admin dağıtım günlüğü — eklendi.
- [ ] **BIST100 / altın** şerit verisi (lisanslı veri sağlayıcısı gerekir; EVDS'de gün sonu altın serisi eklenebilir).
- [ ] **Search Console API ile index'e girme süresi** ölçütü (§11'de listelenir; API bağlantısı yok).
- [ ] **Görsel regresyon** (`pnpm e2e` duman testleri var; ekran görüntüsü karşılaştırması eklenebilir).
- [ ] **CSP zorlama:** canlıda bir hafta Report-Only günlüğünü izleyip `CSP_ENFORCE=1` yapın; reklam ağı yeni alan adı kullanırsa `middleware.ts`
      listesine ekleyin.
- [ ] **Kaynak alarmları:** `ALERT_EMAIL` ve/veya `ALERT_TELEGRAM_CHAT_ID`; uptime izleyicisine `/api/health/sources` da ekleyin (docs/DAGITIM.md §8).
- [ ] **Uptime izleme:** `/api/health` adresini (ör. UptimeRobot/BetterStack) 1 dk aralıkla izleyin; `ok:false` ya da `pendingEvents` sürekli artıyorsa worker durmuş demektir.
