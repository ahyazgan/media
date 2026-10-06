import type { Agents } from "./pipeline.js";
import { extractNumbers } from "@kaynak/agents";

/**
 * Modelsiz sahte ajanlar: kuru çalıştırma ve testler için. Yalnızca belgeden kopyalanan cümleleri
 * kullanır, böylece numericGroundingCheck'ten geçer. Gerçek haber kalitesi beklenmez.
 */
/** KAP'ta rutin sayılan bildirim konuları (isNews=false): adres/unvan/iletişim, genel bilgi formu, imza sirküleri vb. */
const KAP_ROUTINE = /genel bilgi formu|adres değişikliği|iletişim bilgi|unvan değişikliği|imza sirküleri|bağımsız denetim kuruluşu|kayıtlı sermaye tavanı|tescil/;
const KAP_HIGH = /sermaye artırımı|birleşme|bölünme|kâr payı|temettü|halka arz|pay geri alım|geri alınması/;

export const fakeAgents: Agents = {
  async classify({ sourceId, title }) {
    const t = title.toLocaleLowerCase("tr");
    if (sourceId === "kap") {
      const routine = KAP_ROUTINE.test(t);
      return {
        category: "borsa", importance: routine ? 1 : KAP_HIGH.test(t) ? 4 : 3,
        entities: { companies: [], tickers: [], institutions: [] },
        isNews: !routine,
        summaryHint: "Sahte ajan: KAP bildirimi.",
      };
    }
    if (sourceId === "tcmb" || sourceId === "tuik") {
      const high = /faiz|para politikası kurulu|tüketici fiyat|enflasyon/.test(t);
      return {
        category: "makro", importance: high ? 5 : /gayrisafi|işgücü|işsizlik|dış ticaret/.test(t) ? 4 : 3,
        entities: { companies: [], tickers: [], institutions: [sourceId === "tcmb" ? "TCMB" : "TÜİK"] },
        isNews: true, summaryHint: "Sahte ajan: makro veri.",
      };
    }
    const LISTING: Record<string, "borsa" | "bankacilik" | "enerji"> = { spk: "borsa", bddk: "bankacilik", epdk: "enerji", botas: "enerji" };
    if (LISTING[sourceId]) {
      return {
        category: LISTING[sourceId]!, importance: /tarife|faiz|kurul karar|bülten/.test(t) ? 3 : 2,
        entities: { companies: [], tickers: [], institutions: [sourceId.toUpperCase()] },
        isNews: !/ihale|personel|sınav|iletişim/.test(t), summaryHint: "Sahte ajan: kurum duyurusu.",
      };
    }
    const isUni = /üniversite/.test(t);
    return {
      category: "mevzuat", importance: isUni ? 2 : 3,
      entities: { companies: [], tickers: [], institutions: [] },
      isNews: !isUni,
      summaryHint: "Sahte ajan: belgeden özet.",
    };
  },
  async write({ sourceId, title, documentText, sourceName, background }) {
    const sentences = documentText.split(/(?<=\.)\s+/).map((s) => s.replace(/\s+/g, " ").trim()).filter((s) => s.length > 40 && s.length < 400);
    const picked = sentences.slice(0, 8);
    const body = [`${sourceName} kaynaklı belge yayımlandı: ${title}.`, ...picked].join("\n\n");
    // 120 kelime altına düşmesin diye belge cümleleri tekrarlanmaz; yeterli değilse tamamı eklenir
    const main = body.split(/\s+/).length >= 120 ? body : [body, ...sentences.slice(8, 20)].join("\n\n");
    // Arka plan verildiyse son paragrafta, tarihiyle (canlı yazarın 15. kuralı gibi)
    const bodyMarkdown = background?.[0] ? `${main}\n\n${background[0].date} tarihli haberimizde: ${background[0].dek}` : main;
    const firstQuote = picked[0] ?? sentences[0] ?? documentText.slice(0, 120);
    return {
      title: title.length > 70 ? title.slice(0, 67).replace(/\s+\S*$/, "") : title,
      dek: picked[1] ?? firstQuote,
      bodyMarkdown,
      keyFacts: [{ text: firstQuote, quoteFromSource: firstQuote }],
      tickers: [], tags: sourceId === "kap" ? ["kap", "borsa"] : sourceId === "tcmb" || sourceId === "tuik" ? [sourceId, "makro"] : ["spk", "bddk", "epdk", "botas"].includes(sourceId) ? [sourceId, "duyuru"] : ["resmi-gazete", "mevzuat"],
      numbersUsed: extractNumbers(bodyMarkdown),
    };
  },
  /** Konu eşleştirme: sahte ajan bağ kurmaz (kuru çalıştırmada yanlış dizi oluşmasın); diziler yalnızca kuralla kurulur */
  async relate() {
    return { match: 0, reason: "sahte ajan: model yok" };
  },
  /** Flaş: başlık + belgenin ilk anlamlı cümlesi (belgeden kopya → sayı kontrolünden geçer) */
  async flash({ title, textHead }) {
    const sentence = textHead.split(/(?<=\.)\s+/).map((s) => s.replace(/\s+/g, " ").trim()).find((s) => s.length > 40 && s.length < 280) ?? textHead.slice(0, 200);
    const headline = title.length > 90 ? title.slice(0, 87).replace(/\s+\S*$/, "") : title;
    return { headline, sentence, numbersUsed: extractNumbers(`${headline}\n${sentence}`) };
  },
};
