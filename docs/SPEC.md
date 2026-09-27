# Kaynak — Proje Şartnamesi

Sürüm 1.0 · 26 Eylül 2026 · Çalışma adı "Kaynak" geçicidir.

## 1. Vizyon ve konum

Türkiye'de ekonomi haberi iki şekilde üretiliyor: büyük ajanslar 100–200 kişiyle hızlı ama yüzeysel ve zaman zaman yanlış; veri siteleri doğru ama haber dili yok. Kaynak, ikisinin arasındaki boşluğu dolduruyor: resmi kaynaktan çıkan her bildirimi dakikalar içinde, doğrulanmış, belgeye linkli, okunabilir habere çeviriyor.

Konumlandırma cümlesi: **"Resmi kaynaktan, dakikalar içinde, doğrulanmış."**

Hedef kitle, öncelik sırasıyla: bireysel borsa yatırımcısı, KOBİ sahibi ve mali müşavir (mevzuat takibi), finans sektörü çalışanı.

Bilinçli olarak yapmadıklarımız: yorum, analiz, tahmin, yatırım tavsiyesi, üçüncü taraf haber sitesinden alıntı, sosyal medya söylentisi.

## 2. Kapsam

### MVP (ilk 4 hafta)
- Üç modül: **Resmi Gazete günlük**, **KAP akışı**, **Makro takvim** (TCMB + TÜİK duyuruları)
- Sayfalar: ana sayfa, haber detay, şirket profili, kategori, Resmi Gazete günü, takvim, kurumsal sayfalar (künye, iletişim, düzeltme politikası, KVKK, reklam)
- PWA: ana ekrana ekleme, çevrimdışı okuma, web push
- Dağıtım: Telegram kanalı otomatik paylaşım, RSS çıkışı, günlük sabah bülteni (e-posta)
- Yönetim: basit `/admin` — inceleme kuyruğu, yayınla/reddet, düzeltme yayınla

### MVP dışı (Faz 4+)
SPK haftalık bülten, BDDK/EPDK/BOTAŞ duyuruları, şirket finansal tablo özetleri, reklam entegrasyonu, X otomatik paylaşım, kullanıcı hesapları ve kişiselleştirme.

## 3. Mimari

```
[Kaynak siteleri] → watch (adapter) → raw_events
      → dedupe → classify (Haiku) → verify (belge indir + metin çıkar)
      → write (Sonnet) → edit (kural motoru + numericGroundingCheck)
      → publish | review kuyruğu
publish → articles → Next.js ISR revalidate → IndexNow ping → push + Telegram
```

- **apps/worker** BullMQ kuyruklarıyla çalışır: `watch`, `process`, `publish`, `distribute`. Her aşama ayrı job; başarısız job üç kez tekrar denenir, sonra `dead` kuyruğuna düşer ve admin'de görünür.
- **apps/web** Next.js App Router. Haber sayfaları ISR (revalidate on publish). Ana sayfa 60 sn ISR + istemci tarafında KAP akışı için 30 sn'lik polling.
- **packages/db** tek şema, hem web hem worker okur; yalnızca worker ve admin yazar.
- **packages/agents** Anthropic SDK çağrıları, prompt'lar, zod şemaları, altın örnek fixture'ları. Model kimliklerini kodda sabit değil `.env`'den oku; güncel model listesi için docs.claude.com'a bak.

Barındırma önerisi: geliştirme Docker Compose; üretim için web Vercel, worker + Postgres + Redis tek Hetzner VPS (Docker Compose, günlük yedek). Bütçe daralırsa hepsi VPS'e taşınabilir; kod buna bağımlı olmamalı.

## 4. Kaynaklar

