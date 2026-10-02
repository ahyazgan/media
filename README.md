# Kaynak

Resmi kaynaktan, dakikalar içinde, doğrulanmış. Şartname: [docs/SPEC.md](docs/SPEC.md). Canlıya alma: [docs/DAGITIM.md](docs/DAGITIM.md) · kontrol listesi: [docs/YAYINA-HAZIRLIK.md](docs/YAYINA-HAZIRLIK.md) · model maliyeti: [docs/MALIYET.md](docs/MALIYET.md).

## Yapı

```
apps/web          Next.js 15 App Router (ISR) + PWA (Serwist) — /, /haber/[slug], /resmi-gazete/[tarih], /kategori/[slug], /sirket, /sirket/[kod],
                  /takvim, /bulten, /ara, /rss.xml, /manifest.webmanifest, /api/kap/feed, /api/push/*, /api/bulten/*, /_dev/ui
apps/worker       BullMQ kuyrukları (REDIS_URL varsa) ya da süreç içi zamanlayıcı; `sources.enabled` olan adapter'ları tarar,
                  günlük takvim senkronu ve 07:30 bülteni çalıştırır
packages/db       Drizzle şeması + migration; PGlite (gömülü) veya Postgres
packages/sources  SourceAdapter sözleşmesi, nezaket kuralları (robots, UA, backoff); Resmi Gazete, KAP, TCMB, TÜİK adapter'ları; takvim içe aktarıcıları
packages/agents   classify (Haiku) / write (Sonnet) çağrıları, prompt'lar, kural motoru, altın örnekler
packages/pipeline dedupe → classify → (şirket bağlama) → verify → write → edit → publish (revalidate, Telegram, push); takvim, bülten, e-posta; CLI
packages/ui       Fuşya Gazete token'ları ve bileşenler
```

Durum: Faz 0–5 tamam (iskelet, Resmi Gazete, KAP, takvim + PWA + dağıtım, admin + SEO + kurumsal, reklam + X). Yayına çıkış için kod dışı
adımlar ve sonraki geliştirmeler: [docs/YAYINA-HAZIRLIK.md](docs/YAYINA-HAZIRLIK.md).

## Hızlı başlangıç (Docker'sız)

```bash
pnpm install
cp .env.example .env            # DATABASE_URL=pglite://./data/kaynak varsayılan
pnpm test                       # tüm paketler, ağ ve API anahtarı gerekmez
pnpm pipeline:run -- --fixture  # gerçek Resmi Gazete belgeleriyle uçtan uca kuru çalıştırma (sahte ajan)
pnpm dev                        # http://localhost:3000
```

Gerçek model ve gerçek Resmi Gazete günü:

```bash
ANTHROPIC_API_KEY=sk-... pnpm pipeline:run -- --date 2026-09-26
LIVE=1 pnpm test:agents         # altın örnekler canlı modelle
pnpm eval:agents                # rapor: sınıflandırma, kural motoru, maliyet, gecikme (--dry: anahtarsız)
```

## KAP (Faz 2)

```bash
pnpm pipeline:run -- --source kap --fixture   # sentetik bildirimlerle kuru çalıştırma → /sirket, /sirket/ornek, ana sayfa KAP akışı
pnpm pipeline:run -- --source kap             # canlı: son bildirimleri çek ve işle (--since ile pencere)
pnpm db:seed -- --enable kap                  # worker'ın KAP'ı taramasını aç (varsayılan kapalı)
pnpm --filter @kaynak/sources capture:kap     # gerçek liste JSON'unu fixture olarak kaydet
```

