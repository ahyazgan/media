import { createHash } from "node:crypto";
import { politeFetch, type PoliteFetchOptions } from "../http.js";
import { StructureError } from "../health.js";
import type { CronLike, FetchedDocument, RawEvent, SourceAdapter } from "../types.js";
import { parseFeed, type FeedItem } from "./parse.js";

export interface FeedAdapterOptions {
  id: string;
  official?: boolean;
  feedUrl: string;
  schedule: CronLike;
  /** Başlığa göre bölüm etiketi (classify'a "section" olarak gider) */
  sectionOf?: (item: FeedItem) => { section: string; sectionLabel: string };
  /** false dönerse öğe atlanır (ör. İngilizce kopyalar) */
  accept?: (item: FeedItem) => boolean;
  /** Belge indirilirken bağlantı dönüştürülür (ör. yazdırma görünümü) */
  documentUrl?: (ev: RawEvent) => string;
  http?: PoliteFetchOptions;
}

/**
 * RSS/Atom tabanlı kaynaklar için ortak adapter (TCMB, TÜİK). Besleme URL'si ortam değişkeninden ezilebilir;
 * her öğe bir RawEvent olur, belge öğenin bağlantısındaki HTML sayfadır.
 */
export class FeedAdapter implements SourceAdapter {
  readonly id: string;
  readonly official: boolean;
  readonly feedUrl: string;
  private readonly opts: FeedAdapterOptions;

  constructor(opts: FeedAdapterOptions) {
    this.opts = opts;
    this.id = opts.id;
    this.official = opts.official ?? true;
    this.feedUrl = opts.feedUrl;
  }

  schedule(): CronLike { return this.opts.schedule; }

  async fetchNew(since: Date): Promise<RawEvent[]> {
    const res = await politeFetch(this.feedUrl, { ...this.opts.http, headers: { accept: "application/rss+xml, application/atom+xml, application/xml;q=0.9, */*;q=0.5", ...this.opts.http?.headers } });
    const xml = await res.text();
    if (!/<(rss|feed|rdf:RDF)[\s>]/i.test(xml)) throw new StructureError(this.id, "besleme RSS/Atom değil (adres değişmiş ya da engelleme)", xml.slice(0, 400));
    if (/<(item|entry)[\s>]/i.test(xml) && parseFeed(xml, this.feedUrl).length === 0) {
      throw new StructureError(this.id, "beslemede öğe var ama çözülemedi (alan adları değişmiş olabilir)", xml.slice(0, 400));
    }
    return this.eventsFromXml(xml).filter((e) => e.publishedAt > since);
  }

  /** Test edilebilir çekirdek: besleme XML → RawEvent[] */
  eventsFromXml(xml: string): RawEvent[] {
    return parseFeed(xml, this.feedUrl)
      .filter((it) => this.opts.accept?.(it) ?? true)
      .map((it) => this.toEvent(it));
  }

  toEvent(it: FeedItem): RawEvent {
    const sec = this.opts.sectionOf?.(it) ?? { section: "duyuru", sectionLabel: "Duyuru" };
    const payload = { ...sec, summary: it.summary ?? "", feedId: it.id };
    const payloadHash = createHash("sha256").update(`${it.title}|${it.link}|${it.summary ?? ""}`).digest("hex").slice(0, 32);
    return { sourceId: this.id, externalId: it.id, title: it.title, url: it.link, publishedAt: it.publishedAt ?? new Date(), payloadHash, payload };
  }

  async fetchDocument(ev: RawEvent): Promise<FetchedDocument> {
    const url = this.opts.documentUrl?.(ev) ?? ev.url;
    const res = await politeFetch(url, this.opts.http);
    const bytes = Buffer.from(await res.arrayBuffer());
    const ct = res.headers.get("content-type") ?? "";
    const mime = ct.includes("pdf") || /\.pdf($|\?)/i.test(url) ? "application/pdf" : "text/html";
    return { url, mime, bytes };
  }
}
