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

  async fetchNew(since: Date): Promise<RawEvent[]> {
    const res = await politeFetch(this.listUrl, this.o.http);
    const html = decodeHtml(Buffer.from(await res.arrayBuffer()), res.headers.get("content-type"));
    if (looksLikeBlockPage(html)) throw new StructureError(this.id, "liste yerine engelleme sayfası geldi", html.slice(0, 400));
    if (this.parse(html).length === 0) throw new StructureError(this.id, "liste sayfasında duyuru bağlantısı bulunamadı; seçici ya da sayfa yapısı değişmiş olabilir", html.slice(0, 400));
    return this.eventsFromHtml(html).filter((e) => e.payload["undated"] === true || e.publishedAt > since);
  }

  /** Test edilebilir çekirdek: liste HTML → ListingItem[] */
  parse(html: string): ListingItem[] {
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
      try { url = new URL(href, this.listUrl).toString(); } catch { return; }
      const title = ($a.text().replace(/\s+/g, " ").trim() || $a.attr("title") || "").trim();
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
      items.push({ title, url, date, publishedAt: date ? atIstanbul(date, this.o.defaultTime ?? "09:00") : (this.o.now ?? (() => new Date()))(), context });
    });
    return items;
  }

  eventsFromHtml(html: string): RawEvent[] {
    return this.parse(html).map((it) => this.toEvent(it));
  }

  toEvent(it: ListingItem): RawEvent {
    const sec = typeof this.o.section === "function" ? this.o.section(it) : this.o.section;
    const payload = { ...sec, date: it.date ?? null, undated: !it.date, listUrl: this.listUrl, ext: /\.pdf(\?|$)/i.test(it.url) ? "pdf" : "html" };
    const payloadHash = createHash("sha256").update(`${it.title}|${it.url}`).digest("hex").slice(0, 32);
    return { sourceId: this.id, externalId: externalIdFor(it.url), title: it.title, url: it.url, publishedAt: it.publishedAt, payloadHash, payload };
  }

  async fetchDocument(ev: RawEvent): Promise<FetchedDocument> {
    const res = await politeFetch(ev.url, this.o.http);
    const bytes = Buffer.from(await res.arrayBuffer());
    const ct = res.headers.get("content-type") ?? "";
    const mime = ct.includes("pdf") || /\.pdf(\?|$)/i.test(ev.url) || bytes.subarray(0, 5).toString("latin1") === "%PDF-" ? "application/pdf" : "text/html";
    return { url: ev.url, mime, bytes };
  }
}
