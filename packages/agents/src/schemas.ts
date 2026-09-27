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
}
