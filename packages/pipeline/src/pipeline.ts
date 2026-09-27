import { and, eq, inArray } from "drizzle-orm";
import { type Db, rawEvents, documents, articles, reviewQueue, companies, companyEvents, type RawEventRow } from "@kaynak/db";
import type { ClassifyOutput, WriteOutput, EditResult } from "@kaynak/agents";
import { runEditRules } from "@kaynak/agents";
import { documentToText, type RawEvent, type SourceAdapter } from "@kaynak/sources";
import type { BlobStore } from "./storage.js";
import { storageKeyFor } from "./storage.js";
import { makeSlug } from "./slug.js";
import { linkCalendarEvent } from "./calendar.js";
import { snapshotArticle } from "./editorial.js";

/** Ajan çağrıları enjekte edilir: testte sahte, üretimde @kaynak/agents. */
export interface Agents {
  classify(input: { sourceId: string; title: string; textHead: string; section?: string }): Promise<ClassifyOutput>;
  write(input: {
    sourceId: string; sourceName: string; sourceUrl: string; title: string; documentText: string;
    publishedAt: string; classify: ClassifyOutput; avoidPhrases?: string[];
  }): Promise<WriteOutput>;
}

export interface PipelineDeps {
  db: Db;
  agents: Agents;
  store: BlobStore;
  reviewThreshold: number;
  sourceNames?: Record<string, string>;
  log?: (msg: string, meta?: Record<string, unknown>) => void;
  onPublished?: (article: typeof articles.$inferSelect, ctx: { sourceId: string }) => Promise<void>;
}

/** Kaynak kimliği → görünen ad (yazar ajanına ve arayüze gider). */
export const SOURCE_NAMES: Record<string, string> = {
  "resmi-gazete": "T.C. Resmî Gazete",
  kap: "Kamuyu Aydınlatma Platformu",
  tcmb: "Türkiye Cumhuriyet Merkez Bankası",
  tuik: "Türkiye İstatistik Kurumu",
};

export type Outcome =
  | { kind: "duplicate" }
  | { kind: "skipped"; reason: string }
  | { kind: "review"; articleId: string; reasons: string[] }
  | { kind: "rejected"; articleId: string; reasons: string[] }
  | { kind: "published"; articleId: string; slug: string };

/** 1) watch → raw_events (dedupe: unique(sourceId, externalId, payloadHash)). Yeni eklenenleri döndürür. */
export async function ingestEvents(db: Db, events: RawEvent[]): Promise<RawEventRow[]> {
  const inserted: RawEventRow[] = [];
  for (const ev of events) {
    const rows = await db.insert(rawEvents).values({
      sourceId: ev.sourceId, externalId: ev.externalId, title: ev.title, url: ev.url,
      publishedAt: ev.publishedAt, payloadHash: ev.payloadHash, payload: ev.payload,
    }).onConflictDoNothing().returning();
    if (rows[0]) inserted.push(rows[0]);
  }
  return inserted;
}

