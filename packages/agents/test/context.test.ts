import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runEditRules } from "../src/edit/rules.js";
import { formatBackground } from "../src/prompts.js";
import { hasApiKey } from "../src/client.js";
import type { BackgroundItem, ClassifyOutput, RelateInput } from "../src/schemas.js";

/**
 * Konu dizisi — canlı model (LIVE=1): yazar arka planı yalnızca ilgiliyse son paragrafta kullanır; eşleştirici aynı olayın devamını
 * ayrı olaydan ayırır. Belgeler sentetik (ÖRNEK ENERJİ gerçek bir şirket değildir).
 */
const FIX = new URL("../fixtures/kap/01-pay-geri-alim/", import.meta.url);
const doc = readFileSync(new URL("document.txt", FIX), "utf8");
const event = JSON.parse(readFileSync(new URL("event.json", FIX), "utf8")) as { title: string; url: string; sourceName: string; publishedAt: string };
const cls: ClassifyOutput = {
  category: "borsa", importance: 3, isNews: true, summaryHint: "Pay geri alım programı kapsamında yeni işlem.",
  entities: { companies: ["ÖRNEK ENERJİ A.Ş."], tickers: ["ORNEK"], institutions: [] },
};
const firstParagraph = (md: string) => md.trim().split(/\n\s*\n/)[0] ?? "";

const live = process.env.LIVE === "1" && hasApiKey();
describe.skipIf(!live)("konu dizisi — canlı model (LIVE=1)", () => {
  const writeWith = async (background: BackgroundItem[]) => {
    const { write } = await import("../src/write.js");
    const draft = await write({
      sourceId: "kap", sourceName: event.sourceName, sourceUrl: event.url, title: event.title, documentText: doc,
      publishedAt: event.publishedAt, classify: cls, stockCodes: ["ORNEK"], background,
    });
    const edit = runEditRules(draft, doc, { importance: 3, reviewThreshold: 5, contextText: formatBackground(background) });
    return { draft, edit };
  };

  it("ilgili arka plan: başlık/dek/ilk paragraf yalnızca belgeden; arka plan sayısı kullanılırsa son paragrafta", async () => {
    const { draft, edit } = await writeWith([{
      date: "18 Eylül 2026", title: "Örnek Enerji 300.000 adet pay geri aldı",
      dek: "Şirket pay geri alım programı kapsamında 18.09.2026'da 300.000 adet payı 40,10–40,90 TL fiyat aralığından geri aldı.",
      facts: ["Program kapsamında geri alınan toplam pay 1.500.000 adede ulaştı."],
    }]);
    expect(edit.decision, edit.reasons.join(" | ")).not.toBe("reject");
    expect(edit.reasons.join(" ")).not.toMatch(/arka plan:/);
    for (const s of [draft.title, draft.dek, firstParagraph(draft.bodyMarkdown)]) expect(s).not.toMatch(/300\.000|40,10|40,90|1\.500\.000/);
  }, 120_000);

  it("ilgisiz arka plan (aynı şirketin başka olayı) kullanılmaz", async () => {
    const { draft, edit } = await writeWith([{
      date: "3 Eylül 2026", title: "Örnek Enerji Kuzey Türbin ile 45 milyon euroluk türbin sözleşmesi imzaladı",
      dek: "Sözleşme kapsamında 12 adet rüzgar türbini 2027 yılı içinde teslim edilecek.",
      facts: [],
    }]);
    expect(edit.decision, edit.reasons.join(" | ")).not.toBe("reject");
    expect(`${draft.title}\n${draft.dek}\n${draft.bodyMarkdown}`).not.toMatch(/türbin|45 milyon|Kuzey/i);
  }, 120_000);

  const relateCases: [string, RelateInput, number][] = [
    ["aynı sözleşmenin teslimatı, aynı gün başka sözleşme de var → türbin haberi", {
      sourceId: "kap", title: "ÖRNEK ENERJİ A.Ş. — Özel Durum Açıklaması (Genel)",
      textHead: "Açıklamalar\nŞirketimizin Kuzey Türbin A.Ş. ile 03.10.2026 tarihinde imzaladığı türbin tedarik sözleşmesi kapsamındaki ilk teslimat gerçekleşmiş, 4 adet türbin teslim alınmıştır. Kalan 8 türbinin teslimatı sürmektedir.",
      candidates: [
        { date: "3 Ekim 2026", title: "Örnek Enerji merkez ofisi için 5 yıllık kira sözleşmesi imzaladı", dek: "Şirket İstanbul'daki yeni genel müdürlük binası için kiralama sözleşmesi imzaladı." },
        { date: "3 Ekim 2026", title: "Örnek Enerji Kuzey Türbin ile 12 türbinlik tedarik sözleşmesi imzaladı", dek: "Sözleşme kapsamında 12 adet türbin 2027 yılı içinde teslim alınacak." },
      ],
    }, 2],
    ["aynı şirketin başka karşı taraflı sözleşmesi → bağlanmaz", {
      sourceId: "kap", title: "ÖRNEK ENERJİ A.Ş. — Yeni İş İlişkisi",
      textHead: "Açıklamalar\nŞirketimiz ile Doğu Elektrik Dağıtım A.Ş. arasında 24 ay süreli trafo bakım ve onarım hizmet sözleşmesi imzalanmıştır. Sözleşme bedeli 18.400.000 TL'dir.",
      candidates: [
        { date: "3 Ekim 2026", title: "Örnek Enerji Kuzey Türbin ile 12 türbinlik tedarik sözleşmesi imzaladı", dek: "Sözleşme kapsamında 12 adet türbin 2027 yılı içinde teslim alınacak." },
      ],
    }, 0],
    ["pay geri alım işlemi → programı başlatan karar", {
      sourceId: "kap", title: event.title, textHead: doc.slice(0, 1500),
      candidates: [
        { date: "20 Ağustos 2026", title: "Örnek Enerji olağan genel kurulunu 15 Eylül'de yapacak", dek: "Genel kurul gündeminde kâr payı dağıtımı ve yönetim kurulu seçimi yer alıyor." },
        { date: "12 Ağustos 2026", title: "Örnek Enerji 500 milyon TL'lik pay geri alım programı başlattı", dek: "Yönetim kurulu 12.08.2026'da üç yıl süreli pay geri alım programını onayladı." },
      ],
    }, 2],
  ];
  it.each(relateCases)("relate: %s", async (_name, input, expected) => {
    const { relate } = await import("../src/relate.js");
    const r = await relate(input);
    expect(r.match, r.reason).toBe(expected);
  }, 60_000);
});
