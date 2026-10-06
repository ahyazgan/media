import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { eq, isNotNull } from "drizzle-orm";
import { createDb, articles, stories, type DbHandle } from "@kaynak/db";
import { seed } from "@kaynak/db/seed";
import type { RawEvent, SourceAdapter } from "@kaynak/sources";
import { ingestEvents, processPending, type Agents } from "./pipeline.js";
import { fakeAgents } from "./fakeAgents.js";
import { MemoryStore } from "./storage.js";
import { backfillStories, priorDisclosureDate, regulationBase, seriesName, threadKey } from "./story.js";

describe("dizi anahtarı (kural)", () => {
  const kap = (subject: string, codes = ["OSMEN"]) => threadKey("kap", `X — ${subject}`, { stockCodes: codes, subject });

  it("KAP: süreç/seri konuları şirket + konu anahtarı alır; genel özel durum açıklaması modele kalır", () => {
    expect(kap("Payların Geri Alınmasına İlişkin Bildirim")).toBe("kap:OSMEN:pay-geri-alim");
    expect(kap("Sermaye Artırımı - Azaltımı İşlemlerine İlişkin Bildirim")).toBe("kap:OSMEN:sermaye");
    expect(kap("Kar Payı Dağıtım İşlemlerine İlişkin Bildirim")).toBe("kap:OSMEN:kar-payi");
    expect(kap("Finansal Rapor", ["NRBNK", "NYB"])).toBe("kap:NRBNK:finansal-rapor");
    expect(kap("Özel Durum Açıklaması (Genel)")).toBeUndefined();
    expect(kap("Yeni İş İlişkisi")).toBeUndefined();
    expect(kap("Payların Geri Alınmasına İlişkin Bildirim", [])).toBeUndefined();
  });

  it("TÜİK/TCMB: dönem ve sayı ayıklanır, seri adı kalır", () => {
    expect(seriesName("tuik", "Tüketici Fiyat Endeksi, Eylül 2026")).toBe("tuketici-fiyat-endeksi");
    expect(threadKey("tuik", "Tüketici Fiyat Endeksi, Ağustos 2026", {})).toBe(threadKey("tuik", "Tüketici Fiyat Endeksi, Eylül 2026", {}));
    expect(threadKey("tuik", "Dönemsel Gayrisafi Yurt İçi Hasıla, II. Çeyrek: Nisan - Haziran, 2026", {})).toBe("tuik:donemsel-gayrisafi-yurt-ici-hasila");
    expect(threadKey("tuik", "Yurt İçi Üretici Fiyat Endeksi, Eylül 2026", {})).not.toBe(threadKey("tuik", "Tüketici Fiyat Endeksi, Eylül 2026", {}));
    expect(threadKey("tcmb", "Faiz Oranlarına İlişkin Basın Duyurusu (2026-38)", {})).toBe("tcmb:faiz-oranlarina-iliskin-basin-duyurusu");
    expect(threadKey("tcmb", "Fiyat Gelişmeleri (Şubat 2026)", {})).toBe("tcmb:fiyat-gelismeleri");
  });

  it("mevzuat: değişiklik başlığı asıl düzenlemenin adına iner; kaynaktan bağımsızdır", () => {
    const base = regulationBase("Tarım Ürünleri Lisanslı Depoculuk Yönetmeliği");
    expect(base).toBe("tarim-urunleri-lisansli-depoculuk-yonetmeligi");
    expect(regulationBase("Tarım Ürünleri Lisanslı Depoculuk Yönetmeliğinde Değişiklik Yapılmasına Dair Yönetmelik")).toBe(base);
    expect(regulationBase("Çevre Yönetimi Hizmetleri Hakkında Yönetmelikte Değişiklik Yapılmasına Dair Yönetmelik")).toBe(regulationBase("Çevre Yönetimi Hizmetleri Hakkında Yönetmelik"));
    expect(regulationBase("Gelir Vergisi Genel Tebliği (Seri No: 312)'nde Değişiklik Yapılmasına Dair Tebliğ (Seri No: 330)")).toBe("gelir-vergisi-genel-tebligi-seri-no-312");
    expect(regulationBase("KOSGEB Disiplin Yönetmeliğinin Yürürlükten Kaldırılmasına Dair Yönetmelik")).toBe("kosgeb-disiplin-yonetmeligi");
    expect(regulationBase("Kıymetli Madenler Tebliğinde Değişiklik Yapılmasına Dair Tebliğ")).toBe(regulationBase("Kıymetli Madenler Tebliği"));
    expect(threadKey("bddk", "Kredi Kartı İşlemleri Yönetmeliğinde Değişiklik Yapılmasına Dair Yönetmelik", {}))
      .toBe(threadKey("resmi-gazete", "Kredi Kartı İşlemleri Yönetmeliğinde Değişiklik Yapılmasına Dair Yönetmelik", {}));
    expect(regulationBase("Anayasa Mahkemesinin 2/7/2026 Tarihli ve 2023/31244 Başvuru Numaralı Kararı")).toBeUndefined();
    expect(threadKey("spk", "SPK Bülteni 2026/68", {})).toBeUndefined();
  });

  it("KAP formundaki önceki açıklama tarihi okunur", () => {
    expect(priorDisclosureDate("Konuya İlişkin Daha Önce Yapılan Açıklamanın Tarihi | 12.09.2026\nYapılan")).toBe("2026-09-12");
    expect(priorDisclosureDate("Konuya İlişkin Daha Önce Yapılan Açıklamanın Tarihi\n03/10/2026")).toBe("2026-10-03");
    expect(priorDisclosureDate("Konuya İlişkin Daha Önce Yapılan Açıklamanın Tarihi: 12.08.2026")).toBe("2026-08-12");
    expect(priorDisclosureDate("Konuya İlişkin Daha Önce Yapılan Açıklamanın Tarihi12.08.2026")).toBe("2026-08-12");
    expect(priorDisclosureDate("Konuya İlişkin Daha Önce Yapılan Açıklamanın Tarihi | -")).toBeUndefined();
  });
});

