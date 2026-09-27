import * as cheerio from "cheerio";

export type GazetteSection =
  | "kanun" | "cb-karari" | "yonetmelik" | "teblig" | "kurul-karari" | "genelge" | "yargi" | "duzeltme" | "ilan" | "diger";

export const SECTION_LABELS: Record<GazetteSection, string> = {
  kanun: "Kanun", "cb-karari": "Cumhurbaşkanı Kararı", yonetmelik: "Yönetmelik", teblig: "Tebliğ",
  "kurul-karari": "Kurul Kararı", genelge: "Genelge", yargi: "Yargı", duzeltme: "Düzeltme", ilan: "İlân", diger: "Diğer",
};

export interface GazetteItem {
  /** "20250926-3" veya mükerrer için "20250926M1-2" */
  externalId: string;
  issueDate: string;      // YYYY-MM-DD
  issueNo?: number;
  mukerrer?: number;
  seq: number;
  section: GazetteSection;
  sectionLabel: string;   // sayfadaki ham başlık
  title: string;
  url: string;            // mutlak
  ext: "htm" | "pdf";
}

const ITEM_HREF = /^(?:.*\/)?(\d{8})(M(\d+))?-(\d+)\.(htm|pdf)$/i;

const FOLD: Record<string, string> = { İ: "I", Ş: "S", Ğ: "G", Ü: "U", Ö: "O", Ç: "C", Â: "A", Î: "I", Û: "U" };
/** Turkce buyuk harfleri ASCII ye katlar: "TEBLİĞ" -> "TEBLIG" */
export function foldTr(label: string): string {
  return label.toLocaleUpperCase("tr").replace(/[İŞĞÜÖÇÂÎÛ]/g, (c) => FOLD[c] ?? c);
}

export function normalizeSection(label: string): GazetteSection {
  const s = foldTr(label);
  if (s.includes("ILAN")) return "ilan";
  if (s.includes("DUZELTME")) return "duzeltme";
  if (s.includes("CUMHURBASKANI KARAR")) return "cb-karari";
  if (s.includes("KANUN")) return "kanun";
  if (s.includes("YONETMELIK")) return "yonetmelik";
  if (s.includes("TEBLIG")) return "teblig";
  if (s.includes("KURUL KARAR")) return "kurul-karari";
  if (s.includes("GENELGE")) return "genelge";
  if (/ANAYASA MAHKEMESI|YARGITAY|DANISTAY|YARGI|UYUSMAZLIK|SAYISTAY/.test(s)) return "yargi";
  return "diger";
}

export function parseIssueNo(text: string): number | undefined {
  const m = /Say[ıi]\s*:\s*(\d{4,6})/i.exec(text);
  return m ? Number(m[1]) : undefined;
}

/**
 * Günün fihrist sayfasını (eskiler/YYYY/MM/YYYYMMDD.htm) maddelere ayırır.
 * Yapıya dayanmaz: belge sırasıyla gezilir, bölüm başlığı gibi görünen metinler (class'ında
 * "title" geçen div/h* veya tamamı büyük harf kısa satır) "geçerli bölüm" olur; her madde bağlantısı
 * (YYYYMMDD[-M?]-N.htm|pdf) geçerli bölüme yazılır.
 */
export function parseDayPage(html: string, pageUrl: string): GazetteItem[] {
  const $ = cheerio.load(html);
  const items: GazetteItem[] = [];
  const seen = new Set<string>();
  const issueNo = parseIssueNo($("body").text());
  let section = "DİĞER";
  $("body *").each((_, el) => {
    const $el = $(el);
    const tag = (el as unknown as { tagName?: string }).tagName?.toLowerCase() ?? "";
    if (tag === "a") {
      const href = $el.attr("href") ?? "";
      const m = ITEM_HREF.exec(href.trim());
      if (!m) return;
      const [, ymd, , mk, seq, ext] = m;
      const externalId = `${ymd}${mk ? `M${mk}` : ""}-${seq}`;
      if (seen.has(externalId)) return;
      seen.add(externalId);
      const title = $el.text().replace(/^[\s–—-]+/, "").replace(/\s+/g, " ").trim();
      if (!title) return;
      items.push({
        externalId,
        issueDate: `${ymd!.slice(0, 4)}-${ymd!.slice(4, 6)}-${ymd!.slice(6, 8)}`,
        issueNo,
        mukerrer: mk ? Number(mk) : undefined,
        seq: Number(seq),
        section: normalizeSection(section),
        sectionLabel: section,
        title,
        url: new URL(href, pageUrl).toString(),
        ext: ext!.toLowerCase() as "htm" | "pdf",
      });
      return;
    }
    if ($el.find("a").length) return; // kapsayıcı, başlık değil
    const cls = ($el.attr("class") ?? "").toLowerCase();
    const text = $el.text().replace(/\s+/g, " ").trim();
    if (!text || text.length > 120) return;
    const looksHeading = /title|baslik|başlık|section|bolum/.test(cls) || /^h[1-6]$/.test(tag)
      || (text === text.toLocaleUpperCase("tr") && /[A-ZÇĞİÖŞÜ]{4,}/.test(text) && !/^\d/.test(text));
    if (looksHeading) section = text;
  });
  return items;
}
