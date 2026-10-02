import { and, eq, inArray } from "drizzle-orm";
import { type Article, type Db, rawEvents, documents, articles, reviewQueue, companies, companyEvents, type RawEventRow } from "@kaynak/db";
import type { ClassifyOutput, WriteOutput, EditResult, FlashInput, FlashOutput } from "@kaynak/agents";
import { checkFlash, runEditRules } from "@kaynak/agents";
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
    publishedAt: string; classify: ClassifyOutput; avoidPhrases?: string[]; stockCodes?: string[];
  }): Promise<WriteOutput>;
  /** Flaş: belgeden tek cümle (hızlı model); yoksa flaş üretilmez */
  flash?(input: FlashInput): Promise<FlashOutput>;
}

export interface PipelineDeps {
  db: Db;
  agents: Agents;
  store: BlobStore;
  reviewThreshold: number;
  sourceNames?: Record<string, string>;
  log?: (msg: string, meta?: Record<string, unknown>) => void;
  onPublished?: (article: typeof articles.$inferSelect, ctx: { sourceId: string }) => Promise<void>;
  /** Yayındaki makale güncellendiğinde (flaş → tam metin): yalnızca sayfa yenileme, dağıtım tekrarlanmaz */
  onUpdated?: (article: typeof articles.$inferSelect, ctx: { sourceId: string }) => Promise<void>;
  /** Flaş: hangi kaynaklarda, hangi önemden itibaren (verilmezse kapalı) */
  flash?: { sources: string[]; minImportance: number };
}