- **Akış:** `KapAdapter` `GET /tr/api/disclosures` listesini okur (piyasa saatlerinde hafta içi 09:30–18:30 her 60 sn, dışında 5 dk), ÖDA / finansal rapor / diğer bildirim sınıflarını alır; borsa kodu olmayan (fon) ve eski KAP kayıtlarını eler. Belge `tr/Bildirim/<no>` sayfasıdır, 404'te `tr/BildirimPdf/<no>`.
- **Şirketler:** payload'daki `companies` listesi pipeline'da `companies` (upsert) ve `company_events` tablolarına yazılır. `isNews=false` bildirimler haber olmaz ama `/sirket/[kod]` bildirim geçmişinde "Rutin" etiketiyle listelenir. Haberin `tickers` alanı şirket kodlarını içerir; publish sonrası `/sirket/<kod>` de revalidate edilir.
- **Ana sayfa:** `KapFeedLive` sunucudan gelen listeyle açılır, sekme görünürken 30 sn'de bir `/api/kap/feed`'i yoklar.
- **Hukuk:** KAP kullanım koşulları Faz 2 başında okunmalı (şartname §10). Ham veri yeniden dağıtılmaz; her haber KAP'taki belgeye linklenir. Bu yüzden `sources.kap.enabled` varsayılan `false`; koşullar onaylanınca `--enable kap` ile açılır.
- **Doğrulama:** 2026-10-02'de canlıda doğrulandı. Liste `POST /tr/api/disclosure/list/main` (`{ fromDate, toDate, memberTypes: ["IGS","DDK"] }`), kayıtlar `{ disclosureBasic, disclosureDetail }` (`companyTitle`, `stockCode`); belge bildirimin PDF dökümü `/tr/api/BildirimPdf/<no>` (yeni bildirim sayfası metni istemci tarafında yükler). Ayrıştırıcı eski `{ basic }` biçimini de kabul eder. Gerçek örnekler: `packages/sources/fixtures/kap-list-main.json`, `kap-bildirim-1671363.pdf`. `packages/agents/fixtures/kap/` altındaki belgeler hâlâ **sentetiktir** (gerçek şirket değil).

Docker ile tam kurulum: `docker compose up -d postgres redis minio`, `.env` içinde `DATABASE_URL=postgres://…` ve `REDIS_URL=redis://localhost:6379`, sonra `pnpm dev:worker`.

## Takvim, PWA ve dağıtım (Faz 3)

```bash
pnpm pipeline:run -- --calendar --fixture        # TÜİK/TCMB takvim fixture'ını calendar_events'e yükle (canlı: --fixture'sız)
pnpm pipeline:run -- --source tcmb --fixture     # TCMB basın duyurusu beslemesi (tuik için --source tuik)
pnpm pipeline:run -- --bulletin --dry            # sabah bültenini konsola yaz; --dry'sız gönderir
pnpm --filter @kaynak/web build && pnpm --filter @kaynak/web start   # PWA yalnızca üretim derlemesinde (public/sw.js)
```

