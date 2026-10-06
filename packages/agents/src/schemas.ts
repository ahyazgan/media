import { z } from "zod";

export const CATEGORIES = ["borsa", "mevzuat", "makro", "bankacilik", "enerji", "sirketler", "diger"] as const;
export type Category = (typeof CATEGORIES)[number];

export const ClassifyOutput = z.object({
  category: z.enum(CATEGORIES),
  importance: z.number().int().min(1).max(5),
  entities: z.object({
    companies: z.array(z.string()),
    tickers: z.array(z.string()),
    institutions: z.array(z.string()),
  }),
  isNews: z.boolean(),
  summaryHint: z.string(),
});
export type ClassifyOutput = z.infer<typeof ClassifyOutput>;

export const KeyFact = z.object({
  text: z.string(),
  quoteFromSource: z.string(),
});

export const WriteOutput = z.object({
  title: z.string(),
  dek: z.string(),
  bodyMarkdown: z.string(),
  keyFacts: z.array(KeyFact),
  tickers: z.array(z.string()),
  tags: z.array(z.string()),
  numbersUsed: z.array(z.string()),
});
export type WriteOutput = z.infer<typeof WriteOutput>;

export interface ClassifyInput {
  sourceId: string;
  title: string;
  /** Belgenin ilk ~2.000 karakteri */
  textHead: string;
  section?: string;
}

export interface WriteInput {
  sourceId: string;
  sourceName: string;
  sourceUrl: string;
  title: string;
  documentText: string;
  publishedAt: string; // ISO
  classify: ClassifyOutput;
  /** Önceki deneme yasaklı kalıp yüzünden dönmüşse, kaçınılması gereken ifadeler */
  avoidPhrases?: string[];
  /** Kaynağın resmi listesindeki borsa kodları (KAP: bildirim PDF'inde kod geçmez, liste kaydından gelir) */
  stockCodes?: string[];
  /** Aynı konu dizisinde daha önce yayımladığımız haberler (yeniden eskiye); yalnızca son paragrafta, tarihiyle kullanılır */
  background?: BackgroundItem[];
}

/** Arka plan: daha önce yayımlanmış, kendi resmi belgesine dayanan haber (başlık, spot, olgular; gövde verilmez) */
export interface BackgroundItem {
  /** Kaynak belgenin yayın tarihi, Türkçe ("2 Ekim 2026") */
  date: string;
  title: string;
  dek: string;
  facts: string[];
}

/** Flaş: belgeden tek cümlelik ilk haber (tam metin hazırlanırken yayımlanır) */
export const FlashOutput = z.object({
  headline: z.string(),
  sentence: z.string(),
  numbersUsed: z.array(z.string()),
});
export type FlashOutput = z.infer<typeof FlashOutput>;

export interface FlashInput {
  sourceId: string;
  sourceName: string;
  title: string;
  /** Belgenin ilk ~6.000 karakteri */
  textHead: string;
  stockCodes?: string[];
}

/** İlişki: yeni bildirim, aynı şirketin daha önce haberleştirilmiş bir olayının devamı mı? */
export interface RelateInput {
  sourceId: string;
  title: string;
  /** Belgenin ilk ~1.500 karakteri */
  textHead: string;
  candidates: { date: string; title: string; dek: string }[];
}

export const RelateOutput = z.object({
  /** Adayın sıra numarası (1'den başlar); devamı değilse 0 */
  match: z.number().int().min(0),
  reason: z.string(),
});
export type RelateOutput = z.infer<typeof RelateOutput>;

/**
 * Anlam doğrulaması: sayı kontrolünün göremediği hatalar. yon = artış/azalış ters; donem = ay/yıl/tarih farklı; olumsuzluk = olumlu/olumsuz
 * ters; atif = yanlış kurum/şirket ya da kurumun tahmini haberin iddiası gibi; baglam = sayı belgede var ama başka şeye ait (aylık ↔ yıllık);
 * desteksiz = belgede hiç dayanağı olmayan somut olgu.
 */
export const VERIFY_PROBLEMS = ["yon", "donem", "olumsuzluk", "atif", "baglam", "desteksiz"] as const;
export const VerifyIssue = z.object({
  /** Haberdeki sorunlu ifade (haberden birebir) */
  claim: z.string(),
  problem: z.enum(VERIFY_PROBLEMS),
  /** Belgeden birebir alıntı (iddiayla çelişen ya da ilgili kısım); desteksiz için boş olabilir */
  evidence: z.string(),
  explanation: z.string(),
});
export type VerifyIssue = z.infer<typeof VerifyIssue>;
export const VerifyOutput = z.object({ issues: z.array(VerifyIssue) });
export type VerifyOutput = z.infer<typeof VerifyOutput>;

export interface VerifyInput {
  sourceId: string;
  documentText: string;
  title: string;
  dek: string;
  /** Tam metin gövdesi; flaşta yok */
  body?: string;
  /** Yazara verilen arka plan (formatBackground çıktısı): buna dayanan, tarihiyle verilmiş cümleler desteklidir */
  background?: string;
}