/** 2–6) tek bir raw_event'i uçtan uca işler. */
export async function processEvent(deps: PipelineDeps, adapter: SourceAdapter, row: RawEventRow): Promise<Outcome> {
  const log = deps.log ?? (() => {});
  const sourceName = deps.sourceNames?.[row.sourceId] ?? SOURCE_NAMES[row.sourceId] ?? row.sourceId;
  const ev: RawEvent = {
    sourceId: row.sourceId, externalId: row.externalId, title: row.title, url: row.url,
    publishedAt: row.publishedAt, payloadHash: row.payloadHash, payload: row.payload,
  };

  // verify (a): belgeyi indir, sakla, metin çıkar
  const fetched = await adapter.fetchDocument(ev);
  const text = await documentToText(fetched.mime, fetched.bytes);
  const storageKey = storageKeyFor(row.sourceId, row.externalId, fetched.mime);
  await deps.store.put(storageKey, fetched.bytes, fetched.mime);
  const [doc] = await deps.db.insert(documents).values({
    rawEventId: row.id, url: fetched.url, mime: fetched.mime, storageKey, textContent: text,
  }).returning();
  if (!doc) throw new Error("document insert failed");

  // classify
  const section = typeof row.payload["section"] === "string" ? (row.payload["section"] as string) : undefined;
  const cls = await deps.agents.classify({ sourceId: row.sourceId, title: row.title, textHead: text.slice(0, 2000), section });
  log("classify", { externalId: row.externalId, ...cls });

  // Şirket bağlama: payload.companies → companies (upsert) + company_events. isNews=false olsa da kaydedilir (bildirim geçmişi).
  const companyCodes = await linkCompanies(deps.db, row, cls.isNews);

  if (!cls.isNews) {
    await deps.db.update(rawEvents).set({ status: "skipped" }).where(eq(rawEvents.id, row.id));
    return { kind: "skipped", reason: "isNews=false" };
  }

  // verify (b): başlık–belge anahtar kelime örtüşmesi
  const overlap = keywordOverlap(row.title, text);
  let forceReview: string | undefined;
  if (overlap < 2) forceReview = `verify: başlık ile belge arasında yalnızca ${overlap} anahtar kelime örtüşüyor`;
  if (!adapter.official) forceReview = "verify: resmi olmayan kaynak — ikinci bağımsız kaynak gerekir";

  // write (+ yasaklı kalıpta bir kez tekrar)
  const writeInput = {
    sourceId: row.sourceId, sourceName, sourceUrl: fetched.url, title: row.title,
    documentText: text, publishedAt: row.publishedAt.toISOString(), classify: cls,
  };
  let draft = await deps.agents.write(writeInput);
  let edit: EditResult = runEditRules(draft, text, { importance: cls.importance, reviewThreshold: deps.reviewThreshold });
  if (edit.decision === "retry") {
    log("edit:retry", { externalId: row.externalId, reasons: edit.reasons });
    draft = await deps.agents.write({ ...writeInput, avoidPhrases: edit.banned.map((b) => b.match) });
    edit = runEditRules(draft, text, { importance: cls.importance, reviewThreshold: deps.reviewThreshold, isRetry: true });
  }

  // articles kaydı
  const slug = makeSlug(draft.title);
  const status = edit.decision === "reject" ? "rejected" : edit.decision === "publish" && !forceReview ? "published" : "review";
  const reasons = [...edit.reasons, ...(forceReview ? [forceReview] : [])];
  const now = new Date();
  const tickers = [...new Set([...companyCodes, ...draft.tickers.map((t) => t.toUpperCase())])];
  const [article] = await deps.db.insert(articles).values({
    slug, status, category: cls.category, importance: cls.importance,
    title: draft.title, dek: draft.dek, bodyMarkdown: draft.bodyMarkdown, keyFacts: draft.keyFacts,
    tickers, tags: draft.tags, sourceUrl: fetched.url, documentId: doc.id, rawEventId: row.id,
    publishedAt: status === "published" ? now : null, updatedAt: now,
    editorNote: reasons.length ? reasons.join(" | ") : null,
  }).returning();
  if (!article) throw new Error("article insert failed");
  await deps.db.update(rawEvents).set({ status: "processed" }).where(eq(rawEvents.id, row.id));
  if (companyCodes.length) {
    await deps.db.update(companyEvents).set({ articleId: article.id })
      .where(and(eq(companyEvents.rawEventId, row.id), inArray(companyEvents.kapCode, companyCodes)));
  }

  if (status === "rejected") {
    log("edit:reject", { externalId: row.externalId, reasons });
    return { kind: "rejected", articleId: article.id, reasons };
  }
  if (status === "review") {
    await deps.db.insert(reviewQueue).values({ articleId: article.id, reason: reasons.join(" | ") || "insan onayı" });
    log("edit:review", { externalId: row.externalId, reasons });
    return { kind: "review", articleId: article.id, reasons };
  }
  log("publish", { externalId: row.externalId, slug });
  await snapshotArticle(deps.db, article, "ilk yayın (otomatik)");
  if (row.sourceId === "tcmb" || row.sourceId === "tuik") {
    const linked = await linkCalendarEvent(deps.db, row.sourceId, article.id, row.publishedAt);
    if (linked) log("calendar:link", { externalId: row.externalId, calendarEventId: linked });
  }
  await deps.onPublished?.(article, { sourceId: row.sourceId });
  return { kind: "published", articleId: article.id, slug };
}

/** İşlenmemiş (status=new) event'leri sırayla işler. */
export async function processPending(deps: PipelineDeps, adapter: SourceAdapter, limit = 50): Promise<Outcome[]> {
  const rows = await deps.db.select().from(rawEvents)
    .where(and(eq(rawEvents.sourceId, adapter.id), eq(rawEvents.status, "new"))).limit(limit);
  const out: Outcome[] = [];
  for (const row of rows) out.push(await processEvent(deps, adapter, row));
  return out;
}

export interface CompanyRef { code: string; name: string }

/** payload.companies içindeki şirket referanslarını okur (KAP adapter'ı yazar; başka kaynaklar da yazabilir). */
export function companyRefsOf(payload: Record<string, unknown>): CompanyRef[] {
  const raw = payload["companies"];
  if (!Array.isArray(raw)) return [];
  const out: CompanyRef[] = [];
  for (const c of raw) {
    if (!c || typeof c !== "object") continue;
    const code = String((c as CompanyRef).code ?? "").trim().toUpperCase();
    const name = String((c as CompanyRef).name ?? "").trim();
    if (/^[A-Z0-9]{3,6}$/.test(code) && !out.some((x) => x.code === code)) out.push({ code, name: name || code });
  }
  return out;
}

/** companies upsert + company_events insert; bağlanan kodları döndürür. */
export async function linkCompanies(db: Db, row: RawEventRow, isNews: boolean): Promise<string[]> {
  const refs = companyRefsOf(row.payload);
  const codes: string[] = [];
  for (const ref of refs) {
    await db.insert(companies).values({ kapCode: ref.code, name: ref.name, slug: ref.code.toLowerCase() })
      .onConflictDoUpdate({ target: companies.kapCode, set: { name: ref.name, updatedAt: new Date() } });
    await db.insert(companyEvents).values({ kapCode: ref.code, rawEventId: row.id, isNews }).onConflictDoNothing();
    codes.push(ref.code);
  }
  return codes;
}

const STOP = new Set(["ve", "ile", "dair", "hakkında", "ilişkin", "sayılı", "tarihli", "kanun", "yönetmelik", "tebliğ", "karar", "kararı", "değişiklik", "yapılmasına", "yönetmeliğinde", "tebliğde", "kapsamında", "uygulanan", "bir", "bu"]);
export function keywordOverlap(title: string, text: string): number {
  const norm = (s: string) => s.toLocaleLowerCase("tr").replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter((w) => w.length > 3 && !STOP.has(w));
  const words = new Set(norm(title));
  const body = new Set(norm(text));
  let n = 0;
  for (const w of words) if (body.has(w)) n++;
  return n;
}