- **TCMB / TÜİK:** TCMB Atom beslemesi (`FeedAdapter`, `packages/sources/src/feed/`); TÜİK veri portalının JSON API'si (`packages/sources/src/tuik.ts`).
  Besleme, taban ve takvim adresleri `.env` ile ezilebilir.
  Worker, `calendar_events`'te yayına 5 dk kala / 30 dk sonrasına kadar kaynağı 30 sn'de bir tarar (`isCalendarHot`), diğer zamanlarda
  TCMB 10 dk, TÜİK 15 dk. Yayınlanan haber ±6 saat içindeki takvim girdisine bağlanır (`/takvim`'de "Açıklandı").
- **PWA:** `app/manifest.ts` (standalone, maskable ikonlar, share_target → `/ara`), `app/sw.ts` (Serwist: kabuk precache, `/api/*` network-first
  1 saat, ana sayfa + son 50 haber çevrimdışı, görseller stale-while-revalidate, `/~offline` geri dönüşü, push bildirimi). Geliştirmede SW kapalıdır
  (`PWA_DEV=1 pnpm dev` ile açılır). `InstallBanner` iOS'ta Paylaş → Ana Ekrana Ekle adımlarını gösterir, Android'de `beforeinstallprompt` yakalar;
  push izni KVKK açık rıza kutusuyla ve iOS'ta yalnızca ana ekrana eklenmiş PWA'da istenir.
- **Push:** `VAPID_*` tanımlıysa `importance >= PUSH_MIN_IMPORTANCE` haberler kategori aboneliğine göre gönderilir; 404/410 dönen abonelikler silinir.
- **Telegram:** `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHANNEL_ID` tanımlıysa her yayında başlık + dek + link.
- **RSS:** `/rss.xml` son 50 haber, kaynak belge bağlantısıyla.
- **Sabah bülteni:** `/bulten` çift onaylı abonelik (`/api/bulten/abone|onay|iptal`, List-Unsubscribe başlığı); worker her gün `BULLETIN_TIME`'da
  (varsayılan 07:30 TR) bugünün Resmi Gazete'si + takvimi + son 24 saatin en önemli 5 haberini gönderir. `SMTP_URL` yoksa `.eml` dosyaları `storage/mail/` altına yazılır.
- **Doğrulama:** 2026-10-02'de canlıda doğrulandı (`pnpm --filter @kaynak/sources probe`: liste + ilk belge, DB/model yok). TCMB: Atom, tarihler
  "1 Eki 2026 14:00:00", bağlantılar http:// (https'e yükseltilir); takvim "Takvim" sayfasındaki dört sütunlu tablo. TÜİK: data.tuik.gov.tr
  veriportali.tuik.gov.tr'ye (SPA) yönlenir; bültenler `/api/tr/press/latest` + `/api/tr/press/<no>` (`X-Requested-With: XMLHttpRequest` olmadan 403),
  takvim `www.tuik.gov.tr/Kurumsal/GetYillikHaberBulteniListesi?yil=` (tüm kurumlar; yalnızca TÜİK satırları alınır). Gerçek örnekler
  `packages/sources/fixtures/{tcmb-basin-atom.xml,tcmb-takvim.html,tuik-press-*.json,tuik-takvim-2026.json}`. `packages/agents/fixtures/tcmb|tuik` sentetiktir.
  Lighthouse bu ortamda koşulamadı; PWA ölçütleri (manifest, SW, çevrimdışı, ikonlar) Playwright ile doğrulandı.

## Admin, SEO ve kurumsal (Faz 4)

```bash
ADMIN_USER=editor ADMIN_PASSWORD=<güçlü-parola> pnpm --filter @kaynak/web start   # /admin (Basic Auth; parola boş/"change-me" ise 503)
```

- **/admin** (robots noindex, `no-store`): pano (şartname §11 ölçütleri: yayına geçiş p50/p95, otomatik yayın oranı, inceleme/red/grounding red,
  düzeltme ve geri çekme, abone sayıları; bugün canlı, önceki günler worker'ın 00:10 işiyle `metrics_daily`'ye yazılır), **inceleme kuyruğu**
  (belge metni yan yana; başlık/dek/gövde düzenlenip yayınlanır ya da gerekçeyle reddedilir; yayın Telegram/push/revalidate kancasını çalıştırır),
  **düzeltme / geri çekme** (önce mevcut hâl `article_versions`'a alınır, sonra güncellenir; haber sayfasında "Düzeltildi" notu + geçmiş, JSON-LD
  `correction`; geri çekilen sayfa kalır, `noindex`), **düzeltme talepleri** (iletişim formundan; 24 saat hedefi), **düşen işler** (üç denemeden
  sonra `job_failures`; "yeniden dene" olayı `new`e döndürür, worker 5 dk içinde bekleyen süpürmesiyle işler).
- Editoryal işlemler `packages/pipeline/src/editorial.ts`'te (yalnızca DB'ye bağımlı, testli); admin server action'ları bunları çağırır. Hard delete yok.
- **SEO:** `sitemap.xml` (statik + canlı haberler + şirketler + Resmi Gazete günleri), `news-sitemap.xml` (son 48 saat, Google News biçimi),
  IndexNow (`/<INDEXNOW_KEY>.txt` anahtar dosyası + her yayında ping), OG/Twitter görseli (`/haber/<slug>/opengraph-image`, Fraunces + DM Sans,
  fontlar `apps/web/assets/fonts`, OFL), `NewsArticle` JSON-LD (`citation`, `about` şirketler, `correction`).
- **Kurumsal:** `/kunye` ve `/kvkk` içerikleri `.env` (`PUBLISHER_*`, `HOSTING_PROVIDER`, `RESPONSIBLE_EDITOR`) ile doldurulur; `/iletisim` formu
  (KVKK rıza, bot tuzağı) `correction_requests`'e yazar; `/duzeltme-politikasi` güncellendi.
- **Publisher Center / Webmaster başvuruları** (kod dışı, yayına çıkınca): Google Publisher Center'a `news-sitemap.xml` ve künye adresi;
  Search Console'a `sitemap.xml` + `news-sitemap.xml`; Bing Webmaster (IndexNow anahtarı otomatik doğrulanır); Yandex Webmaster. Hepsi için
  `SITE_URL` HTTPS olmalı ve `/kunye` doldurulmuş olmalıdır.
- **Not:** `next build` `rss.xml`/`sitemap.xml`/`news-sitemap.xml`'i derleme anında üretir ve veritabanına bağlanır; PGlite dosya modunda o sırada
  başka bir süreç (worker ya da üretim sunucusu) aynı dosyayı açık tutuyorsa derleme "unreachable" hatasıyla düşer. Derlerken diğer süreci kapatın
  ya da Postgres kullanın.

## Reklam, X paylaşımı ve Core Web Vitals (Faz 5)