// --- Uçtan uca: aynı şirketin bildirimleri diziye girer, yazar arka plan alır ---

const CO = { code: "ORNEK", name: "ÖRNEK ENERJİ A.Ş." };
const filler = "Şirketimiz Örnek Enerji yatırımcılarını düzenli olarak bilgilendirmeye devam etmektedir ve açıklama kamuya duyurulmuştur. "
  + "Bu bildirim Sermaye Piyasası Kurulu düzenlemeleri çerçevesinde hazırlanmış olup şirket internet sitesinde de yayımlanmaktadır. "
  + "Yönetim kurulumuz konuyla ilgili gelişmeleri yakından takip etmekte ve gerekli tüm adımları zamanında atmaktadır. ";
const docs: Record<string, string> = {
  "9001": `Örnek Enerji payların geri alınmasına ilişkin program kapsamında işlem yapmıştır. Şirketimiz 01.10.2026 tarihinde Borsa İstanbul'da toplam 48.313 TL nominal tutarlı pay geri almıştır. Geri alınan payların sermayeye oranı %0,01204 seviyesindedir. ${filler}`,
  "9002": `Örnek Enerji payların geri alınmasına ilişkin program kapsamında yeni işlem yapmıştır. Şirketimiz 02.10.2026 tarihinde Borsa İstanbul'da toplam 70.000 TL nominal tutarlı pay geri almıştır. Geri alınan payların sermayeye oranı %0,01744 seviyesindedir. ${filler}`,
  "9003": `Örnek Enerji rüzgar santrali yatırımı için Kuzey Türbin firmasıyla türbin tedarik sözleşmesi imzalamıştır. Sözleşme kapsamında toplam 12 adet türbin teslim alınacaktır. Teslimatların 2027 yılı içinde tamamlanması planlanmaktadır. ${filler}`,
  "9004": `Örnek Enerji şirket merkezi için yeni bir ofis kiralama sözleşmesi imzalamıştır. Kiralama süresi 5 yıl olarak belirlenmiştir. Taşınma işlemlerinin kısa sürede tamamlanması öngörülmektedir. ${filler}`,
  "9005": `Konuya İlişkin Daha Önce Yapılan Açıklamanın Tarihi | 03.10.2026\nÖrnek Enerji türbin tedarik sözleşmesi kapsamındaki ilk teslimatı almıştır. Teslim alınan türbin sayısı 4 adettir. Kalan türbinlerin teslimatı sürmektedir. ${filler}`,
  "9006": `Konuya İlişkin Daha Önce Yapılan Açıklamanın Tarihi | 05.10.2026\nÖrnek Enerji türbin tedarik sözleşmesi kapsamındaki ikinci teslimatı almıştır. Teslim alınan türbin sayısı 8 adettir. Teslimatlar tamamlanmıştır. ${filler}`,
};
const ev = (id: string, subject: string, at: string): RawEvent => ({
  sourceId: "kap", externalId: id, title: `${CO.name} — ${subject}`, url: `https://www.kap.org.tr/tr/Bildirim/${id}`,
  publishedAt: new Date(at), payloadHash: id, payload: { companies: [CO], stockCodes: [CO.code], subject, companyName: CO.name },
});
const adapter: SourceAdapter = {
  id: "kap", official: true, schedule: () => ({ intervals: [], defaultSeconds: 60 }) as never, fetchNew: async () => [],
  async fetchDocument(e: RawEvent) { return { url: e.url, mime: "text/html", bytes: Buffer.from(`<html><body><p>${docs[e.externalId]}</p></body></html>`) }; },
};

