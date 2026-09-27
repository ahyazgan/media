import type { Agents } from "./pipeline.js";
import { extractNumbers } from "@kaynak/agents";

/**
 * Modelsiz sahte ajanlar: kuru çalıştırma ve testler için. Yalnızca belgeden kopyalanan cümleleri
 * kullanır, böylece numericGroundingCheck'ten geçer. Gerçek haber kalitesi beklenmez.
 */
export const fakeAgents: Agents = {
  async classify({ title }) {
    const t = title.toLocaleLowerCase("tr");
    const isUni = /üniversite/.test(t);
    return {
      category: "mevzuat", importance: isUni ? 2 : 3,
      entities: { companies: [], tickers: [], institutions: [] },
      isNews: !isUni,
      summaryHint: "Sahte ajan: belgeden özet.",
    };
  },
  async write({ title, documentText, sourceName }) {
    const sentences = documentText.split(/(?<=\.)\s+/).map((s) => s.replace(/\s+/g, " ").trim()).filter((s) => s.length > 40 && s.length < 400);
    const picked = sentences.slice(0, 8);
    const body = [`${sourceName} kaynaklı belge yayımlandı: ${title}.`, ...picked].join("\n\n");
    // 120 kelime altına düşmesin diye belge cümleleri tekrarlanmaz; yeterli değilse tamamı eklenir
    const bodyMarkdown = body.split(/\s+/).length >= 120 ? body : [body, ...sentences.slice(8, 20)].join("\n\n");
    const firstQuote = picked[0] ?? sentences[0] ?? documentText.slice(0, 120);
    return {
      title: title.length > 70 ? title.slice(0, 67).replace(/\s+\S*$/, "") : title,
      dek: picked[1] ?? firstQuote,
      bodyMarkdown,
      keyFacts: [{ text: firstQuote, quoteFromSource: firstQuote }],
      tickers: [], tags: ["resmi-gazete", "mevzuat"],
      numbersUsed: extractNumbers(bodyMarkdown),
    };
  },
};