- **Reklam:** `apps/web/components/Ad.tsx` — rıza kapılı slotlar (`NEXT_PUBLIC_AD_PROVIDER=adsense|gam`). Çerez barında "Kabul et" seçilmeden
  hiçbir reklam scripti yüklenmez ("Sadece zorunlu" → yalnızca sabit boyutlu yer tutucu). Slot boyutları sabittir (CLS 0), her slot "Reklam" /
  "Sponsorlu" etiketlidir, kayan kutu ve otomatik video yoktur (Better Ads). `ads.txt` `ADS_TXT` değişkeninden üretilir. PWA'da sekme çubuğu
  üstü 320×50 yalnızca standalone modda ve akış içinde gösterilir.
- **Doğrudan satış:** `/reklam` (alanlar, ilkeler, teklif formu) → `ad_inquiries` + `AD_SALES_EMAIL` bildirimi; admin "Reklam talepleri".
- **X:** `packages/pipeline/src/x.ts` — OAuth 1.0a (HMAC-SHA1, ek bağımlılık yok; imza X belgelerindeki örnek vektörle test edilir), API v2
  `POST /2/tweets`, günde en fazla `X_MAX_PER_DAY` (≤30) gönderi, `X_MIN_IMPORTANCE` altı atlanır, her haber bir kez. Telegram/X/push sonuçları
  `distribution_log`'a yazılır; pano "X bugün n/30" gösterir.
- **Core Web Vitals:** istemci oturumların %10'unda LCP/CLS/INP/FCP/TTFB'yi `/api/vitals`'a gönderir (çerezsiz); pano 7 günlük p75'i mobil
  ayrımıyla gösterir (kabul: LCP < 2,5 s, CLS < 0,1). Fontlar `display: "optional"` ile yüklenir: yavaş ağda metrik uyumlu yedek font
  kalır, font arka planda önbelleğe alınır; böylece LCP font takasına takılmaz.
- **Lighthouse (mobil, simüle yavaş 4G, bu ortamda):** performans 96–97, CLS 0, TBT 60–100 ms, FCP 0,7–0,8 s, LCP 2,4–2,8 s (koşular arası
  ±0,2 s oynar; gözlenen gerçek render gecikmesi ~100 ms, sayı Lighthouse'un ağ modelinden gelir). Kabul ölçütü canlı alan verisi (pano) ile izlenir.

## Ek kaynaklar, depo, güvenlik ve testler (Faz 5 sonrası)

- **SPK / BDDK / EPDK / BOTAŞ:** `packages/sources/src/listing/` genel liste adapter'ı (çoklu liste, `{yil}` adresleri, ana içerik seçicisi,
  detay sayfasındaki PDF eki). 2026-10-02'de canlıda doğrulandı: SPK yıllık bülten sayfası (PDF; hafta içi 16–22 arası 10 dk), BDDK basın +
  mevzuat + kuruluş duyuruları (metin PDF ekinde; aynı duyuru iki kategorideyse tek olay), EPDK duyuru tablosu, BOTAŞ doğal gaz toptan satış
  tarifesi (yeni tarife = yeni kart; kurumsal haberler alınmaz). Diğerleri hafta içi 15 dk. Kapalı gelir; `pnpm db:seed -- --enable spk`
  (ilk liste adresi `<ID>_LIST_URL` ile ezilir). Altın örnek henüz yok.
- **TLS ara sertifikaları:** bazı kurum sunucuları zinciri eksik gönderir (BDDK). `packages/sources/certs/*.pem` ilk istekte Node'un CA listesine
  eklenir (`extraCa.ts`, `tls.setDefaultCACertificates`); doğrulama kapatılmaz.
- **S3/MinIO:** `S3_BUCKET` + anahtarlar tanımlıysa belgeler S3'e (`S3_ENDPOINT` ile MinIO path-style), yoksa `storage/`.
- **Güvenlik:** haber gövdesi Markdown'ı ham HTML'i kaçırır ve yalnızca http(s)/mailto bağlantılarına izin verir; `/api/revalidate` sırrı sabit
  zamanlı karşılaştırılır; herkese açık POST uçlarında IP başına hız sınırı; `nosniff`, `Referrer-Policy`, `X-Frame-Options`,
  `Permissions-Policy`, HTTPS'te HSTS. **CSP:** middleware varsayılan olarak `Content-Security-Policy-Report-Only` gönderir (ihlaller
  `/api/csp-report` → sunucu günlüğü); `CSP_ENFORCE=1` ile zorlanır. Nonce tabanlı sıkı CSP bilinçli olarak kullanılmadı: Next nonce'u yalnızca
  dinamik sayfalara uygular ve ISR önbelleğini iptal ederdi; politika `'unsafe-inline'` + yalnızca izinli reklam alan adları, `object-src 'none'`,
  `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'self'` ile sınırlıdır. Bu ortamda ana sayfa, haber, takvim ve bülten sayfalarında
  (reklam rızası dahil) sıfır ihlal raporlandı.
