/**
 * Genel "duyuru listesi" adapter'ı: bir HTML liste sayfasındaki bağlantıları (PDF ya da sayfa) olaya çevirir.
 * SPK haftalık bülten, BDDK/EPDK/BOTAŞ duyuruları gibi kaynaklar yalnızca yapılandırmadır (aşağıdaki `configs.ts`).
 * Yapıya sıkı bağlı değildir: kapsayıcı içindeki tüm bağlantılar gezilir; bağlantı/başlık kalıbıyla süzülür; tarih
 * bağlantı metninden, satırından (tr/li/p/div) ya da href'ten çıkarılır. Tarihsiz öğeler çekim anıyla kaydedilir,
 * tekilleştirme externalId (bağlantıdan türetilir) ile raw_events'te yapılır.
 */
import * as cheerio from "cheerio";
import { createHash } from "node:crypto";
import { politeFetch, type PoliteFetchOptions } from "../http.js";
import { decodeHtml } from "../extract.js";
import { looksLikeBlockPage, StructureError } from "../health.js";
import type { CronLike, FetchedDocument, RawEvent, SourceAdapter } from "../types.js";
import { atIstanbul, findDate } from "../calendar/parse.js";
import { externalIdFor } from "../feed/parse.js";

export interface ListingItem { title: string; url: string; date?: string; publishedAt: Date; context: string }

export interface ListingOptions {
  id: string;
  official?: boolean;
  listUrl: string;
  schedule: CronLike;
  /** Bağlantıların arandığı kapsayıcı (varsayılan: body; nav/header/footer atılır) */
  containerSelector?: string;
  /** href bu kalıba uymalı (ör. /\.pdf(\?|$)/i) */
  linkPattern?: RegExp;
  /** bağlantı metni bu kalıba uymalı (ör. /bülten/i) */
  titlePattern?: RegExp;
  /** bağlantı metni bu kalıba uyarsa atlanır (ör. /english|\bEN\b/i) */
  excludePattern?: RegExp;
  /** Tarih bulunamazsa öğe alınsın mı (varsayılan true) */
  allowUndated?: boolean;
  defaultTime?: string;
  /** Ek liste sayfaları (aynı kurumun başka kategorileri, ör. BDDK basın + mevzuat duyuruları). Adreslerde "{yil}" o yılla değişir. */
  extraListUrls?: string[];
  /** Başlık düzeltmesi (ör. SPK: "Bülten No : 2026/67 Yayımlanma : …" → "SPK Bülteni 2026/67") */
  titleOf?: (item: ListingItem) => string;
  /** Detay sayfasında ana içerik (menüler metne karışmasın); verilmezse sayfanın tamamı */
  documentSelector?: string;
  /** Detay sayfasındaki bu kalıba uyan ilk ek (PDF) asıl belgedir (BDDK: /Duyuru/EkGetir/…) */
  attachmentPattern?: RegExp;
  section: { section: string; sectionLabel: string } | ((item: ListingItem) => { section: string; sectionLabel: string });
  http?: PoliteFetchOptions;
  now?: () => Date;
}

export class ListingAdapter implements SourceAdapter {
  readonly id: string;
  readonly official: boolean;
  readonly listUrl: string;
  private readonly o: ListingOptions;
  constructor(o: ListingOptions) { this.o = o; this.id = o.id; this.official = o.official ?? true; this.listUrl = o.listUrl; }

  schedule(): CronLike { return this.o.schedule; }

  /** Taranacak liste adresleri ("{yil}" bugünün yılıyla) */
  listUrls(now = (this.o.now ?? (() => new Date()))()): string[] {
    const year = String(new Date(now.getTime() + 3 * 3_600_000).getUTCFullYear());
    return [this.listUrl, ...(this.o.extraListUrls ?? [])].map((u) => u.split("{yil}").join(year));
  }

  async fetchNew(since: Date): Promise<RawEvent[]> {
    const out: RawEvent[] = [];
    const all: RawEvent[] = [];
    const seen = new Set<string>();
    for (const listUrl of this.listUrls()) {
      const res = await politeFetch(listUrl, this.o.http);
      const html = decodeHtml(Buffer.from(await res.arrayBuffer()), res.headers.get("content-type"));
      if (looksLikeBlockPage(html)) throw new StructureError(this.id, "liste yerine engelleme sayfası geldi", html.slice(0, 400));
      if (this.parse(html, listUrl).length === 0) throw new StructureError(this.id, `liste sayfasında duyuru bağlantısı bulunamadı (${listUrl}); seçici ya da sayfa yapısı değişmiş olabilir`, html.slice(0, 400));
      for (const e of this.eventsFromHtml(html, listUrl)) {
        if (seen.has(e.externalId)) continue;
        seen.add(e.externalId);
        // Aynı duyuru birden çok kategoride ayrı numarayla yayımlanabilir (BDDK basın + kuruluş): aynı başlık, ≤7 gün → tek olay
        const twin = all.find((x) => x.title === e.title && Math.abs(x.publishedAt.getTime() - e.publishedAt.getTime()) <= 7 * 86_400_000);
        if (twin) continue;
        all.push(e);
        if (e.payload["undated"] === true || e.publishedAt > since) out.push(e);
      }
    }
    return out;
  }