| Kaynak | Ne izlenir | Sıklık | Otomatik yayın | Not |
|---|---|---|---|---|
| Resmi Gazete (resmigazete.gov.tr) | Günün sayısı, mükerrer sayılar; bölüm: Yönetmelik, Tebliğ, CB Kararı, Kanun, Yargı | 06:00–10:00 arası 3 dk, sonra 30 dk | Evet | Metinler FSEK m.31 gereği telifsiz. Her madde ayrı `document` |
| KAP (kap.org.tr) | Bildirim listesi: Özel Durum Açıklaması, Sermaye artırımı, Pay alım-satım, Finansal rapor, Genel kurul | 60 sn (piyasa saatleri), 5 dk (dışı) | Evet | Ham veriyi yeniden dağıtma; haberleştir ve KAP'a linkle. Kullanım koşullarını Faz 2 başında oku, gerekiyorsa MKK ile lisans görüş |
| TCMB | PPK karar metni, basın duyuruları, EVDS veri yayın takvimi | Takvim saatinde 30 sn, diğer zamanlarda 10 dk | Evet | EVDS API için ücretsiz anahtar al |
| TÜİK | Haber bültenleri, veri yayımlama takvimi | Takvim saatinde 30 sn, diğer 15 dk | Evet | Bülten saatleri sabittir (10:00); takvim tablosunu ay başında çek |
| SPK (Faz 4) | Haftalık bülten PDF | Cuma 17:00–20:00 arası 5 dk | Evet | PDF metin çıkarımı gerekir |
| BDDK / EPDK / BOTAŞ (Faz 4) | Duyuru listeleri | 15 dk | Evet | |
| Muhabir X hesapları, Telegram (Faz 5) | Belirlenmiş liste | 2 dk | **Hayır** | Her zaman `review` kuyruğu; iki bağımsız kaynak şartı |

Adapter sözleşmesi (`SourceAdapter`):
```ts
interface SourceAdapter {
  id: string;                       // "resmi-gazete"
  official: boolean;                // otomatik yayın izni
  schedule(): CronLike;             // yukarıdaki sıklık
  fetchNew(since: Date): Promise<RawEvent[]>;
  fetchDocument(ev: RawEvent): Promise<{ url: string; mime: string; bytes: Buffer }>;
}
```
`RawEvent`: `{ sourceId, externalId, title, url, publishedAt, payloadHash, payload }`. `externalId + payloadHash` çifti tekilleştirme anahtarıdır.

Nezaket kuralları: `robots.txt` okunur; `User-Agent: KaynakBot/1.0 (+https://<site>/bot; iletisim@<site>)`; 429/503'te üstel geri çekilme; aynı kaynağa eş zamanlı en fazla 2 istek.

## 5. Ajan zinciri

### 5.1 classify — model: küçük/ucuz (ör. Haiku)
Girdi: `RawEvent` başlık + ilk 2.000 karakter. Çıktı (zod):
```ts
{
  category: "borsa" | "mevzuat" | "makro" | "bankacilik" | "enerji" | "sirketler" | "diger",
  importance: 1 | 2 | 3 | 4 | 5,      // 5 = herkesi ilgilendirir (faiz kararı, asgari ücret)
  entities: { companies: string[]; tickers: string[]; institutions: string[] },
  isNews: boolean,                     // rutin/teknik bildirimler (ör. adres değişikliği) false
  summaryHint: string                  // yazar ajanına tek cümle yönlendirme
}
```
`isNews=false` olanlar yayınlanmaz ama şirket profilinde "bildirim geçmişi"nde listelenir.

### 5.2 verify
- Belge indirilir, `documents` tablosuna kaydedilir (bytes S3/MinIO, metin Postgres).
- PDF → metin: `pdf-parse`; HTML → `readability` benzeri temizleme.
- Kontrol: başlık ile belge metni arasında en az 2 anahtar kelime örtüşmesi; yoksa `review`.
- Resmi olmayan kaynak: ikinci bağımsız kaynak bulunana kadar `review`.

### 5.3 write — model: orta (ör. Sonnet)
Sistem prompt'unun özü:
- Sen bir ekonomi muhabirisin; yalnızca verilen belgeye dayanarak yazarsın.
- Belgede olmayan hiçbir sayı, isim, tarih, sonuç yazmazsın.
- Yorum, tahmin, tavsiye yok. "Olabilir", "bekleniyor", "uzmanlara göre" yasak.
- Ters piramit: ilk cümle olayı verir (kim, ne, ne zaman). 120–350 kelime.
- Başlık ≤ 70 karakter, tırnak ve ünlem yok, clickbait yok.
- Çıktı yalnızca JSON.

Çıktı (zod):
```ts
{
  title: string; dek: string;
  bodyMarkdown: string;
  keyFacts: { text: string; quoteFromSource: string }[];  // her olgu için belgeden birebir alıntı
  tickers: string[]; tags: string[];
  numbersUsed: string[];                                   // gövdedeki her sayı, edit aşaması kontrol eder
}
```

