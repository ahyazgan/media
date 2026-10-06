# Anlam doğrulaması — gerçek KAP örnekleri

`pnpm test:agents` (LIVE=1) içinde `test/verify.test.ts` bu klasörü kullanır. Belgeler gerçek KAP bildirimlerinin PDF dökümünden
çıkarılan metinlerdir (6 Ekim 2026, yerel deneme sunucusu); haberler yazar ajanının o gün ürettiği metinlerdir.

- `expect: "temiz"`: haber belgeyle uyumlu. Denetçi ilk sürümde bunların hepsinde yanlış alarm verdi (geri aldı ↔ satın aldı,
  TL nominal ↔ adet, tablo sütunlarını kaydırma, kendi açıklamasında "sorun yok" dediği bulgu). Bağımsız inceleme: 16 bulgunun 14'ü yanlış.
- `expect: "hata"`: haberde gerçek hata var (`note`).
