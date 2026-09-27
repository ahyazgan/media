# Kaynak

Resmi kaynaktan, dakikalar içinde, doğrulanmış. Şartname: [docs/SPEC.md](docs/SPEC.md).

## Yapı

```
apps/web          Next.js 15 App Router (ISR) — /, /haber/[slug], /resmi-gazete/[tarih], /kategori/[slug], /sirket, /sirket/[kod], /api/kap/feed, /_dev/ui
apps/worker       BullMQ kuyrukları (REDIS_URL varsa) ya da süreç içi zamanlayıcı; `sources.enabled` olan adapter'ları tarar
packages/db       Drizzle şeması + migration; PGlite (gömülü) veya Postgres
packages/sources  SourceAdapter sözleşmesi, nezaket kuralları (robots, UA, backoff), Resmi Gazete ve KAP adapter'ları
packages/agents   classify (Haiku) / write (Sonnet) çağrıları, prompt'lar, kural motoru, altın örnekler
packages/pipeline dedupe → classify → (şirket bağlama) → verify → write → edit → publish; CLI çalıştırıcı
packages/ui       Fuşya Gazete token'ları ve bileşenler
```

Durum: Faz 0 (iskelet), Faz 1 (Resmi Gazete uçtan uca) ve Faz 2 (KAP) tamam; sırada Faz 3 (takvim + PWA + dağıtım).

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

## Bilinen kısıtlar

- **resmigazete.gov.tr TLS zinciri** TÜBİTAK Kamu SM köküne dayanır; Node bunu tanımaz (`UNABLE_TO_VERIFY_LEAF_SIGNATURE`). Kök sertifikayı indirip `NODE_EXTRA_CA_CERTS` ile verin. Doğrulamayı kapatmayın.
- `packages/sources/fixtures/day-2025-09-26.html` yeniden oluşturulmuş bir fihrist; gerçek kopya için `pnpm --filter @kaynak/sources capture -- 2025-09-26`.
- PGlite dosya modu tek süreç kilidi kullanır: aynı `DATABASE_URL` ile web ve worker'ı aynı anda açmayın (pipeline'ı çalıştırın, sonra web'i açın; ya da Postgres kullanın).
- `numericGroundingCheck` küçük sayılarda (ör. "5") yanlış kabul üretebilir; yanlış RED üretmemeye öncelik verir. Saat biçimleri ("10:30") jeton sayılmaz.
- Sahte ajan (`fakeAgents`) KAP belgelerinde kısa satırlar yüzünden 120 kelimeye ulaşamayıp taslağı review'a düşürebilir; gerçek modelde bu sınır yoktur.