### 5.4 edit — kural motoru, model yok
Sırayla:
1. `numericGroundingCheck`: `numbersUsed` içindeki her değer belge metninde normalize edilmiş biçimde (binlik/ondalık ayırıcı farkları tolere edilir) geçmeli. Geçmeyen varsa **red**.
2. `bannedPhrases`: `packages/agents/src/banned.ts` (tavsiye, tahmin, abartı kalıpları). Eşleşme varsa write aşaması bir kez daha denenir, tekrar eşleşirse `review`.
3. Uzunluk, başlık karakter sınırı, boş `keyFacts` kontrolü.
4. `importance >= 4` ise insan onayı (`review`), aksi halde `publish`. Bu eşik `.env` ile ayarlanır; güven kazandıkça 5'e çekilir.

### 5.5 publish
- `articles` kaydı `published`, slug üretimi (`slugify(title) + "-" + shortId`).
- Next.js `revalidatePath` çağrısı (ana sayfa, kategori, şirket, haber).
- IndexNow ping, news sitemap güncellemesi.
- `importance >= 4` → web push (kategori aboneliğine göre) + Telegram kanalı; diğerleri yalnızca Telegram.

### 5.6 Altın örnekler
`packages/agents/fixtures/` altında her kaynak için en az 5 gerçek belge + beklenen çıktı. `pnpm test:agents` bunları çalıştırır; yeni prompt değişikliği bu testi geçmeden merge edilmez.

## 6. Tasarım ve sayfalar

### 6.1 Token'lar (Fuşya Gazete)
```
--ink: #1A1826      --ground: #FFFFFF     --tint: #F6F3F7
--line: #E7E1EA     --muted: #7A7388      --body: #4B4458
--accent: #E0187B   --accent-2: #0E9A9A   --up: #12875D   --down: #C8203D
Başlık: Fraunces (600, 800) · Metin: DM Sans (400, 500, 700)
Köşe: 4–6 px · Kolon genişliği masaüstü 1040 (skin reklamlı) / 1360 (reklamsız)
```
Tasarım kanvası: Claude'daki "Haber Sitesi — Ana Sayfa Konseptleri" artifact'ı, artboard "5. Fuşya Gazete (reklam alanlı)" ve "PWA 5. Fuşya Gazete (reklam alanlı)". Kodlarken bu iki artboard esas alınır.

### 6.2 Sayfalar ve rotalar
| Rota | İçerik | Render |
|---|---|---|
| `/` | Piyasa şeridi, son dakika barı, manşet, sıcak gelişmeler, canlı KAP akışı, Resmi Gazete bugün, makro takvim, kategori kartları | ISR 60 sn |
| `/haber/[slug]` | Başlık, dek, gövde, "Kaynak belge" kutusu (link + belge özeti), keyFacts listesi, ilgili şirket, düzeltme geçmişi | ISR, publish'te revalidate |
| `/sirket/[kod]` | Şirket adı, KAP kodu, bildirim geçmişi (isNews=false dahil), ilgili haberler | ISR |
| `/kategori/[slug]` | Kategori listesi, sayfalama | ISR |
| `/resmi-gazete/[yyyy-mm-dd]` | Günün tüm maddeleri türe göre gruplu | ISR |
| `/takvim` | Önümüzdeki 30 gün veri açıklama takvimi | ISR günlük |
| `/kunye`, `/iletisim`, `/duzeltme-politikasi`, `/kvkk`, `/cerez-politikasi`, `/reklam` | Statik | SSG |
| `/admin/*` | İnceleme kuyruğu, dead job'lar, düzeltme yayınlama | Basic auth, robots noindex |
| `/rss.xml`, `/sitemap.xml`, `/news-sitemap.xml`, `/manifest.webmanifest` | Üretilmiş | Route handler |

### 6.3 Haber detay sayfası (gelir ve SEO'nun yüzde 80'i burada)
Sıra: kategori etiketi → başlık (Fraunces 36) → dek → yazar satırı ("Kaynak Haber Merkezi · Sorumlu editör: [ad]" + "Bu haber resmi belgeden otomatik üretilmiş ve editör kurallarından geçmiştir" açıklaması) → yayın/güncelleme saati → gövde (max 680 px, 18 px DM Sans, satır 1.65) → **Kaynak belge kutusu** (belge adı, kurum, tarih, "Belgeyi aç" butonu) → keyFacts ("Belgede ne diyor") → ilgili şirket kartı → ilgili haberler → yorum yok.

