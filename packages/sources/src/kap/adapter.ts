import { createHash } from "node:crypto";
import { HttpError, politeFetch, type PoliteFetchOptions } from "../http.js";
import type { CronLike, FetchedDocument, RawEvent, SourceAdapter } from "../types.js";
import { disclosurePdfUrl, disclosureUrl, parseDisclosureList, type KapClass, type KapDisclosure } from "./parse.js";

export interface KapOptions {
  baseUrl?: string;
  /** Hangi bildirim sınıfları haberleştirilir (şartname: ÖDA, sermaye artırımı, pay alım-satım, finansal rapor, genel kurul) */
  classes?: KapClass[];
  /** Borsa kodu olmayan bildirimler (yatırım fonları, KAP'ın kendi duyuruları) atlanır */
  requireStockCode?: boolean;
  /** Eski KAP'tan taşınan kayıtlar atlanır */
  skipOldKap?: boolean;
  http?: PoliteFetchOptions;
}

const DEFAULT_CLASSES: KapClass[] = ["ODA", "FR", "DG"];

/** RawEvent.payload içinde şirket referansı — pipeline `companies`/`company_events` tablolarını buradan besler. */
export interface CompanyRef { code: string; name: string }

export class KapAdapter implements SourceAdapter {
  readonly id = "kap";
  readonly official = true;
  private readonly baseUrl: string;
  private readonly classes: Set<KapClass>;
  private readonly requireStockCode: boolean;
  private readonly skipOldKap: boolean;
  private readonly http: PoliteFetchOptions;

  constructor(opts: KapOptions = {}) {
    this.baseUrl = (opts.baseUrl ?? "https://www.kap.org.tr").replace(/\/$/, "");
    this.classes = new Set(opts.classes ?? DEFAULT_CLASSES);
    this.requireStockCode = opts.requireStockCode ?? true;
    this.skipOldKap = opts.skipOldKap ?? true;
    this.http = opts.http ?? {};
  }

  /** Şartname §4: piyasa saatlerinde 60 sn, dışında 5 dk. Borsa İstanbul seansı hafta içi 09:30–18:30 (kapanış işlemleri dahil). */
  schedule(): CronLike {
    return {
      timezone: "Europe/Istanbul",
      windows: [{ between: ["09:30", "18:30"], everySeconds: 60, weekdays: [1, 2, 3, 4, 5] }],
      defaultEverySeconds: 300,
    };
  }

  listUrl(): string { return `${this.baseUrl}/tr/api/disclosures`; }

  async fetchNew(since: Date): Promise<RawEvent[]> {
    const res = await politeFetch(this.listUrl(), { ...this.http, headers: { accept: "application/json", ...this.http.headers } });
    const json: unknown = await res.json();
    return this.eventsFromJson(json).filter((e) => e.publishedAt > since);
  }

  /** Test edilebilir çekirdek: liste JSON'u → RawEvent[] (filtreler uygulanmış). */
  eventsFromJson(json: unknown): RawEvent[] {
    return parseDisclosureList(json, this.baseUrl)
      .filter((d) => this.classes.has(d.disclosureClass))
      .filter((d) => !this.skipOldKap || !d.isOldKap)
      .filter((d) => !this.requireStockCode || d.stockCodes.length > 0)
      .map((d) => this.toEvent(d));
  }

  toEvent(d: KapDisclosure): RawEvent {
    const companies: CompanyRef[] = d.stockCodes.map((code) => ({ code, name: d.companyName }));
    const payload = {
      index: d.index, companyName: d.companyName, stockCodes: d.stockCodes, companies,
      section: d.disclosureClass, sectionLabel: d.classLabel, subject: d.subject, summary: d.summary,
      attachmentCount: d.attachmentCount, pdfUrl: disclosurePdfUrl(d.index, this.baseUrl),
    };
    const payloadHash = createHash("sha256").update(`${d.companyName}|${d.subject}|${d.summary}|${d.stockCodes.join(",")}`).digest("hex").slice(0, 32);
    const title = d.companyName ? `${d.companyName} — ${d.subject}` : d.subject;
    return { sourceId: this.id, externalId: String(d.index), title, url: disclosureUrl(d.index, this.baseUrl), publishedAt: d.publishedAt, payloadHash, payload };
  }

  /** Bildirim sayfasını (HTML) indirir; olmazsa PDF dışa aktarımını dener. */
  async fetchDocument(ev: RawEvent): Promise<FetchedDocument> {
    const index = Number(ev.externalId);
    const candidates = [ev.url, disclosurePdfUrl(index, this.baseUrl)];
    let lastErr: unknown;
    for (const url of candidates) {
      try {
        const res = await politeFetch(url, this.http);
        const bytes = Buffer.from(await res.arrayBuffer());
        const ct = res.headers.get("content-type") ?? "";
        const mime = ct.includes("pdf") || /BildirimPdf/.test(url) ? "application/pdf" : "text/html";
        return { url, mime, bytes };
      } catch (e) { lastErr = e; if (!(e instanceof HttpError && (e.status === 404 || e.status === 410))) throw e; }
    }
    throw lastErr;
  }
}

export const kap = new KapAdapter();
