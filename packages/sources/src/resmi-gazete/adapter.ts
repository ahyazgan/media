import { createHash } from "node:crypto";
import { decodeHtml } from "../extract.js";
import { looksLikeBlockPage, StructureError } from "../health.js";
import { politeFetch, HttpError, type PoliteFetchOptions } from "../http.js";
import type { CronLike, FetchedDocument, RawEvent, SourceAdapter } from "../types.js";
import { parseDayPage, type GazetteItem, type GazetteSection } from "./parse.js";

export interface ResmiGazeteOptions {
  baseUrl?: string;
  /** Hangi bölümler haberleştirilir (şartname: Yönetmelik, Tebliğ, CB Kararı, Kanun, Yargı; kurul kararı ve genelge eklendi) */
  sections?: GazetteSection[];
  /** since'ten geriye en fazla kaç gün taransın */
  maxDays?: number;
  /** Mükerrer sayı denemesi (M1..Mn) */
  maxMukerrer?: number;
  http?: PoliteFetchOptions;
  now?: () => Date;
}

const DEFAULT_SECTIONS: GazetteSection[] = ["kanun", "cb-karari", "yonetmelik", "teblig", "kurul-karari", "genelge", "yargi"];

/** Resmi Gazete günü Türkiye saatiyle ~00:00–07:00 arasında yayımlanır; publishedAt olarak 03:00 UTC (06:00 TR) verilir. */
export function issueDateToPublishedAt(issueDate: string): Date {
  return new Date(`${issueDate}T03:00:00.000Z`);
}

export function dayPageUrl(baseUrl: string, issueDate: string, mukerrer?: number): string {
  const [y, m, d] = issueDate.split("-");
  return `${baseUrl}/eskiler/${y}/${m}/${y}${m}${d}${mukerrer ? `M${mukerrer}` : ""}.htm`;
}

export class ResmiGazeteAdapter implements SourceAdapter {
  readonly id = "resmi-gazete";
  readonly official = true;
  private readonly baseUrl: string;
  private readonly sections: Set<GazetteSection>;
  private readonly maxDays: number;
  private readonly maxMukerrer: number;
  private readonly http: PoliteFetchOptions;
  private readonly now: () => Date;
  private readonly dayCache = new Map<string, { at: number; events: RawEvent[] }>();

  constructor(opts: ResmiGazeteOptions = {}) {
    this.baseUrl = (opts.baseUrl ?? "https://www.resmigazete.gov.tr").replace(/\/$/, "");
    this.sections = new Set(opts.sections ?? DEFAULT_SECTIONS);
    this.maxDays = opts.maxDays ?? 7;
    this.maxMukerrer = opts.maxMukerrer ?? 3;
    this.http = opts.http ?? {};
    this.now = opts.now ?? (() => new Date());
  }

  /**
   * Resmi Gazete gece yarısı (00:00 civarı) yayımlanır, mükerrerler de çoğunlukla gece çıkar: 23:30–03:00 arası 2 dk
   * (hedef: yayından <10 dk). Sabah 06:00–10:00 arası 3 dk (gecikmeli/mükerrer sayılar), diğer zamanlarda 30 dk.
   * Pencereler gece yarısını aşamadığı için iki parçadır.
   */
  schedule(): CronLike {
    return {
      timezone: "Europe/Istanbul",
      windows: [
        // Yayın anı (gece yarısı): 23:58–00:10 arası 15 sn; ilk eşleşen pencere geçerli olduğundan önce gelir
        { between: ["23:58", "23:59"], everySeconds: 15 },
        { between: ["00:00", "00:10"], everySeconds: 15 },
        { between: ["23:30", "23:59"], everySeconds: 120 },
        { between: ["00:00", "03:00"], everySeconds: 120 },
        { between: ["06:00", "10:00"], everySeconds: 180 },
      ],
      defaultEverySeconds: 1800,
    };
  }