Reklam alanları (Faz 5'te aktif, şimdiden slot bileşeni ile yer tutulur): başlık altı 970×90 / 320×100, gövde 3. paragraf sonrası 300×250 (mobilde 336×280), sağ ray 300×600 (masaüstü), sekme çubuğu üstü 320×50 (PWA). Hepsinde "Reklam" etiketi.

### 6.4 Bileşenler (`packages/ui`)
`Masthead`, `MarketTicker`, `BreakingBar`, `HeroArticle`, `ArticleListItem`, `KapFeed`, `GazetteList`, `MacroCalendar`, `SourceBox`, `KeyFacts`, `AdSlot`, `InstallBanner`, `TabBar`, `CookieBar`. Her bileşen Storybook değil, `/_dev/ui` sayfasında listelenir (hafif tutuyoruz).

## 7. PWA

- `manifest.webmanifest`: `display: standalone`, `theme_color: #E0187B`, `background_color: #FFFFFF`, 192/512 px maskable ikonlar, `start_url: /?utm_source=pwa`, `share_target` ile paylaşılan URL'yi arama sayfasına al.
- Service worker (Serwist): uygulama kabuğu precache; `/api/*` network-first + 1 saatlik önbellek; son 50 haber ve ana sayfa çevrimdışı okunabilir; görseller stale-while-revalidate.
- Web push: VAPID anahtarları `.env`; abonelik `push_subscriptions` tablosunda kategori tercihleriyle; iOS'ta yalnızca ana ekrana eklenmiş PWA'da çalıştığı için `InstallBanner` ile izin akışı birlikte tasarlanır (izin, ekleme sonrasında istenir).
- `InstallBanner` iOS'ta "Paylaş → Ana Ekrana Ekle" adımlarını gösterir; Android'de `beforeinstallprompt` yakalanır.
- `viewport-fit=cover`, güvenli alan padding'leri; sahte durum çubuğu yok.

## 8. SEO ve dağıtım

- Her haber sayfasında `NewsArticle` JSON-LD (`datePublished`, `dateModified`, `author`, `publisher`, `isAccessibleForFree: true`, `citation` alanında kaynak belge URL'si).
- `news-sitemap.xml` son 48 saat; `sitemap.xml` tamamı; IndexNow her publish'te.
- OG görseli otomatik (`@vercel/og`): Fuşya token'larıyla başlık + kategori + logo. Discover için 1200 px genişlik.
- Yayına çıktıktan sonra: Google Publisher Center, Bing Webmaster, Yandex Webmaster başvuruları (Türkiye'de Yandex payı küçük ama sıfır değil).
- Telegram kanalı: her haber, başlık + tek cümle + link. X: Faz 5, yalnızca resmi hesap, günde en fazla 30 gönderi, bot ağı yok.
- Sabah bülteni 07:30: dün gece Resmi Gazete, bugünün takvimi, en önemli 5 haber.

## 9. Fazlar ve kabul kriterleri

**Faz 0 — İskelet (gün 1–3)**
Monorepo, Docker Compose, Drizzle şeması ve ilk migration, lint/typecheck/test boru hattı, `.env.example`, boş Next.js uygulaması Fuşya token'larıyla ayağa kalkar.
Kabul: `pnpm dev` çalışır, `pnpm test` yeşil, `/` sayfası masthead'i gösterir.

**Faz 1 — Resmi Gazete uçtan uca (hafta 1–2)**
`resmi-gazete` adapter'ı, verify, write, edit, publish; `/resmi-gazete/[tarih]`, `/haber/[slug]`, `/` üzerinde Resmi Gazete bloğu.
Kabul: Gerçek bir Resmi Gazete günü, insan dokunmadan sitede haber olarak görünür; `numericGroundingCheck` bilerek bozulmuş bir fixture'ı reddeder; 5 altın örnek testi geçer.

**Faz 2 — KAP (hafta 3)**
`kap` adapter'ı, `companies` tablosu, `/sirket/[kod]`, ana sayfada canlı akış (30 sn polling).
Kabul: Piyasa saatinde KAP bildirimi 3 dakika içinde sitede; isNews=false bildirimler şirket sayfasında listelenir ama haber olmaz.

**Faz 3 — Takvim + PWA + dağıtım (hafta 4)**
TCMB/TÜİK adapter'ları, `/takvim`, manifest + service worker + push, Telegram bot, RSS, sabah bülteni.
Kabul: Lighthouse PWA denetimi geçer; iPhone'da ana ekrana eklenip push alınır; Telegram kanalına otomatik gönderi düşer.

**Faz 4 — Admin + SEO + kurumsal (ay 2)**
`/admin` inceleme kuyruğu, düzeltme akışı ve `article_versions`; JSON-LD, sitemap'ler, IndexNow, OG görseli; künye/KVKK/düzeltme politikası sayfaları; Publisher Center başvurusu.
Kabul: Search Console'da news sitemap hatasız; bir düzeltme yayınlandığında sayfada "Düzeltildi" notu ve geçmiş görünür.

**Faz 5 — Gelir (ay 3)**
`AdSlot` bileşenine Google Ad Manager/AdSense bağlanır, `/reklam` sayfası ve doğrudan satış formu, X paylaşımı.
Kabul: Reklamlar Core Web Vitals'ı bozmaz (CLS < 0.1, LCP < 2.5 s mobil).

## 10. Hukuk ve uyum (kodda karşılığı olanlar)

- Künye sayfası: ticari unvan, adres, e-posta, telefon, hosting sağlayıcı, sorumlu müdür — Basın Kanunu internet haber sitesi yükümlülüğü.
- İçerik 2 yıl saklanır: `articles` ve `article_versions` üzerinde hard delete yok; `retracted` durumu.
- Tekzip/düzeltme: `/duzeltme-politikasi` + iletişim formundan gelen talepler admin'de "düzeltme talebi" olarak listelenir.
- Her sayfa altbilgisinde: "Yatırım tavsiyesi değildir." Ajan tavsiye dili üretemez (banned.ts).
- KVKK: bülten ve push için aydınlatma metni + açık rıza kutusu; çerez barı "Sadece zorunlu" seçeneğiyle; reklam çerezleri rıza öncesi yüklenmez.
- Reklam: "Reklam" / "Sponsorlu" etiketi zorunlu; kayan kutu ve sesli otomatik video ilk 6 ay kapalı (Better Ads Standards).
- KAP kullanım koşulları Faz 2 başında okunur; toplu ham veri dağıtımı yapılmaz.

## 11. Ölçütler (admin panosunda görünür)

- Kaynaktan yayına geçen süre (medyan, p95) — hedef: KAP < 3 dk, Resmi Gazete < 10 dk
- Otomatik yayın oranı / review'a düşen oran
- Düzeltme ve geri çekme sayısı — hedef: ayda 0
- `numericGroundingCheck` red sayısı (pipeline sağlığı)
- Index'e girme süresi (Search Console API)
- Telegram abone, push abone, bülten abone
- 30/60/90. gün hedefleri: 500 / 1.000 / 5.000 Telegram; 90. günde aylık 50.000 ziyaret

## 12. Ortam değişkenleri (`.env.example`)

```
DATABASE_URL=            REDIS_URL=
ANTHROPIC_API_KEY=       MODEL_CLASSIFY=  MODEL_WRITE=
REVIEW_THRESHOLD=4       # importance >= bu değer insan onayı ister
SITE_URL=                BOT_CONTACT_EMAIL=
VAPID_PUBLIC_KEY=        VAPID_PRIVATE_KEY=
TELEGRAM_BOT_TOKEN=      TELEGRAM_CHANNEL_ID=
INDEXNOW_KEY=            EVDS_API_KEY=
S3_ENDPOINT=  S3_BUCKET=  S3_ACCESS_KEY=  S3_SECRET_KEY=
ADMIN_USER=   ADMIN_PASSWORD=
```

## 13. Veri modeli (özet; Drizzle şeması `packages/db/src/schema.ts`)

- `sources` (id, name, official, baseUrl, scheduleCron, enabled)
- `raw_events` (id, sourceId, externalId, title, url, publishedAt, payloadHash, payload jsonb, status: new|processed|skipped, unique(sourceId, externalId, payloadHash))
- `documents` (id, rawEventId, url, mime, storageKey, textContent, extractedAt)
- `articles` (id, slug, status: draft|review|published|corrected|retracted, category, importance, title, dek, bodyMarkdown, keyFacts jsonb, tickers text[], tags text[], sourceUrl, documentId, publishedAt, updatedAt, editorNote)
- `article_versions` (id, articleId, version, snapshot jsonb, reason, createdAt)
- `companies` (kapCode pk, name, sector, slug, description)
- `company_events` (id, kapCode, rawEventId, articleId nullable, isNews, createdAt)
- `calendar_events` (id, institution, title, scheduledAt, sourceUrl, articleId nullable)
- `push_subscriptions` (id, endpoint, keys jsonb, categories text[], consentAt)
- `newsletter_subscribers` (id, email, consentAt, confirmedAt, unsubscribedAt)
- `review_queue` (id, articleId, reason, createdAt, resolvedAt, resolvedBy)
- `metrics_daily` (date, timeToPublishP50, timeToPublishP95, published, reviewed, rejected, corrections)