/** Kaynak kimliği → görünen ad (yazar ajanına ve arayüze gider). */
export const SOURCE_NAMES: Record<string, string> = {
  "resmi-gazete": "T.C. Resmî Gazete",
  kap: "Kamuyu Aydınlatma Platformu",
  tcmb: "Türkiye Cumhuriyet Merkez Bankası",
  tuik: "Türkiye İstatistik Kurumu",
  spk: "Sermaye Piyasası Kurulu",
  bddk: "Bankacılık Düzenleme ve Denetleme Kurumu",
  epdk: "Enerji Piyasası Düzenleme Kurumu",
  botas: "BOTAŞ",
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

  // Kaynağın işaretlediği rutin bildirim (KAP: borçlanma aracı, yatırımcı raporu…): belge indirilmez, model çağrılmaz;
  // şirket bildirim geçmişine isNews=false olarak girer
  if (row.payload["routine"] === true) {
    await linkCompanies(deps.db, row, false);
    await deps.db.update(rawEvents).set({ status: "skipped" }).where(eq(rawEvents.id, row.id));
    log("skip:routine", { externalId: row.externalId, subject: row.payload["subject"] });
    return { kind: "skipped", reason: "rutin bildirim" };
  }

  // verify (a): belgeyi indir, sakla, metin çıkar
  const fetched = await adapter.fetchDocument(ev);
  const text = await documentToText(fetched.mime, fetched.bytes);
  const storageKey = storageKeyFor(row.sourceId, row.externalId, fetched.mime);
  await deps.store.put(storageKey, fetched.bytes, fetched.mime);
  const [doc] = await deps.db.insert(documents).values({
    rawEventId: row.id, url: fetched.url, mime: fetched.mime, storageKey, textContent: text,
  }).returning();
  if (!doc) throw new Error("document insert failed");

  // Borsa kodları kaynağın resmi listesinden (KAP PDF'inde kod geçmez; model tahmin etmesin)
  const stockCodes = companyRefsOf(row.payload).map((c) => c.code);
  // Yazara verilen yayın zamanı (resmi listeden) sayı kontrolünde belgeye eşdeğer sayılır
  const groundingExtra = istanbulStamp(row.publishedAt);

  // classify — flaşa uygun kaynakta flaş yazımı paralel başlar (haber değilse sonucu atılır)
  const section = typeof row.payload["section"] === "string" ? (row.payload["section"] as string) : undefined;
  const flashEligible = Boolean(deps.flash && deps.agents.flash && adapter.official && deps.flash.sources.includes(row.sourceId));
  const flashP = flashEligible
    ? deps.agents.flash!({ sourceId: row.sourceId, sourceName, title: row.title, textHead: text.slice(0, 6000), ...(stockCodes.length ? { stockCodes } : {}) })
      .catch((e: Error) => { log("flash:error", { externalId: row.externalId, error: e.message }); return undefined; })
    : undefined;
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

  // Flaş: önemli haber, resmi kaynak, doğrulama sorunu yok, flaş kurallarından geçti → hemen yayın ve dağıtım.
  // Tam metin aynı makaleyi (aynı adresi) günceller; onay gerekirse flaş yayında kalır, tam metin pendingDraft'ta bekler.
  let flashArticle: Article | undefined;
  if (flashP && !forceReview && cls.importance >= deps.flash!.minImportance) {
    const f = await flashP;
    const check = f ? checkFlash(f, text, { groundingExtra }) : { ok: false, reasons: ["flaş üretilemedi"] };
    if (f && check.ok) {
      const now = new Date();
      const [fa] = await deps.db.insert(articles).values({
        slug: makeSlug(f.headline), status: "published", category: cls.category, importance: cls.importance,
        // Gövde boş: cümle dek'te; sayfa aynı cümleyi iki kez göstermesin (tam metin gelince dolar)
        title: f.headline.trim(), dek: f.sentence.trim(), bodyMarkdown: "", keyFacts: [],
        tickers: companyCodes, tags: ["flas"], sourceUrl: fetched.url, documentId: doc.id, rawEventId: row.id,
        publishedAt: now, updatedAt: now, isFlash: true, editorNote: "flaş (otomatik): tam metin yazılıyor",
      }).returning();
      if (!fa) throw new Error("flash insert failed");
      flashArticle = fa;
      log("flash:publish", { externalId: row.externalId, slug: fa.slug, ms: now.getTime() - row.createdAt.getTime() });
      await snapshotArticle(deps.db, fa, "flaş (otomatik)");
      await deps.onPublished?.(fa, { sourceId: row.sourceId });
    } else {
      log("flash:skip", { externalId: row.externalId, reasons: check.reasons });
    }
  }

  // write (+ yasaklı kalıpta bir kez tekrar)
  const writeInput = {
    sourceId: row.sourceId, sourceName, sourceUrl: fetched.url, title: row.title,
    documentText: text, publishedAt: row.publishedAt.toISOString(), classify: cls,
    ...(stockCodes.length ? { stockCodes } : {}),
  };
  let draft = await deps.agents.write(writeInput);
  // Uzunluk alt sınırı kaynağın sabit kalıplarından arınmış metne göre (KAP: sorumluluk beyanı ve "Özet Bilgi" alanları)
  const lengthBasisText = adapter.contentText?.(text);
  let edit: EditResult = runEditRules(draft, text, { importance: cls.importance, reviewThreshold: deps.reviewThreshold, groundingExtra, lengthBasisText });
  if (edit.decision === "retry") {
    log("edit:retry", { externalId: row.externalId, reasons: edit.reasons });
    draft = await deps.agents.write({ ...writeInput, avoidPhrases: edit.banned.map((b) => b.match) });
    edit = runEditRules(draft, text, { importance: cls.importance, reviewThreshold: deps.reviewThreshold, isRetry: true, groundingExtra, lengthBasisText });
  }

  const status = edit.decision === "reject" ? "rejected" : edit.decision === "publish" && !forceReview ? "published" : "review";
  const reasons = [...edit.reasons, ...(forceReview ? [forceReview] : [])];
  const now = new Date();
  // Modelin önerdiği kodlardan yalnızca belgede ya da kaynağın listesinde geçenler kalır (uydurma kod şirket sayfasına bağlanmasın)
  const docUpper = text.toLocaleUpperCase("tr");
  const groundedTickers = draft.tickers.map((t) => t.trim().toUpperCase()).filter((t) => /^[A-Z0-9]{3,6}$/.test(t)).filter((t) => stockCodes.includes(t) || new RegExp(`(^|[^A-Z0-9])${t}([^A-Z0-9]|$)`).test(docUpper));
  const tickers = [...new Set([...companyCodes, ...groundedTickers])];

  // Flaş yayındaysa ve tam metin reddedilmediyse: aynı makale güncellenir (yeni satır yok)
  if (flashArticle && status !== "rejected") {
    await deps.db.update(rawEvents).set({ status: "processed" }).where(eq(rawEvents.id, row.id));
    if (companyCodes.length) {
      await deps.db.update(companyEvents).set({ articleId: flashArticle.id })
        .where(and(eq(companyEvents.rawEventId, row.id), inArray(companyEvents.kapCode, companyCodes)));
    }
    const full = { title: draft.title, dek: draft.dek, bodyMarkdown: draft.bodyMarkdown, keyFacts: draft.keyFacts, tags: draft.tags, tickers };
    if (status === "review") {
      await deps.db.update(articles).set({ pendingDraft: full, updatedAt: now, editorNote: `flaş yayında; tam metin onay bekliyor: ${reasons.join(" | ")}` })
        .where(eq(articles.id, flashArticle.id));
      await deps.db.insert(reviewQueue).values({ articleId: flashArticle.id, reason: `flaş yayında — tam metin: ${reasons.join(" | ") || "insan onayı"}` });
      log("edit:review", { externalId: row.externalId, reasons, flash: flashArticle.slug });
      return { kind: "review", articleId: flashArticle.id, reasons };
    }
    const [updated] = await deps.db.update(articles).set({ ...full, isFlash: false, pendingDraft: null, updatedAt: now, editorNote: null })
      .where(eq(articles.id, flashArticle.id)).returning();
    log("publish", { externalId: row.externalId, slug: flashArticle.slug, replacedFlash: true });
    await snapshotArticle(deps.db, updated!, "tam metin (otomatik, flaşın yerine)");
    await linkCalendarFor(deps, row, updated!.id, log);
    // Dağıtım flaşla yapıldı; burada yalnızca sayfalar yenilenir
    await (deps.onUpdated ?? deps.onPublished)?.(updated!, { sourceId: row.sourceId });
    return { kind: "published", articleId: updated!.id, slug: updated!.slug };
  }

  // articles kaydı
  const slug = makeSlug(draft.title);
  const [article] = await deps.db.insert(articles).values({
    slug, status, category: cls.category, importance: cls.importance,
    title: draft.title, dek: draft.dek, bodyMarkdown: draft.bodyMarkdown, keyFacts: draft.keyFacts,
    tickers, tags: draft.tags, sourceUrl: fetched.url, documentId: doc.id, rawEventId: row.id,
    publishedAt: status === "published" ? now : null, updatedAt: now,
    editorNote: [...reasons, ...(flashArticle ? [`flaş yayında: /haber/${flashArticle.slug}`] : [])].join(" | ") || null,
  }).returning();
  if (!article) throw new Error("article insert failed");
  await deps.db.update(rawEvents).set({ status: "processed" }).where(eq(rawEvents.id, row.id));
  if (companyCodes.length && !flashArticle) {
    await deps.db.update(companyEvents).set({ articleId: article.id })
      .where(and(eq(companyEvents.rawEventId, row.id), inArray(companyEvents.kapCode, companyCodes)));
  }

  if (status === "rejected") {
    log("edit:reject", { externalId: row.externalId, reasons, ...(flashArticle ? { flash: flashArticle.slug } : {}) });
    if (flashArticle) {
      // Flaş yayında kalır (kendi kurallarından geçti); editör tam metni elle yazabilir
      await deps.db.update(articles).set({ editorNote: `flaş yayında; otomatik tam metin reddedildi: ${reasons.join(" | ")}`, updatedAt: now }).where(eq(articles.id, flashArticle.id));
      await deps.db.insert(reviewQueue).values({ articleId: flashArticle.id, reason: `flaş yayında — tam metin reddedildi: ${reasons.join(" | ")}` });
    }
    return { kind: "rejected", articleId: article.id, reasons };
  }
  if (status === "review") {
    await deps.db.insert(reviewQueue).values({ articleId: article.id, reason: reasons.join(" | ") || "insan onayı" });
    log("edit:review", { externalId: row.externalId, reasons });
    return { kind: "review", articleId: article.id, reasons };
  }
  log("publish", { externalId: row.externalId, slug });
  await snapshotArticle(deps.db, article, "ilk yayın (otomatik)");
  await linkCalendarFor(deps, row, article.id, log);
  await deps.onPublished?.(article, { sourceId: row.sourceId });
  return { kind: "published", articleId: article.id, slug };
}

async function linkCalendarFor(deps: PipelineDeps, row: RawEventRow, articleId: string, log: (m: string, meta?: Record<string, unknown>) => void) {
  if (row.sourceId !== "tcmb" && row.sourceId !== "tuik") return;
  const linked = await linkCalendarEvent(deps.db, row.sourceId, articleId, row.publishedAt);
  if (linked) log("calendar:link", { externalId: row.externalId, calendarEventId: linked });
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

/** Yayın zamanı Türkiye saatiyle, haberde geçebilecek biçimlerde: "02.10.2026 15:57:25 2 Ekim 2026 15:57" */
function istanbulStamp(d: Date): string {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Istanbul", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(d).map((x) => [x.type, x.value]));
  const month = new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", month: "long" }).format(d);
  return `${p["day"]}.${p["month"]}.${p["year"]} ${p["hour"]}:${p["minute"]}:${p["second"]} ${Number(p["day"])} ${month} ${p["year"]} ${p["hour"]}:${p["minute"]}`;
}
