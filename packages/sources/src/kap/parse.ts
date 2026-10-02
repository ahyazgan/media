/**
 * KAP (kap.org.tr) bildirim listesi ayrıştırıcısı.
 *
 * Kaynak (canlıda doğrulandı 2026-10-02): `POST https://www.kap.org.tr/tr/api/disclosure/list/main` gövdesi
 * `{ fromDate: "dd.MM.yyyy", toDate: "dd.MM.yyyy", memberTypes: ["IGS","DDK"] }` — sitenin ana sayfasının kullandığı, kimlik
 * doğrulaması istemeyen JSON uç noktası; her kayıt `{ disclosureBasic: {...}, disclosureDetail: {...} }` biçimindedir
 * (unvan `companyTitle`, kodlar `stockCode: "NRBNK, NYB"`, eski KAP işareti `disclosureDetail.oldKap`). Eski uç
 * `GET /tr/api/disclosures` (`{ basic, detail }`, `kapTitle`) artık yanıt vermiyor. Alan adları KAP'ın sürümüyle
 * oynayabildiğinden ayrıştırıcı hoşgörülüdür: iki sarmalayıcıyı, düz nesneleri ve alan adı eş anlamlılarını kabul eder.
 * Gerçek bir kopya için: `pnpm --filter @kaynak/sources capture:kap`.
 */

/** KAP bildirim sınıfları (disclosureClass). */
export type KapClass = "ODA" | "FR" | "DG" | "DUY" | "diger";

export const KAP_CLASS_LABELS: Record<KapClass, string> = {
  ODA: "Özel Durum Açıklaması",
  FR: "Finansal Rapor",
  DG: "Diğer Bildirim",
  DUY: "Duyuru",
  diger: "Diğer",
};

export interface KapDisclosure {
  /** KAP bildirim numarası (disclosureIndex) — externalId olarak kullanılır */
  index: number;
  publishedAt: Date;
  /** Şirketin KAP'taki tam unvanı (kapTitle) */
  companyName: string;
  /** Borsa kodları: "ISCTR, ISBTR" → ["ISCTR", "ISBTR"] */
  stockCodes: string[];
  disclosureClass: KapClass;
  classLabel: string;
  /** Bildirim konusu (ruleTypeTerm ya da title): "Payların Geri Alınmasına İlişkin Bildirim" */
  subject: string;
  summary: string;
  /** Eski KAP sisteminden taşınan kayıt (yeniden yayınlanır; haber değildir) */
  isOldKap: boolean;
  attachmentCount: number;
  /** Bildirim sayfası (HTML) */
  url: string;
}

const DEFAULT_BASE = "https://www.kap.org.tr";

export function disclosureUrl(index: number, baseUrl = DEFAULT_BASE): string {
  return `${baseUrl.replace(/\/$/, "")}/tr/Bildirim/${index}`;
}
/** Bildirimin PDF dökümü (2026-10'dan beri /tr/api altında; eski /tr/BildirimPdf 404 döner) */
export function disclosurePdfUrl(index: number, baseUrl = DEFAULT_BASE): string {
  return `${baseUrl.replace(/\/$/, "")}/tr/api/BildirimPdf/${index}`;
}

