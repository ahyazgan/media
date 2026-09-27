import { extractNumbers } from "../edit/numericGrounding.js";
import type { EvalRunner } from "./run.js";

/**
 * Anahtarsız sahte koşucu: düzeneğin kendisini (yükleme, puanlama, rapor) sınar, haber kalitesini değil.
 * Sınıflandırma kaynağa göre kaba bir kural, yazım belgeden birebir cümle kopyası.
 */
const CATEGORY_BY_SOURCE: Record<string, "borsa" | "makro" | "mevzuat"> = { kap: "borsa", tcmb: "makro", tuik: "makro" };

export const dryRunner: EvalRunner = {
  async classify(input) {
    const uni = /üniversite/i.test(input.title);
    return {
      output: {
        category: CATEGORY_BY_SOURCE[input.sourceId] ?? "mevzuat",
        importance: uni ? 2 : 3,
        entities: { companies: [], tickers: [], institutions: [] },
        isNews: !uni,
        summaryHint: "Sahte koşucu.",
      },
      meta: { model: "dry", ms: 0, stopReason: "end_turn", usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } },
    };
  },
  async write(input) {
    const sentences = input.documentText.split(/(?<=\.)\s+/).map((s) => s.replace(/\s+/g, " ").trim()).filter((s) => s.length > 40 && s.length < 400);
    const body = [`${input.sourceName} kaynaklı belge yayımlandı: ${input.title}.`, ...sentences.slice(0, 10)].join("\n\n");
    const quote = sentences[0] ?? input.documentText.slice(0, 120);
    return {
      output: {
        title: input.title.length > 70 ? input.title.slice(0, 67).replace(/\s+\S*$/, "") : input.title,
        dek: sentences[1] ?? quote,
        bodyMarkdown: body,
        keyFacts: [{ text: quote, quoteFromSource: quote }],
        tickers: [], tags: ["sahte"],
        numbersUsed: extractNumbers(body),
      },
      meta: { model: "dry", ms: 0, stopReason: "end_turn", usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } },
    };
  },
};
