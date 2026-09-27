# Kaynak

Resmi kaynaktan, dakikalar içinde, doğrulanmış. Şartname: [docs/SPEC.md](docs/SPEC.md).

## Yapı

```
apps/web          Next.js 15 App Router (ISR) — /, /haber/[slug], /resmi-gazete/[tarih], /kategori/[slug], /_dev/ui
apps/worker       BullMQ kuyrukları (REDIS_URL varsa) ya da süreç içi zamanlayıcı
packages/db       Drizzle şeması + migration; PGlite (gömülü) veya Postgres
packages/sources  SourceAdapter sözleşmesi, nezaket kuralları (robots, UA, backoff), Resmi Gazete adapter'ı
packages/agents   classify (Haiku) / write (Sonnet) çağrıları, prompt'lar, kural motoru, altın örnekler
packages/pipeline dedupe → classify → verify → write → edit → publish; CLI çalıştırıcı
packages/ui       Fuşya Gazete token'ları ve bileşenler
```

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

Docker ile tam kurulum: `docker compose up -d postgres redis minio`, `.env` içinde `DATABASE_URL=postgres://…` ve `REDIS_URL=redis://localhost:6379`, sonra `pnpm dev:worker`.

## Bilinen kısıtlar

- **resmigazete.gov.tr TLS zinciri** TÜBİTAK Kamu SM köküne dayanır; Node bunu tanımaz (`UNABLE_TO_VERIFY_LEAF_SIGNATURE`). Kök sertifikayı indirip `NODE_EXTRA_CA_CERTS` ile verin. Doğrulamayı kapatmayın.
- `packages/sources/fixtures/day-2025-09-26.html` yeniden oluşturulmuş bir fihrist; gerçek kopya için `pnpm --filter @kaynak/sources capture -- 2025-09-26`.
- PGlite dosya modu tek süreç kilidi kullanır: aynı `DATABASE_URL` ile web ve worker'ı aynı anda açmayın (pipeline'ı çalıştırın, sonra web'i açın; ya da Postgres kullanın).
- `numericGroundingCheck` küçük sayılarda (ör. "5") yanlış kabul üretebilir; yanlış RED üretmemeye öncelik verir.
