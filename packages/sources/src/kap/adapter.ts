import { createHash } from "node:crypto";
import { HttpError, politeFetch, type PoliteFetchOptions } from "../http.js";
import { StructureError } from "../health.js";
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
  /**
   * Konusu bu kalıplardan biriyle başlayan bildirimler `payload.routine = true` ile işaretlenir; pipeline bunları belge indirmeden
   * ve modele göndermeden şirket bildirim geçmişine kaydedip atlar. [] işaretlemeyi kapatır.
   */
  routineSubjects?: RegExp[];
  http?: PoliteFetchOptions;
}

const DEFAULT_CLASSES: KapClass[] = ["ODA", "FR", "DG"];

/**
 * Rutin bildirim türleri (2026-10-02 canlı örneklem: sınıf/kod filtresinden sonra olayların ~%40'ı). Haber üretmez; model çağrısı
 * harcamaz ama şirketin bildirim geçmişinde görünür. Pay geri alımı, özel durum, finansal rapor, sermaye artırımı, kâr payı gibi
 * türler listede değildir.
 */
export const KAP_ROUTINE_SUBJECTS: RegExp[] = [
  /^Pay Dışında Sermaye Piyasası Aracı İşlemlerine İlişkin Bildirim/i, // borçlanma aracı ihracı, kupon, itfa
  /^Yatırım Kuruluşu Varant/i,
  /^Piyasa Yapıcılığı Kapsamında/i,
  /^Şirket Genel Bilgi Formu/i,
  /^Tertip İhraç Belgesi/i,
  /^Yatırımcı Raporu/i,
];

/** RawEvent.payload içinde şirket referansı — pipeline `companies`/`company_events` tablolarını buradan besler. */
export interface CompanyRef { code: string; name: string }

export class KapAdapter implements SourceAdapter {
  readonly id = "kap";
  readonly official = true;
  private readonly baseUrl: string;
  private readonly classes: Set<KapClass>;
  private readonly requireStockCode: boolean;
  private readonly skipOldKap: boolean;
  private readonly routineSubjects: RegExp[];
  private readonly http: PoliteFetchOptions;

  constructor(opts: KapOptions = {}) {
    this.baseUrl = (opts.baseUrl ?? "https://www.kap.org.tr").replace(/\/$/, "");
    this.classes = new Set(opts.classes ?? DEFAULT_CLASSES);
    this.requireStockCode = opts.requireStockCode ?? true;
    this.skipOldKap = opts.skipOldKap ?? true;
    this.routineSubjects = opts.routineSubjects ?? KAP_ROUTINE_SUBJECTS;
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

  listUrl(): string { return `${this.baseUrl}/tr/api/disclosure/list/main`; }

  /**
   * Liste gövdesi: `since` gününden bugüne (Türkiye takvimi), en fazla 7 gün geriye. IGS = borsa şirketleri, DDK = diğer
   * kurumlar (borçlanma aracı ihraççıları; çoğunun borsa kodu yoktur → requireStockCode ile elenir).
   */
  listBody(since: Date, now = new Date()): string {
    const from = new Date(Math.max(since.getTime(), now.getTime() - 7 * 86_400_000));
    return JSON.stringify({ fromDate: istanbulDate(from), toDate: istanbulDate(now), memberTypes: ["IGS", "DDK"] });
  }

  async fetchNew(since: Date): Promise<RawEvent[]> {
    const res = await politeFetch(this.listUrl(), {
      ...this.http, method: "POST", body: this.listBody(since),
      headers: { accept: "application/json", "content-type": "application/json", "accept-language": "tr", ...this.http.headers },
    });
    const body = await res.text();
    let json: unknown;
    try { json = JSON.parse(body); } catch { throw new StructureError(this.id, "bildirim listesi JSON değil (engelleme ya da uç nokta değişikliği)", body.slice(0, 400)); }
    const rawCount = Array.isArray(json) ? json.length : json && typeof json === "object" ? Object.keys(json).length : 0;
    if (rawCount > 0 && parseDisclosureList(json, this.baseUrl).length === 0) {
      throw new StructureError(this.id, "bildirimler çözülemedi (disclosureIndex/başlık alanları değişmiş olabilir)", body.slice(0, 400));
    }
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
      routine: this.routineSubjects.some((re) => re.test(d.subject)),
    };
    const payloadHash = createHash("sha256").update(`${d.companyName}|${d.subject}|${d.summary}|${d.stockCodes.join(",")}`).digest("hex").slice(0, 32);
    const title = d.companyName ? `${d.companyName} — ${d.subject}` : d.subject;
    return { sourceId: this.id, externalId: String(d.index), title, url: disclosureUrl(d.index, this.baseUrl), publishedAt: d.publishedAt, payloadHash, payload };
  }

  /**
   * Bildirimin PDF dökümünü indirir (bildirim metninin tamamı); olmazsa bildirim sayfasını dener. Yeni KAP sayfası
   * metni istemci tarafında yüklediğinden HTML'de yalnızca başlık bulunur — bu yüzden PDF önce gelir.
   */
  async fetchDocument(ev: RawEvent): Promise<FetchedDocument> {
    const index = Number(ev.externalId);
    const candidates = [disclosurePdfUrl(index, this.baseUrl), ev.url];
    let lastErr: unknown;
    for (const url of candidates) {
      try {
        const res = await politeFetch(url, this.http);
        const bytes = Buffer.from(await res.arrayBuffer());
        const ct = res.headers.get("content-type") ?? "";
        const mime = ct.includes("pdf") || bytes.subarray(0, 5).toString() === "%PDF-" ? "application/pdf" : "text/html";
        return { url, mime, bytes };
      } catch (e) { lastErr = e; if (!(e instanceof HttpError && (e.status === 404 || e.status === 410))) throw e; }
    }
    throw lastErr;
  }
}

export const kap = new KapAdapter();

/** Türkiye takvimine göre "dd.MM.yyyy" */
function istanbulDate(d: Date): string {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Istanbul", day: "2-digit", month: "2-digit", year: "numeric" }).formatToParts(d).map((x) => [x.type, x.value]));
  return `${p["day"]}.${p["month"]}.${p["year"]}`;
}
