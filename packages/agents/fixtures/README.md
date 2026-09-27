# Altın örnekler (fixtures)

`<kaynak>/NN-slug/` altında her örnek:

- `document.txt` — kaynak belgenin düz metni
- `event.json` — adapter'ın üreteceği `RawEvent` alanları
- `expected.json` — sınıflandırma beklentileri (`category` kabul listesi, `importanceMin/Max`, `isNews` ya da `null`=her ikisi kabul), `mustGround` (yazıda geçmesi muhtemel ve belgede bulunması gereken sayılar), `mustNotContain`

## resmi-gazete/

Gerçek Resmi Gazete metinleri (Exa okuyucu üzerinden alındı, Türkçe karakterler doğrulandı).
`99-broken-numbers/article.json` bilerek bozulmuş bir makaledir; kural motoru bunu **reddetmek zorundadır** (Faz 1 kabul kriteri).

## kap/

**Sentetik** belgeler: ÖRNEK ENERJİ, DEMO HOLDİNG ve MİSAL GIDA gerçek şirket değildir; tutarlar uydurmadır
(`event.json` içinde `"synthetic": true`). Geliştirme ortamından kap.org.tr'ye erişilemediği için gerçek KAP bildirim
sayfası biçimi (özet bilgi, güncelleme/düzeltme soruları, açıklamalar, sorumluluk beyanı) elle yeniden üretildi.
Gerçek kopyalarla değiştirmek için:

1. `pnpm --filter @kaynak/sources capture:kap` → `packages/sources/fixtures/kap-disclosures-<tarih>.json`
2. Listeden seçtiğin bildirimlerin sayfasını (`https://www.kap.org.tr/tr/Bildirim/<no>`) indirip `documentToText` ile metne çevir, `document.txt` olarak kaydet; `event.json`/`expected.json`'u güncelle.
3. `LIVE=1 pnpm test:agents` ile canlı modelde doğrula.

Rutin bildirim örneği (`06-genel-bilgi-formu`) `isNews=false` beklentisi taşır: şirket sayfasında bildirim geçmişinde görünür, haber olmaz.

## tcmb/ ve tuik/

**Sentetik** belgeler: gerçek TCMB/TÜİK bültenlerinin biçimi (sayı, tarih, başlık cümlesi, alt gruplar) yeniden üretilmiş,
oranlar ve tutarlar uydurmadır (`"synthetic": true`). Kurumlar gerçektir ama içerik gerçek bir yayına karşılık gelmez;
canlı testten önce gerçek bültenlerle değiştirin (bülten sayfası → `documentToText` → `document.txt`). TCMB "tahmin edilmiştir" ve
TÜİK "tahmin edildi" ifadeleri kurumun resmi dilidir; yazar ajanının yasaklı kalıp listesi yalnızca haberin kendi cümlelerine uygulanır.

## Testler

- `pnpm test:agents` → çevrimdışı testler her zaman koşar (kural motoru, bozuk fixture reddi, fixture bütünlüğü; her kaynak için en az 5 örnek).
- `LIVE=1 ANTHROPIC_API_KEY=... pnpm test:agents` → her fixture için gerçek classify + write çağrısı yapılır ve çıktı `expected.json` + kural motoruna karşı doğrulanır. Yeni prompt değişikliği bu test geçmeden merge edilmez.

## Canlı değerlendirme (`pnpm eval:agents`)

Testlerden ayrı, rapor üreten bir düzenek. Her fixture'ı gerçek modelden geçirir, sınıflandırmayı `expected.json` ile karşılaştırır, haberi kural motorundan geçirir ve maliyet ile gecikmeyi ölçer.

```bash
pnpm eval:agents                              # tüm fixture'lar, gerçek model (kök .env'de ANTHROPIC_API_KEY)
pnpm eval:agents -- --dry                     # anahtarsız: düzeneğin kendisini sınar
pnpm eval:agents -- --source kap --only 03 --repeat 3   # tek örneği 3 kez: kararlılık
pnpm eval:agents -- --write-all               # isNews=false çıksa da yaz
MODEL_WRITE=claude-opus-5 pnpm eval:agents    # başka modelle karşılaştır
```

Rapor `packages/agents/eval-results/<zaman>-<mod>.md` (ve `.json`) olarak yazılır; bu klasör git'e girmez.

| İşaret | Anlamı |
|---|---|
| ✅ geçti | Sınıflandırma beklentiye uydu, haber kural motorundan temiz geçti |
| ⚠️ uyarı | Kalite kuralı takıldı (uzunluk, başlık, alıntı) ya da yasaklı kalıp yüzünden yeniden yazıldı; üretimde inceleme kuyruğuna düşerdi |
| ❌ kaldı | Kategori, önem ya da isNews sapması; sayısal doğrulama reddi; yasak ifade; çağrı hatası |

Kalan varsa çıkış kodu 1'dir (`--no-fail` ile 0). Önem kapısı (`REVIEW_THRESHOLD`) burada devre dışıdır; yalnızca kalite ölçülür. Bir tam koşu 22 fixture ile birkaç on sentlik maliyettedir; rapordaki gerçek tutara bakın.
