import { createHash } from "node:crypto";
import { politeFetch, type PoliteFetchOptions } from "./http.js";
import { StructureError } from "./health.js";
import type { CronLike, FetchedDocument, RawEvent, SourceAdapter } from "./types.js";

/**
 * TÜİK haber bültenleri. Bültenler sabit saatte (10:00 TR) yayımlanır; worker takvim saatinde 30 sn, diğer zamanlarda 15 dk tarar.
 *
 * Canlıda doğrulandı (2026-10-02): data.tuik.gov.tr (RSS dahil) veriportali.tuik.gov.tr'ye yönlenir; yeni portal bir SPA'dır ve
 * bültenleri JSON API'den çeker. API `X-Requested-With: XMLHttpRequest` başlığı olmadan 403/404 döner (robots.txt her şeye izin verir).
 *   GET /api/tr/press/latest → { data: [{ name, period, url: "/tr/press/58239", date: "2026-09-30T10:00:00", type, typeId }] }
 *     typeId 1 = Haber Bülteni (haberleştirilir); 2 = veri tabanı tablosu, 6 = yayın (atlanır). Son 50 kayıt döner.
 *   GET /api/tr/press/58239 → { data: { title, period, date, content: "<h1>…</h1>…" (bülten HTML'i), tables, … } }
 * Taban adres `TUIK_BASE_URL` ile ezilebilir.
 */
export const TUIK_DEFAULT_BASE = "https://veriportali.tuik.gov.tr";

export interface TuikOptions {
  baseUrl?: string;
  http?: PoliteFetchOptions;
}

interface TuikListItem { name?: string; period?: string; url?: string; date?: string; type?: string; typeId?: number }

export function tuikSection(title: string): { section: string; sectionLabel: string } {
  const t = title.toLocaleLowerCase("tr");
  if (/fiyat endeksi|enflasyon/.test(t)) return { section: "fiyat", sectionLabel: "Fiyat İstatistikleri" };
  if (/gayrisafi|büyüme|milli gelir|devlet hesapları/.test(t)) return { section: "buyume", sectionLabel: "Ulusal Hesaplar" };
  if (/işgücü|işsizlik|istihdam/.test(t)) return { section: "isgucu", sectionLabel: "İşgücü" };
  if (/dış ticaret|ihracat|ithalat/.test(t)) return { section: "dis-ticaret", sectionLabel: "Dış Ticaret" };
  if (/sanayi üretim|ciro|kapasite/.test(t)) return { section: "sanayi", sectionLabel: "Sanayi" };
  return { section: "bulten", sectionLabel: "Haber Bülteni" };
}

const API_HEADERS = { accept: "application/json", "x-requested-with": "XMLHttpRequest" };

export class TuikAdapter implements SourceAdapter {
  readonly id = "tuik";
  readonly official = true;
  readonly baseUrl: string;
  private readonly http: PoliteFetchOptions;

  constructor(opts: TuikOptions = {}) {
    this.baseUrl = (opts.baseUrl ?? process.env.TUIK_BASE_URL ?? TUIK_DEFAULT_BASE).replace(/\/$/, "");
    this.http = opts.http ?? {};
  }

  schedule(): CronLike {
    return { timezone: "Europe/Istanbul", windows: [], defaultEverySeconds: 900, hotEverySeconds: 30 };
  }

  listUrl(): string { return `${this.baseUrl}/api/tr/press/latest`; }

  async fetchNew(since: Date): Promise<RawEvent[]> {
    const json = await this.getJson(this.listUrl(), "bülten listesi");
    const list = (json as { data?: unknown }).data;
    if (!Array.isArray(list)) throw new StructureError(this.id, "bülten listesinde data dizisi yok (API değişmiş olabilir)", JSON.stringify(json).slice(0, 400));
    const events = this.eventsFromJson(json);
    if (list.length > 0 && events.length === 0 && list.every((x: TuikListItem) => x.typeId === undefined)) {
      throw new StructureError(this.id, "bültenler çözülemedi (typeId/url alanları değişmiş olabilir)", JSON.stringify(list[0]).slice(0, 400));
    }
    return events.filter((e) => e.publishedAt > since);
  }

  /** Test edilebilir çekirdek: /api/tr/press/latest yanıtı → RawEvent[] (yalnızca haber bültenleri) */
  eventsFromJson(json: unknown): RawEvent[] {
    const list = (json as { data?: TuikListItem[] }).data ?? [];
    const out: RawEvent[] = [];
    for (const it of list) {
      const pressId = /^\/[a-z]{2}\/press\/(\d+)$/.exec(it.url ?? "")?.[1];
      if (it.typeId !== 1 || !pressId || !it.name) continue;
      const title = it.period ? `${it.name}, ${it.period}` : it.name;
      const publishedAt = it.date ? new Date(`${it.date.slice(0, 19)}+03:00`) : new Date();
      out.push({
        sourceId: this.id,
        externalId: `${slug(title)}-${pressId}`,
        title,
        url: `${this.baseUrl}/tr/press/${pressId}`,
        publishedAt: Number.isNaN(publishedAt.getTime()) ? new Date() : publishedAt,
        payloadHash: createHash("sha256").update(`${title}|${pressId}|${it.date ?? ""}`).digest("hex").slice(0, 32),
        payload: { ...tuikSection(it.name), pressId, period: it.period ?? "" },
      });
    }
    return out;
  }

  /** Belge: bülten ayrıntısının HTML gövdesi; kaynak bağlantısı insanların açtığı portal sayfasıdır. */
  async fetchDocument(ev: RawEvent): Promise<FetchedDocument> {
    const pressId = String(ev.payload["pressId"] ?? /(\d+)$/.exec(ev.url)?.[1] ?? "");
    const json = await this.getJson(`${this.baseUrl}/api/tr/press/${pressId}`, "bülten ayrıntısı");
    const d = (json as { data?: { title?: string; period?: string; content?: string } }).data;
    if (!d?.content) throw new StructureError(this.id, "bülten ayrıntısında content yok", JSON.stringify(json).slice(0, 400));
    const html = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>${ev.title}</title></head><body><main>${d.content}</main></body></html>`;
    return { url: ev.url, mime: "text/html", bytes: Buffer.from(html, "utf8") };
  }

  private async getJson(url: string, what: string): Promise<unknown> {
    const res = await politeFetch(url, { ...this.http, headers: { ...API_HEADERS, ...this.http.headers } });
    const body = await res.text();
    let json: unknown;
    try { json = JSON.parse(body); } catch { throw new StructureError(this.id, `${what} JSON değil (engelleme ya da uç nokta değişikliği)`, body.slice(0, 400)); }
    const err = json as { isError?: boolean; message?: string };
    if (err.isError) throw new StructureError(this.id, `${what}: API hata döndü (${err.message ?? "?"})`, body.slice(0, 400));
    return json;
  }
}

function slug(s: string): string {
  return s.toLocaleLowerCase("tr").replace(/[çğıöşü]/g, (c) => ({ ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u" })[c] ?? c)
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}

export const tuik = new TuikAdapter();