- **İşletim:** `/api/health` (DB, son olay zamanı, bekleyen olay) uptime izleme için; admin "Dağıtım günlüğü" Telegram/X sonuçlarını listeler.
- **Piyasa şeridi:** `EVDS_API_KEY` tanımlıysa worker 30 dk'da bir TCMB EVDS gösterge kurlarını (USD/EUR/GBP) `market_quotes`'a çeker; ana sayfa
  şeridi son değeri ve bir önceki işlem gününe göre değişimi gösterir (`pnpm pipeline:run -- --market`). BIST100 için lisanslı veri gerekir.
- **Kategori sponsorluğu:** `CATEGORY_SPONSORS` JSON'u ile kategori sayfasında "Sponsorlu" kartı (`rel="sponsored"`).
- **Ürün:** ana sayfada son 3 saatin importance ≥ 5 haberi "Son dakika" barında; `/bildirimler` push kategori tercihleri ve iptal; bülten
  sponsor bloğu (`BULLETIN_SPONSOR_*`, "Sponsorlu" etiketli).
- **Testler:** `pnpm test` (vitest, 170 test) + `pnpm e2e` (Playwright: site, PWA/SW, rıza kapısı, admin auth, formlar, güvenlik başlıkları).
  CI: `.github/workflows/ci.yml` (typecheck · lint · test, sonra fixture verisiyle build + e2e).

## Bilinen kısıtlar

- **resmigazete.gov.tr TLS zinciri** TÜBİTAK Kamu SM köküne dayanır; Node bunu tanımaz (`UNABLE_TO_VERIFY_LEAF_SIGNATURE`). Kök sertifikayı (parmak izini kamusm.gov.tr'de doğrulayarak) `packages/sources/certs/` altına koyun ya da `NODE_EXTRA_CA_CERTS` ile verin. Doğrulamayı kapatmayın.
- `packages/sources/fixtures/day-2025-09-26.html` yeniden oluşturulmuş bir fihrist; gerçek kopya için `pnpm --filter @kaynak/sources capture -- 2025-09-26`.
- PGlite dosya modu tek süreç kilidi kullanır: aynı `DATABASE_URL` ile web ve worker'ı aynı anda açmayın (pipeline'ı çalıştırın, sonra web'i açın; ya da Postgres kullanın).
- `numericGroundingCheck` küçük sayılarda (ör. "5") yanlış kabul üretebilir; yanlış RED üretmemeye öncelik verir. Saatler ("10:30") ayrı anahtarla eşlenir; yazarın listelediği bileşik ifadeler ("100–228 MVA", "02.10.2026 16:04:43") parçalarıyla doğrulanır. Resmi listedeki yayın zamanı belgeye eşdeğer sayılır (`groundingExtra`).
- **KAP borsa kodu:** PDF'te kod geçmez; yazara liste kaydındaki kod "Borsa kodu" satırıyla verilir, haberin `tickers` alanına yalnızca bu kodlar ve belgede geçenler girer. Uzunluk alt sınırı PDF'in sabit kalıplarından (Özet Bilgi, sorumluluk beyanı) arınmış içerikten hesaplanır.
- Sahte ajan (`fakeAgents`) KAP belgelerinde kısa satırlar yüzünden 120 kelimeye ulaşamayıp taslağı review'a düşürebilir; gerçek modelde bu sınır yoktur.
- TÜİK/TCMB metinlerindeki "tahmin edildi" resmi ifadesi yasaklı kalıp listesine takılır ve haber review'a düşer (reddedilmez); gerçek yazar ajanı kurum ifadesini yeniden kurar.
- `/_dev/ui` parçası precache'ten dışlanır (klasör adı `%5Fdev` sunucudan 400 döner).

## Uçtan uca prova

`pnpm rehearsal` gerçek Postgres ve Redis ile worker'ı (BullMQ) ve web'i (`next start`) süreç olarak çalıştırır; kaynak siteleri ve Telegram sahte bir sunucudadır, ajanlar sahtedir.
Senaryo: olay → haber → revalidate → RSS → Telegram; ardından Resmi Gazete "yeniden tasarlanır", alarm gelmeli; düzelince iyileşme bildirimi gelmeli.
CI'da her push'ta koşar (`rehearsal` işi, rapor `prova-raporu` artefaktında). Yerelde: `pnpm --filter @kaynak/web build` sonra `DATABASE_URL=postgres://… REDIS_URL=redis://… pnpm rehearsal`.
