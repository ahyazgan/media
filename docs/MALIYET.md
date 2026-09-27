# Model maliyeti tahmini

**Özet:** Açılışta yalnızca Resmi Gazete açıkken model faturası ayda birkaç dolardır. KAP açılınca maliyetin neredeyse tamamı KAP'tan gelir ve tipik senaryoda ayda 100 doların biraz üstüne çıkar. Bu rakamlar **tahmindir**: token sayıları karakterden türetildi, hacimler varsayımdır. Kesinleştirmek için aşağıdaki iki ölçüm yapılmalıdır.

Sunucu ve alan adı giderleri bu hesaba dahil değildir (bkz. [DAGITIM.md](DAGITIM.md)).

## Hesap

Yeniden üretmek için: `pnpm cost:estimate`. Kullanılan modeller ve fiyatlar `.env`'deki `MODEL_CLASSIFY` / `MODEL_WRITE` ile `packages/agents/src/eval/pricing.ts` tablosundan okunur.

Modeller: classify=claude-haiku-4-5 ($1/$5 MTok) · write=claude-sonnet-5 ($2/$10 MTok)

### Açılış: yalnızca Resmi Gazete

| Senaryo | Kaynak | classify | yazım | Aylık |
|---|---|---|---|---|
| düşük | resmi-gazete | 240 çağrı · $0.74 | 96 haber · $1.62 | $2.36 |
| **düşük** | **toplam** | | | **$2.36** |
| tipik | resmi-gazete | 450 çağrı · $1.38 | 180 haber · $4.91 | $6.29 |
| **tipik** | **toplam** | | | **$6.29** |
| yüksek | resmi-gazete | 750 çağrı · $2.30 | 300 haber · $17 | $19 |
| **yüksek** | **toplam** | | | **$19** |

Çağrı başına maliyet:
- düşük: classify $0.0031 · yazılan haber $0.0169 (tahmin: kısa belge, az düşünme)
- tipik: classify $0.0031 · yazılan haber $0.0273 (tahmin: 4 bin karakter belge, çıktı+düşünme 2 bin token)
- yüksek: classify $0.0031 · yazılan haber $0.0568 (tahmin: uzun mevzuat, yoğun düşünme)

### Resmi Gazete + KAP + TCMB/TÜİK

| Senaryo | Kaynak | classify | yazım | Aylık |
|---|---|---|---|---|
| düşük | resmi-gazete | 240 çağrı · $0.74 | 96 haber · $1.62 | $2.36 |
| düşük | kap | 3300 çağrı · $10 | 1650 haber · $28 | $38 |
| düşük | tcmb+tuik | 44 çağrı · $0.14 | 35 haber · $0.59 | $0.73 |
| **düşük** | **toplam** | | | **$41** |
| tipik | resmi-gazete | 450 çağrı · $1.38 | 180 haber · $4.91 | $6.29 |
| tipik | kap | 6600 çağrı · $20 | 3300 haber · $90 | $110 |
| tipik | tcmb+tuik | 66 çağrı · $0.20 | 53 haber · $1.45 | $1.65 |
| **tipik** | **toplam** | | | **$118** |
| yüksek | resmi-gazete | 750 çağrı · $2.30 | 300 haber · $17 | $19 |
| yüksek | kap | 13200 çağrı · $41 | 6600 haber · $375 | $416 |
| yüksek | tcmb+tuik | 110 çağrı · $0.34 | 88 haber · $5.00 | $5.34 |
| **yüksek** | **toplam** | | | **$440** |

Çağrı başına maliyet:
- düşük: classify $0.0031 · yazılan haber $0.0169 (tahmin: kısa belge, az düşünme)
- tipik: classify $0.0031 · yazılan haber $0.0273 (tahmin: 4 bin karakter belge, çıktı+düşünme 2 bin token)
- yüksek: classify $0.0031 · yazılan haber $0.0568 (tahmin: uzun mevzuat, yoğun düşünme)

## Varsayımlar

| Varsayım | Değer | Neden |
|---|---|---|
| Token / karakter | 2,7 karakter = 1 token | Türkçe metin İngilizceden fazla token tutar; kaba ortalama |
| classify girdisi | sistem prompt'u (3,4 bin karakter) + başlık + belgenin ilk 2 bin karakteri | `classify.ts` belge başını 2 bin karakterle keser |
| Yazım girdisi | sistem prompt'u (2,1 bin karakter) + belge (en çok 60 bin karakter) | `write.ts` uzun belgeyi keser |
| Yazım çıktısı | 1,2 / 2 / 3,5 bin token | JSON gövde + alıntılar + **Sonnet 5'in düşünme token'ları** (varsayılan açık, çıkış fiyatından faturalanır) |
| Yeniden yazım | %10 | Yasaklı kalıp yüzünden ikinci deneme |
| Resmi Gazete hacmi | günde 8 / 15 / 25 madde, %40'ı haber | İlan bölümü süzülür; üniversite ve personel yönetmelikleri haber sayılmaz |
| KAP hacmi | iş gününde 150 / 300 / 600 bildirim, %50'si haber | Yalnızca ODA, FR, DG sınıfları ve borsa kodu olanlar; ayda 22 iş günü |
| Önbellek | yok | Sistem prompt'ları modellerin asgari önbellek boyutunun altında |

KAP hacmi en belirsiz varsayımdır ve toplamı en çok o belirler.

## Kesinleştirme

1. **Çağrı başı maliyet (API anahtarı gelince):** `pnpm eval:agents`, ardından `pnpm cost:estimate -- --from-eval latest`. Karakter tahmini yerine 22 fixture'ın gerçek token kullanımı kullanılır; düşünme token'ları da ölçüme girer.
2. **Hacim (site birkaç hafta çalışınca):** son 30 günün gerçek sayıları:
   ```sql
   select source_id,
          round(count(*)::numeric / 30, 1)                          as gunluk_olay,
          round(avg((status = 'processed')::int)::numeric, 2)       as haber_orani
   from raw_events
   where created_at > now() - interval '30 days'
   group by source_id;
   ```
   Sonra: `pnpm cost:estimate -- --rg <gunluk> --kap <gunluk × 30 / 22> --news-rg <oran> --news-kap <oran>`.

## Maliyeti düşürme seçenekleri

Etki büyüklüğüne göre sıralı. Hepsi kaliteyi etkileyebilir; uygulamadan önce `pnpm eval:agents` ile ölçün.

1. **Yazımda düşünme derinliğini azaltmak.** Sonnet 5'te düşünme varsayılan olarak açık. Kısa, belgeye bağlı haber metni için `effort: "low"` ya da `"medium"` yeterli olabilir. Çıktı token'ı en pahalı kalem olduğu için tipik senaryoda en büyük kazanç buradadır.
2. **KAP'ta kurala dayalı ön süzgeç.** Rutin bildirim türleri (ör. genel bilgi formu güncellemesi) hiç modele gitmeden atlanabilir. KAP classify çağrılarının bir kısmını ve buna bağlı yazımları siler.
3. **Düşük önemli KAP haberlerini küçük modelle yazmak.** Önemi 1–2 olan bildirimleri Haiku ile yazmak; kalite kaybı eval'de görülmeli.
4. **KAP belgelerini kısaltmak.** Finansal rapor bildirimleri uzun olabilir; KAP için belge sınırını 60 binden daha aşağı çekmek.

Toplu işleme (Batch API, %50 indirim) bu projeye uygun değil: şartname KAP bildirimini 3 dakikada yayımlamayı istiyor, toplu işlem saatler sürebilir.
