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

## Testler

- `pnpm test:agents` → çevrimdışı testler her zaman koşar (kural motoru, bozuk fixture reddi, fixture bütünlüğü; her kaynak için en az 5 örnek).
- `LIVE=1 ANTHROPIC_API_KEY=... pnpm test:agents` → her fixture için gerçek classify + write çağrısı yapılır ve çıktı `expected.json` + kural motoruna karşı doğrulanır. Yeni prompt değişikliği bu test geçmeden merge edilmez.