  /** since tarihinden bugüne kadar her günün fihristini (ve mükerrerlerini) çeker. */
  async fetchNew(since: Date): Promise<RawEvent[]> {
    const now = this.now();
    const days = this.datesBetween(since, now);
    const today = days[days.length - 1];
    const out: RawEvent[] = [];
    for (const issueDate of days) {
      // Geçmiş günler 10 dk içinde yeniden istenmez (gece 15 sn'lik taramada yalnızca bugünün fihristi istensin)
      const cached = issueDate !== today ? this.dayCache.get(issueDate) : undefined;
      if (cached && now.getTime() - cached.at < 10 * 60_000) { out.push(...cached.events); continue; }
      const events: RawEvent[] = [];
      const main = await this.fetchDay(issueDate);
      events.push(...main);
      if (main.length > 0) { // o gün Gazete yok (ör. tatil) → mükerrer aranmaz
        for (let k = 1; k <= this.maxMukerrer; k++) {
          const mk = await this.fetchDay(issueDate, k);
          if (mk.length === 0) break;
          events.push(...mk);
        }
      }
      this.dayCache.set(issueDate, { at: now.getTime(), events });
      out.push(...events);
    }
    return out;
  }

  async fetchDay(issueDate: string, mukerrer?: number): Promise<RawEvent[]> {
    const url = dayPageUrl(this.baseUrl, issueDate, mukerrer);
    let html: string;
    try {
      const res = await politeFetch(url, this.http);
      html = decodeHtml(Buffer.from(await res.arrayBuffer()), res.headers.get("content-type"));
    } catch (e) {
      if (e instanceof HttpError && e.status === 404) return [];
      throw e;
    }
    if (!mukerrer) {
      if (looksLikeBlockPage(html) || !/resm[iîİ]\s*gazete/i.test(html)) {
        throw new StructureError(this.id, "fihrist yerine beklenmeyen sayfa geldi (engelleme, yönlendirme ya da yeniden tasarım)", html.slice(0, 400));
      }
      if (parseDayPage(html, url).length === 0) {
        throw new StructureError(this.id, "fihristte hiç madde bağlantısı bulunamadı; sayfa yapısı değişmiş olabilir", html.slice(0, 400));
      }
    }
    return this.eventsFromHtml(html, url);
  }

  /** Test edilebilir çekirdek: fihrist HTML → RawEvent[] */
  eventsFromHtml(html: string, pageUrl: string): RawEvent[] {
    return parseDayPage(html, pageUrl)
      .filter((it) => this.sections.has(it.section))
      .map((it) => this.toEvent(it));
  }

  toEvent(it: GazetteItem): RawEvent {
    const payload = {
      issueDate: it.issueDate, issueNo: it.issueNo, mukerrer: it.mukerrer, seq: it.seq,
      section: it.section, sectionLabel: it.sectionLabel, ext: it.ext,
    };
    const payloadHash = createHash("sha256").update(`${it.title}|${it.url}|${it.section}`).digest("hex").slice(0, 32);
    return {
      sourceId: this.id, externalId: it.externalId, title: it.title, url: it.url,
      publishedAt: issueDateToPublishedAt(it.issueDate), payloadHash, payload,
    };
  }

  /** Maddeyi indirir; .htm 404 verirse .pdf dener (bazı kararlar yalnızca PDF). */
  async fetchDocument(ev: RawEvent): Promise<FetchedDocument> {
    const candidates = [ev.url];
    if (/\.htm$/i.test(ev.url)) candidates.push(ev.url.replace(/\.htm$/i, ".pdf"));
    let lastErr: unknown;
    for (const url of candidates) {
      try {
        const res = await politeFetch(url, this.http);
        const bytes = Buffer.from(await res.arrayBuffer());
        const ct = res.headers.get("content-type") ?? "";
        const mime = ct.includes("pdf") || url.endsWith(".pdf") ? "application/pdf" : "text/html";
        return { url, mime, bytes };
      } catch (e) { lastErr = e; if (!(e instanceof HttpError && e.status === 404)) throw e; }
    }
    throw lastErr;
  }

  /**
   * Türkiye takvimine göre günler (kalıcı UTC+3). UTC günü kullanılırsa TR 00:00–03:00 arası hâlâ önceki gün sayılır ve gece
   * yarısı çıkan yeni sayı 03:00'e kadar hiç istenmez.
   */
  private datesBetween(since: Date, now: Date): string[] {
    const out: string[] = [];
    const TR = 3 * 3_600_000;
    const start = new Date(Math.max(since.getTime(), now.getTime() - this.maxDays * 86_400_000) + TR);
    const trNow = new Date(now.getTime() + TR);
    const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
    const end = new Date(Date.UTC(trNow.getUTCFullYear(), trNow.getUTCMonth(), trNow.getUTCDate()));
    while (d <= end) { out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1); }
    return out;
  }
}

export const resmiGazete = new ResmiGazeteAdapter();
