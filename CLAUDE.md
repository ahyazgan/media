# Kaynak — depo rehberi

Türkiye ekonomi haberlerini resmi kaynaklardan (Resmi Gazete, KAP, TCMB, TÜİK; SPK/BDDK/EPDK/BOTAŞ) dakikalar içinde,
belgeye bağlı ve doğrulanmış habere çeviren pnpm monorepo. Şartname: `docs/SPEC.md`. Yayına çıkış listesi: `docs/YAYINA-HAZIRLIK.md`.

## Komutlar

```bash
pnpm install && cp .env.example .env      # DATABASE_URL=pglite://./data/kaynak (Docker'sız)
pnpm check                                # typecheck + lint + vitest (ağ ve API anahtarı gerekmez)
pnpm pipeline:run -- --fixture            # Resmi Gazete kuru çalıştırma; --source kap|tcmb|tuik --fixture; --calendar --fixture
pnpm dev                                  # http://localhost:3000 (PWA/service worker yalnızca üretim derlemesinde)
pnpm --filter @kaynak/web build && pnpm e2e   # Playwright duman testleri (sunucuyu 3100'de kendisi açar)
pnpm dev:worker                           # REDIS_URL yoksa süreç içi zamanlayıcı
pnpm db:generate                          # şema değişince migration üret (packages/db/drizzle); db:migrate; db:seed -- --enable kap
```

## Mimari (kısa)

- `packages/sources`: `SourceAdapter` sözleşmesi (`fetchNew`, `fetchDocument`, `schedule`), `politeFetch` (robots, UA, backoff, host başına 2
  eş zamanlı istek). Adapter'lar: `resmi-gazete/` (fihrist), `kap/` (JSON liste), `feed/` (RSS/Atom → `tcmb.ts`, `tuik.ts`), `listing/`
  (HTML liste → spk, bddk, epdk, botas), `calendar/` (TÜİK/TCMB takvim içe aktarımı). Her adapter'ın testleri fixture'larla ağsız koşar.
- `packages/agents`: classify (Haiku) / write (Sonnet) çağrıları, zod şemaları, prompt'lar, kural motoru (`edit/`: numericGroundingCheck,
  banned, uzunluk/başlık). `fixtures/<kaynak>/NN-*/` altın örnekler; `LIVE=1 pnpm test:agents` canlı modelle doğrular.
- `packages/pipeline`: `processEvent` = belge indir/sakla → classify → şirket bağlama → verify → write → edit → publish|review|reject; sürüm
  anlık görüntüsü; `publish.ts` kancası (revalidate, Telegram, X, push, IndexNow); takvim, bülten, e-posta, push, editoryal işlemler, ölçütler,
  hata kayıtları, depo (disk/S3). Alt yol dışa aktarımları web tarafından kullanılır (`@kaynak/pipeline/editorial` vb.).
- `packages/db`: Drizzle şeması (`schema.ts`), PGlite/Postgres istemcisi, migration'lar, seed (kaynaklar; KAP/TCMB/TÜİK/… kapalı gelir).
- `apps/worker`: kayıtlı adapter'ları `sources.enabled`'a göre tarar; takvim saatinde sık tarama; günlük takvim/ölçüt işleri; 07:30 bülten;
  düşen işler `job_failures`.
- `apps/web`: Next.js 15 App Router. Sunucu bileşenleri DB'yi `lib/db.ts` üzerinden okur; yazma yalnızca API rotaları ve admin server
  action'ları. PWA (Serwist `app/sw.ts`), rıza kapılı reklam (`components/Ad.tsx`), admin (`middleware.ts` Basic Auth).
- `packages/ui`: Fuşya Gazete token'ları ve sunum bileşenleri (durum yok; `LinkComponent` enjekte edilir).

## Kurallar

- Yorum, tahmin, tavsiye dili üretme: `packages/agents/src/edit/banned.ts` kalıpları haberde yasak; prompt değişikliği `pnpm test:agents`
  geçmeden merge edilmez. Belgede geçmeyen sayı → reddedilir (`numericGroundingCheck`).
- Hard delete yok: `articles`/`article_versions` silinmez; düzeltme ve geri çekme sürüm olarak saklanır.
- Model kimlikleri `.env`'den (`MODEL_CLASSIFY`, `MODEL_WRITE`); kodda sabitleme.
- Herkese açık POST uçlarında `lib/rateLimit.ts` ve KVKK rıza kontrolü; kullanıcı girdisi Markdown'a giderse `lib/markdown.ts` (HTML kaçışı).
- CSP `middleware.ts`'te (Report-Only varsayılan). Yeni bir dış kaynak (script/iframe/connect) eklerken listeye alın; nonce kullanmayın (ISR bozulur).
- Reklam: slot boyutları sabit (CLS), "Reklam"/"Sponsorlu" etiketi, rıza öncesi script yok, kayan kutu/otomatik video yok.
- Kaynak adresleri kurumlarca taşınabilir: adapter'lar hoşgörülü ayrıştırır, adresler `.env` ile ezilir; canlı doğrulama `docs/YAYINA-HAZIRLIK.md`.
- Türkçe: kod yorumları ve arayüz metinleri Türkçe; tanımlayıcılar İngilizce.
- PGlite dosya modu tek süreç kilidi: `next build`/`next start`/worker aynı `DATABASE_URL` dosyasını aynı anda açamaz (Postgres'te sorun yok).

## Doğrulama alışkanlığı

Değişiklik sonrası: `pnpm check` → gerekiyorsa `pnpm --filter @kaynak/web build` → `pnpm e2e`. Yeni kaynak eklerken: fixture + parse testi,
seed satırı (kapalı), worker kaydı, `SOURCE_NAMES`, `fakeAgents` kategorisi, prompt ipucu, README "Doğrulama sınırı" notu.