let h: DbHandle;
const writes: Parameters<Agents["write"]>[0][] = [];
const relateCalls: number[] = [];
const agents: Agents = {
  ...fakeAgents,
  async write(input) { writes.push(input); return fakeAgents.write(input); },
  // Model yerine: belge türbinden söz ediyorsa türbin haberini seçer
  async relate(input) {
    relateCalls.push(input.candidates.length);
    const i = /türbin/i.test(input.textHead) ? input.candidates.findIndex((c) => /türbin/i.test(c.dek)) : -1;
    return { match: i + 1, reason: "test" };
  },
};
const deps = () => ({ db: h.db, agents, store: new MemoryStore(), reviewThreshold: 5 });
const run = async (...events: RawEvent[]) => { await ingestEvents(h.db, events); return processPending(deps(), adapter); };
const byExt = async (id: string) => (await h.db.select().from(articles)).find((a) => a.sourceUrl.endsWith(`/${id}`))!;

beforeAll(async () => { h = await createDb("pglite://memory"); await h.migrate(); await seed(h.db); });
afterAll(async () => { await h.close(); });

describe("konu dizisi uçtan uca (KAP)", () => {
  it("ilk pay geri alım bildirimi anahtarlı dizi başlatır; yazara arka plan gitmez", async () => {
    const [o] = await run(ev("9001", "Payların Geri Alınmasına İlişkin Bildirim", "2026-10-01T15:00:00Z"));
    expect(o!.kind).toBe("published");
    expect(writes.at(-1)!.background).toBeUndefined();
    const a = await byExt("9001");
    const [s] = await h.db.select().from(stories).where(eq(stories.id, a.storyId!));
    expect(s!.key).toBe("kap:ORNEK:pay-geri-alim");
  });

  it("ertesi günkü bildirim aynı diziye girer; yazar önceki haberi arka plan olarak alır, arka plandaki sayı gövdede kabul edilir", async () => {
    const [o] = await run(ev("9002", "Payların Geri Alınmasına İlişkin Bildirim", "2026-10-02T15:00:00Z"));
    expect(o!.kind).toBe("published");
    const [first, second] = [await byExt("9001"), await byExt("9002")];
    expect(second.storyId).toBe(first.storyId);
    const bg = writes.at(-1)!.background!;
    expect(bg).toHaveLength(1);
    expect(bg[0]!.title).toBe(first.title);
    expect(bg[0]!.date).toBe("1 Ekim 2026");
    // 48.313 yalnızca önceki belgede geçer: sahte yazar onu son paragrafa koydu, kural motoru arka plandan doğruladı
    expect(second.bodyMarkdown).toContain("48.313");
    expect(relateCalls).toEqual([]); // kural yetti, model çağrılmadı
  });

  it("aynı şirketin ilgisiz bildirimi diziye girmez (model adaylara baktı, eşleştirmedi)", async () => {
    await run(ev("9003", "Özel Durum Açıklaması (Genel)", "2026-10-03T09:00:00Z"));
    await run(ev("9004", "Özel Durum Açıklaması (Genel)", "2026-10-03T12:00:00Z"));
    expect(relateCalls).toEqual([2, 3]);
    expect((await byExt("9003")).storyId).toBeNull();
    expect((await byExt("9004")).storyId).toBeNull();
  });

  it("KAP formundaki önceki açıklama tarihinde birden çok haber varsa model yalnızca o günün haberleri arasından seçer", async () => {
    await run(ev("9005", "Özel Durum Açıklaması (Genel)", "2026-10-05T09:00:00Z"));
    expect(relateCalls).toEqual([2, 3, 2]); // 3 Ekim'in iki haberi: kiralama ve türbin
    const [a3, a4, a5] = [await byExt("9003"), await byExt("9004"), await byExt("9005")];
    expect(a5.storyId).not.toBeNull();
    expect(a3.storyId).toBe(a5.storyId);
    expect(a4.storyId).toBeNull();
    // Model eşleştirmesiyle kurulan dizi anahtarsızdır (genel özel durum açıklaması)
    const [s] = await h.db.select().from(stories).where(eq(stories.id, a5.storyId!));
    expect(s!.key).toBeNull();
    expect(writes.at(-1)!.background?.[0]?.title).toBe(a3.title);
  });

  it("o gün tek haber varsa model sorulmadan bağlanır; arka plan dizinin yayındaki haberleri (yeniden eskiye)", async () => {
    await run(ev("9006", "Özel Durum Açıklaması (Genel)", "2026-10-07T09:00:00Z"));
    expect(relateCalls).toEqual([2, 3, 2]);
    const [a3, a5, a6] = [await byExt("9003"), await byExt("9005"), await byExt("9006")];
    expect(a6.storyId).toBe(a3.storyId);
    expect(writes.at(-1)!.background!.map((b) => b.title)).toEqual([a5.title, a3.title]);
    const linked = await h.db.select().from(articles).where(isNotNull(articles.storyId));
    expect(linked).toHaveLength(5);
  });

  it("geriye dönük kurulum yalnızca kuralla bağlar (model yok): anahtar ve tek adaylı önceki açıklama tarihi", async () => {
    await h.db.update(articles).set({ storyId: null });
    const r = await backfillStories(h.db);
    expect(r).toEqual({ scanned: 6, linked: 4 });
    const [a1, a2, a5, a6] = await Promise.all(["9001", "9002", "9005", "9006"].map(byExt));
    expect(a2!.storyId).toBe(a1!.storyId);
    expect(a6!.storyId).toBe(a5!.storyId); // 9005'in tarihi (3 Ekim) iki adaya denk geliyor: modelsiz bağlanmaz, 9006 → 9005 bağlanır
    expect((await byExt("9003")).storyId).toBeNull();
    expect(relateCalls).toEqual([2, 3, 2]);
  });
});
