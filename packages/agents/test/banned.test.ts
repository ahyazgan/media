import { describe, expect, it } from "vitest";
import { findBanned } from "../src/edit/banned.js";

describe("bannedPhrases", () => {
  it.each([
    ["Faiz indirimi bekleniyor", "bekleniyor"],
    ["Karar piyasaları etkileyebilir; olabilir", "olabilir"],
    ["Uzmanlara göre bu adım önemli", "uzmanlara-gore"],
    ["Hisse için hedef fiyat 120 TL", "hedef-fiyat"],
    ["Yatırımcılar için alım fırsatı", "al-sat"],
    ["Şok karar Resmi Gazete'de", "sok"],
    ["Dev adım atıldı", "dev"],
    ["Analistlere göre enflasyon düşer", "uzmanlara-gore"],
  ])("yakalar: %s", (text, id) => {
    const hits = findBanned({ body: text });
    expect(hits.map((h) => h.id)).toContain(id);
  });

  it.each([
    "Ticaret Bakanlığı yönetmeliği değiştirdi; düzenleme 1 Ekim 2025'te yürürlüğe giriyor.",
    "Kurul, muafiyet süresini 1 Ocak 2027'ye kadar uzattı.",
    "Tebliğe göre pay defterinin elektronik ortamda tutulması zorunlu hale geldi.",
    "Belgede bekleme süresi altı ay olarak belirlendi.", // 'bekleme' ≠ 'bekleniyor'
    "Devlet İç Borçlanma Senetleri günlük değerleri yayımlandı.", // 'Devlet' ≠ 'dev adım'
  ])("temiz metni geçirir: %s", (text) => {
    expect(findBanned({ body: text })).toEqual([]);
  });
});