  /** Test edilebilir çekirdek: liste HTML → ListingItem[] */
  parse(html: string, listUrl = this.listUrls()[0]!): ListingItem[] {
    const $ = cheerio.load(html);
    $("script, style, noscript, nav, header, footer").remove();
    const root = this.o.containerSelector && $(this.o.containerSelector).length ? $(this.o.containerSelector) : $("body");
    const items: ListingItem[] = [];
    const seen = new Set<string>();
    root.find("a[href]").each((_, a) => {
      const $a = $(a);
      const href = ($a.attr("href") ?? "").trim();
      if (!href || href.startsWith("#") || /^(javascript|mailto|tel):/i.test(href)) return;
      let url: string;
      try { url = new URL(href, listUrl).toString(); } catch { return; }
      // Başa yazılmış "30.09.2026" tarihi başlıktan atılır (BDDK); tarih yine bağlamdan okunur
      const rawTitle = ($a.text().replace(/\s+/g, " ").trim() || $a.attr("title") || "").trim();
      const title = rawTitle.replace(/^\d{1,2}\.\d{1,2}\.\d{4}\s+/, "").trim();
      if (!title || title.length < 4) return;
      if (this.o.linkPattern && !this.o.linkPattern.test(url)) return;
      if (this.o.titlePattern && !this.o.titlePattern.test(title)) return;
      if (this.o.excludePattern && (this.o.excludePattern.test(title) || this.o.excludePattern.test(url))) return;
      if (seen.has(url)) return;
      seen.add(url);
      // Satır bağlamı: hücreler/çocuklar ayraçla birleştirilir (cheerio metni ayraçsız birleştirir, "25.09.20262026/39" tarihi gizler)
      const row = $a.closest("tr, li, article, .item, .row, p, div");
      const node = row.length ? row : $a.parent();
      const kids = node.children().toArray().map((c) => $(c).text().replace(/\s+/g, " ").trim()).filter(Boolean);
      const context = (kids.length > 1 ? kids.join(" | ") : node.text()).replace(/\s+/g, " ").trim().slice(0, 400);
      const date = findDate(title) ?? findDate(context) ?? findDate(decodeURIComponent(url).replace(/[_/]/g, " "));
      if (!date && this.o.allowUndated === false) return;
      const item: ListingItem = { title, url, date, publishedAt: date ? atIstanbul(date, this.o.defaultTime ?? "09:00") : (this.o.now ?? (() => new Date()))(), context };
      if (this.o.titleOf) item.title = this.o.titleOf(item);
      items.push(item);
    });
    return items;
  }

  eventsFromHtml(html: string, listUrl?: string): RawEvent[] {
    return this.parse(html, listUrl).map((it) => this.toEvent(it, listUrl));
  }

  toEvent(it: ListingItem, listUrl = this.listUrl): RawEvent {
    const sec = typeof this.o.section === "function" ? this.o.section(it) : this.o.section;
    const payload = { ...sec, date: it.date ?? null, undated: !it.date, listUrl, ext: /\.pdf(\?|$)/i.test(it.url) ? "pdf" : "html" };
    const payloadHash = createHash("sha256").update(`${it.title}|${it.url}`).digest("hex").slice(0, 32);
    return { sourceId: this.id, externalId: externalIdFor(it.url), title: it.title, url: it.url, publishedAt: it.publishedAt, payloadHash, payload };
  }

  async fetchDocument(ev: RawEvent): Promise<FetchedDocument> {
    const doc = await this.download(ev.url);
    if (doc.mime !== "text/html") return doc;
    const html = decodeHtml(doc.bytes, "text/html");
    const $ = cheerio.load(html);
    const main = this.o.documentSelector ? $(this.o.documentSelector) : $("body");
    if (this.o.attachmentPattern) {
      const href = main.find("a[href]").toArray().map((a) => $(a).attr("href") ?? "").find((h) => this.o.attachmentPattern!.test(h));
      if (href) return this.download(new URL(href, ev.url).toString());
    }
    if (this.o.documentSelector && main.length) {
      const body = main.toArray().map((el) => $.html(el)).join("\n");
      return { url: ev.url, mime: "text/html", bytes: Buffer.from(`<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>${ev.title}</title></head><body><main>${body}</main></body></html>`, "utf8") };
    }
    return doc;
  }

  private async download(url: string): Promise<FetchedDocument> {
    const res = await politeFetch(url, this.o.http);
    const bytes = Buffer.from(await res.arrayBuffer());
    const ct = res.headers.get("content-type") ?? "";
    const mime = ct.includes("pdf") || /\.pdf(\?|$)/i.test(url) || bytes.subarray(0, 5).toString("latin1") === "%PDF-" ? "application/pdf" : "text/html";
    return { url, mime, bytes };
  }
}