/** "07.09.2025 18:31:24" (Türkiye saati; Türkiye 2016'dan beri kalıcı UTC+3) → Date */
export function parseKapDate(s: string | undefined | null): Date | undefined {
  if (!s) return undefined;
  const m = /^(\d{2})\.(\d{2})\.(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(s.trim());
  if (m) {
    const [, dd, MM, yyyy, HH = "00", mm = "00", ss = "00"] = m;
    return new Date(`${yyyy}-${MM}-${dd}T${HH}:${mm}:${ss}+03:00`);
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export function splitStockCodes(s: unknown): string[] {
  if (Array.isArray(s)) return [...new Set(s.flatMap(splitStockCodes))];
  if (typeof s !== "string") return [];
  return [...new Set(s.split(/[,;/\s]+/).map((c) => c.trim().toUpperCase()).filter((c) => /^[A-Z0-9]{3,6}$/.test(c)))];
}

export function normalizeKapClass(v: unknown): KapClass {
  const s = String(v ?? "").trim().toUpperCase();
  if (s === "ODA" || s.startsWith("OZEL") || s.startsWith("ÖZEL")) return "ODA";
  if (s === "FR" || s.startsWith("FINANSAL") || s.startsWith("FİNANSAL")) return "FR";
  if (s === "DG" || s.startsWith("DIGER") || s.startsWith("DİĞER")) return "DG";
  if (s === "DUY" || s.startsWith("DUYURU")) return "DUY";
  return "diger";
}

type Rec = Record<string, unknown>;
const str = (o: Rec, ...keys: string[]): string => {
  for (const k of keys) { const v = o[k]; if (typeof v === "string" && v.trim()) return v.trim(); if (typeof v === "number") return String(v); }
  return "";
};

/** Tek bir liste kaydını KapDisclosure'a çevirir; zorunlu alanlar (index, tarih) yoksa undefined. */
export function parseDisclosure(raw: unknown, baseUrl = DEFAULT_BASE): KapDisclosure | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const outer = raw as Rec;
  const wrap = outer["disclosureBasic"] ?? outer["basic"];
  const basic = (wrap && typeof wrap === "object" ? wrap : outer) as Rec;
  const detailRaw = outer["disclosureDetail"] ?? outer["detail"];
  const detail = (detailRaw && typeof detailRaw === "object" ? detailRaw : {}) as Rec;
  const index = Number(str(basic, "disclosureIndex", "index", "id"));
  if (!Number.isInteger(index) || index <= 0) return undefined;
  const publishedAt = parseKapDate(str(basic, "publishDate", "publishedAt", "date"));
  if (!publishedAt) return undefined;
  const cls = normalizeKapClass(str(basic, "disclosureClass", "disclosureCategory", "class"));
  const subject = str(basic, "ruleTypeTerm", "subject", "title") || KAP_CLASS_LABELS[cls];
  return {
    index, publishedAt,
    companyName: str(basic, "kapTitle", "companyTitle", "companyName", "company"),
    stockCodes: splitStockCodes(basic["stockCodes"] ?? basic["relatedStocks"] ?? basic["stockCode"]),
    disclosureClass: cls, classLabel: KAP_CLASS_LABELS[cls],
    subject, summary: str(basic, "summary", "disclosureSummary"),
    isOldKap: [basic["isOldKap"], detail["oldKap"]].some((v) => v === true || v === "true"),
    attachmentCount: Number(basic["attachmentCount"] ?? 0) || 0,
    url: disclosureUrl(index, baseUrl),
  };
}

/** Liste yanıtı (dizi ya da `{ data: [...] }` / `{ disclosures: [...] }`) → KapDisclosure[]; yeniden eskiye sıralı. */
export function parseDisclosureList(json: unknown, baseUrl = DEFAULT_BASE): KapDisclosure[] {
  let arr: unknown[] = [];
  if (Array.isArray(json)) arr = json;
  else if (json && typeof json === "object") {
    const o = json as Rec;
    const inner = o["data"] ?? o["disclosures"] ?? o["items"] ?? o["content"];
    if (Array.isArray(inner)) arr = inner;
  }
  const out: KapDisclosure[] = [];
  const seen = new Set<number>();
  for (const it of arr) {
    const d = parseDisclosure(it, baseUrl);
    if (d && !seen.has(d.index)) { seen.add(d.index); out.push(d); }
  }
  return out.sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime() || b.index - a.index);
}

/** Kısa şirket adı: "TÜPRAŞ-TÜRKİYE PETROL RAFİNERİLERİ A.Ş." → "TÜPRAŞ"; "ÖRNEK ENERJİ A.Ş." → "Örnek Enerji" */
export function shortCompanyName(name: string): string {
  const first = name.split(/\s*[-–—]\s*/)[0]?.trim() ?? name;
  // Şirket türü ve faaliyet ekleri atılır; JS'de \b Türkçe harfleri tanımadığından sözcük sözcük süzülür.
  const DROP = new Set(["A.Ş.", "A.Ş", "AŞ", "T.A.Ş.", "T.A.Ş", "HOLDİNG", "HOLDING", "SANAYİ", "SANAYI", "VE", "TİCARET", "TICARET"]);
  const words = first.split(/\s+/).filter((w) => !DROP.has(w.toLocaleUpperCase("tr")));
  const base = words.join(" ").trim() || first;
  // Tamamı büyük harfse baş harfleri büyük yap (3 harf ve altı kısaltmalar korunur)
  if (base === base.toLocaleUpperCase("tr")) {
    return base.split(" ").map((w) => (w.length <= 3 ? w : w[0]! + w.slice(1).toLocaleLowerCase("tr"))).join(" ");
  }
  return base;
}
