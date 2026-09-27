# Kaynak

Resmi kaynaktan, dakikalar içinde, doğrulanmış. Şartname: [docs/SPEC.md](docs/SPEC.md).

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

Durum: Faz 0 (iskelet), Faz 1 (Resmi Gazete), Faz 2 (KAP) ve Faz 3 (takvim + PWA + dağıtım) tamam; sırada Faz 4 (admin + SEO + kurumsal).

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
- **Doğrulama sınırı:** Geliştirme ortamından kap.org.tr'ye erişilemediği için liste JSON alan adları (`basic.disclosureIndex`, `publishDate`, `kapTitle`, `stockCodes`, `disclosureClass`, `ruleTypeTerm`, `summary`, `isOldKap`) kamuya açık kullanımlardan derlendi; ayrıştırıcı eş anlamlı alan adlarını ve `basic` sarmalayıcısı olmayan biçimi de kabul eder. İlk canlı çalıştırmada `capture:kap` çıktısını `packages/sources/src/kap/parse.ts` ile karşılaştır. `packages/agents/fixtures/kap/` altındaki belgeler **sentetiktir** (gerçek şirket değil).

Docker ile tam kurulum: `docker compose up -d postgres redis minio`, `.env` içinde `DATABASE_URL=postgres://…` ve `REDIS_URL=redis://localhost:6379`, sonra `pnpm dev:worker`.

## Takvim, PWA ve dağıtım (Faz 3)

```bash
pnpm pipeline:run -- --calendar --fixture        # TÜİK/TCMB takvim fixture'ını calendar_events'e yükle (canlı: --fixture'sız)
pnpm pipeline:run -- --source tcmb --fixture     # TCMB basın duyurusu beslemesi (tuik için --source tuik)
pnpm pipeline:run -- --bulletin --dry            # sabah bültenini konsola yaz; --dry'sız gönderir
pnpm --filter @kaynak/web build && pnpm --filter @kaynak/web start   # PWA yalnızca üretim derlemesinde (public/sw.js)
```

- **TCMB / TÜİK:** RSS/Atom tabanlı `FeedAdapter` (`packages/sources/src/feed/`); besleme ve takvim adresleri `.env` ile ezilebilir.
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
- **Doğrulama sınırı:** Bu ortamdan tcmb.gov.tr / tuik.gov.tr'ye erişilemedi. Varsayılan besleme/takvim adresleri ve sayfa yapıları
  kamuya açık bilgiden derlendi; ayrıştırıcılar RSS 2.0/Atom ve genel tablo/liste yapılarına hoşgörülüdür. İlk canlı çalıştırmada
  `--source tcmb`, `--source tuik` ve `--calendar` çıktısını kontrol edin; adres değiştiyse `.env`'den ezin. `packages/agents/fixtures/tcmb|tuik` sentetiktir.
  Lighthouse bu ortamda koşulamadı; PWA ölçütleri (manifest, SW, çevrimdışı, ikonlar) Playwright ile doğrulandı.

## Bilinen kısıtlar

- **resmigazete.gov.tr TLS zinciri** TÜBİTAK Kamu SM köküne dayanır; Node bunu tanımaz (`UNABLE_TO_VERIFY_LEAF_SIGNATURE`). Kök sertifikayı indirip `NODE_EXTRA_CA_CERTS` ile verin. Doğrulamayı kapatmayın.
- `packages/sources/fixtures/day-2025-09-26.html` yeniden oluşturulmuş bir fihrist; gerçek kopya için `pnpm --filter @kaynak/sources capture -- 2025-09-26`.
- PGlite dosya modu tek süreç kilidi kullanır: aynı `DATABASE_URL` ile web ve worker'ı aynı anda açmayın (pipeline'ı çalıştırın, sonra web'i açın; ya da Postgres kullanın).
- `numericGroundingCheck` küçük sayılarda (ör. "5") yanlış kabul üretebilir; yanlış RED üretmemeye öncelik verir. Saat biçimleri ("10:30") jeton sayılmaz.
- Sahte ajan (`fakeAgents`) KAP belgelerinde kısa satırlar yüzünden 120 kelimeye ulaşamayıp taslağı review'a düşürebilir; gerçek modelde bu sınır yoktur.
- TÜİK/TCMB metinlerindeki "tahmin edildi" resmi ifadesi yasaklı kalıp listesine takılır ve haber review'a düşer (reddedilmez); gerçek yazar ajanı kurum ifadesini yeniden kurar.
- `/_dev/ui` parçası precache'ten dışlanır (klasör adı `%5Fdev` sunucudan 400 döner).
