# Altın örnekler (fixtures)

`resmi-gazete/NN-slug/` altında her örnek:

- `document.txt` — kaynak belgenin düz metni (gerçek Resmi Gazete metinleri; Exa okuyucu üzerinden alındı, Türkçe karakterler doğrulandı)
- `event.json` — adapter'ın üreteceği `RawEvent` alanları
- `expected.json` — sınıflandırma beklentileri (`category` kabul listesi, `importanceMin/Max`, `isNews` ya da `null`=her ikisi kabul), `mustGround` (yazıda geçmesi muhtemel ve belgede bulunması gereken sayılar), `mustNotContain`

`99-broken-numbers/article.json` bilerek bozulmuş bir makaledir; kural motoru bunu **reddetmek zorundadır** (Faz 1 kabul kriteri).

## Testler

- `pnpm test:agents` → çevrimdışı testler her zaman koşar (kural motoru, bozuk fixture reddi, fixture bütünlüğü).
- `LIVE=1 ANTHROPIC_API_KEY=... pnpm test:agents` → her fixture için gerçek classify + write çağrısı yapılır ve çıktı `expected.json` + kural motoruna karşı doğrulanır. Yeni prompt değişikliği bu test geçmeden merge edilmez.
