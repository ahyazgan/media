import * as cheerio from "cheerio";
import { createHash } from "node:crypto";

/** RSS 2.0 / Atom 1.0 ortak öğe biçimi. */
export interface FeedItem {
  id: string;          // guid/id ya da bağlantıdan türetilmiş
  title: string;
  link: string;        // mutlak
  publishedAt?: Date;
  summary?: string;
}

/**
 * RSS 2.0 ve Atom 1.0 besleme ayrıştırıcısı (TCMB basın duyuruları, TÜİK haber bültenleri). Şemaya sıkı bağlı değildir:
 * `item` ya da `entry` düğümlerini gezer, tarih için pubDate/dc:date/published/updated sırasıyla bakar.
 */
export function parseFeed(xml: string, baseUrl?: string): FeedItem[] {
  const $ = cheerio.load(xml, { xml: { xmlMode: true, decodeEntities: true } });
  const nodes = $("item").length ? $("item") : $("entry");
  const out: FeedItem[] = [];
  const seen = new Set<string>();
  nodes.each((_, el) => {
    const $el = $(el);
    const title = clean($el.children("title").first().text());
    let link = $el.children("link").first().attr("href") ?? clean($el.children("link").first().text());
    if (!link) link = clean($el.children("guid").first().text());
    if (!title || !link) return;
    try { link = upgradeHttp(new URL(link, baseUrl), baseUrl).toString(); } catch { return; }
    const dateText = ["pubDate", "dc\\:date", "published", "updated", "date"].map((t) => clean($el.children(t).first().text())).find(Boolean);
    const publishedAt = dateText ? parseFeedDate(dateText) : undefined;
    const summary = clean($el.children("description").first().text() || $el.children("summary").first().text() || $el.children("content").first().text());
    const guid = clean($el.children("guid").first().text() || $el.children("id").first().text());
    // Göreli yol biçimli kimlik (TCMB Atom: "/wps/wcm/connect/...") bağlantıyla aynı şeyi söyler; okunur kimlik bağlantıdan türetilir
    const id = externalIdFor(guid && !/^(https?:|\/)/i.test(guid) ? guid : link);
    if (seen.has(id)) return;
    seen.add(id);
    out.push({ id, title, link, publishedAt, summary: summary ? stripTags(summary).slice(0, 500) : undefined });
  });
  return out;
}

const TR_MONTHS: Record<string, string> = { oca: "01", şub: "02", mar: "03", nis: "04", may: "05", haz: "06", tem: "07", ağu: "08", eyl: "09", eki: "10", kas: "11", ara: "12" };

/**
 * RFC 822 (RSS), ISO 8601 (Atom), "dd.MM.yyyy[ HH:mm]" ve TCMB Atom'unun "1 Eki 2026 14:00:00" biçimini kabul eder
 * (son ikisi saat dilimi taşımaz → Türkiye saati).
 */
export function parseFeedDate(s: string): Date | undefined {
  const tr = /^(\d{2})\.(\d{2})\.(\d{4})(?:[ T](\d{2}):(\d{2}))?$/.exec(s.trim());
  if (tr) return new Date(`${tr[3]}-${tr[2]}-${tr[1]}T${tr[4] ?? "00"}:${tr[5] ?? "00"}:00+03:00`);
  const named = /^(\d{1,2})\s+(\S+)\s+(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(s.trim());
  const month = named && TR_MONTHS[named[2]!.toLocaleLowerCase("tr").slice(0, 3)];
  if (named && month) return new Date(`${named[3]}-${month}-${named[1]!.padStart(2, "0")}T${named[4] ?? "00"}:${named[5] ?? "00"}:${named[6] ?? "00"}+03:00`);
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/**
 * Bağlantıdan okunabilir, kararlı bir externalId: sorgu parametresi `p` (TÜİK: ?p=Tuketici-Fiyat-Endeksi-Eylul-2026-53912)
 * ya da yolun son anlamlı parçası; hiçbiri yoksa kısa hash. Uzunluk 80 ile sınırlanır, sonuna URL hash'i eklenir ki çakışmasın.
 */
export function externalIdFor(linkOrGuid: string): string {
  const h = createHash("sha1").update(linkOrGuid).digest("hex").slice(0, 8);
  let base = "";
  try {
    const u = new URL(linkOrGuid);
    base = u.searchParams.get("p") ?? u.pathname.split("/").filter(Boolean).pop() ?? "";
  } catch { base = linkOrGuid; }
  base = base.toLocaleLowerCase("tr").replace(/[çğıöşü]/g, (c) => ({ ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u" })[c] ?? c)
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
  return base ? `${base}-${h}` : h;
}

/** Besleme HTTPS iken aynı sunucuya verilen http:// bağlantıları (TCMB Atom) https'e yükseltilir. */
function upgradeHttp(u: URL, baseUrl?: string): URL {
  if (u.protocol !== "http:" || !baseUrl) return u;
  try {
    const b = new URL(baseUrl);
    if (b.protocol === "https:" && b.hostname === u.hostname) u.protocol = "https:";
  } catch { /* geçersiz taban adresi: dokunma */ }
  return u;
}

const clean = (s: string) => s.replace(/\s+/g, " ").trim();
const stripTags = (s: string) => cheerio.load(`<div>${s}</div>`)("div").text().replace(/\s+/g, " ").trim();
