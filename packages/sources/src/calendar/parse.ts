import * as cheerio from "cheerio";

/** Makro takvim girdisi (calendar_events satırı). */
export interface CalendarEntry {
  institution: "tcmb" | "tuik";
  title: string;
  scheduledAt: Date;
  sourceUrl?: string;
}

const MONTHS: Record<string, number> = {
  ocak: 1, şubat: 2, subat: 2, mart: 3, nisan: 4, mayıs: 5, mayis: 5, haziran: 6, temmuz: 7,
  ağustos: 8, agustos: 8, eylül: 9, eylul: 9, ekim: 10, kasım: 11, kasim: 11, aralık: 12, aralik: 12,
};
const TEXT_DATE = /(?<!\d)(\d{1,2})\s+(ocak|şubat|subat|mart|nisan|mayıs|mayis|haziran|temmuz|ağustos|agustos|eylül|eylul|ekim|kasım|kasim|aralık|aralik)\s+(\d{4})(?!\d)/giu;
const NUM_DATE = /(?<!\d)(\d{1,2})[./](\d{1,2})[./](\d{4})(?!\d)/g;
const ISO_DATE = /(?<!\d)(\d{4})-(\d{2})-(\d{2})(?!\d)/g;
const TIME = /(?<!\d)(\d{1,2})[:.](\d{2})(?!\d)/;

/** Metindeki ilk tarihi (Türkçe metin, dd.MM.yyyy ya da ISO) YYYY-MM-DD olarak döndürür. */
export function findDate(text: string): string | undefined {
  const t = new RegExp(TEXT_DATE.source, "iu").exec(text);
  if (t) return iso(t[3]!, MONTHS[t[2]!.toLocaleLowerCase("tr")] ?? 0, t[1]!);
  const n = new RegExp(NUM_DATE.source).exec(text);
  if (n) return iso(n[3]!, Number(n[2]), n[1]!);
  const i = new RegExp(ISO_DATE.source).exec(text);
  if (i) return `${i[1]}-${i[2]}-${i[3]}`;
  return undefined;
}
export function findAllDates(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(TEXT_DATE)) out.push(iso(m[3]!, MONTHS[m[2]!.toLocaleLowerCase("tr")] ?? 0, m[1]!));
  for (const m of text.matchAll(NUM_DATE)) out.push(iso(m[3]!, Number(m[2]), m[1]!));
  for (const m of text.matchAll(ISO_DATE)) out.push(`${m[1]}-${m[2]}-${m[3]}`);
  return [...new Set(out)];
}
const iso = (y: string, m: number, d: string) => `${y}-${String(m).padStart(2, "0")}-${d.padStart(2, "0")}`;

/** Türkiye saatiyle (kalıcı UTC+3) tarih+saat → Date */
export function atIstanbul(isoDate: string, hhmm: string): Date {
  return new Date(`${isoDate}T${hhmm}:00+03:00`);
}

/**
 * TÜİK Ulusal Veri Yayımlama Takvimi: satır başına bir bülten (tarih + ad [+ saat]). Tablo satırları (tr) ya da liste
 * öğeleri (li) gezilir; tarih içeren hücre + en uzun metinli hücre alınır. Saat yoksa 10:00 (bültenler sabit saatte çıkar).
 */
export function parseTuikCalendar(html: string, opts: { sourceUrl?: string; defaultTime?: string } = {}): CalendarEntry[] {
  const $ = cheerio.load(html);
  const rows = $("tr").length ? $("tr") : $("li");
  const out: CalendarEntry[] = [];
  const seen = new Set<string>();
  rows.each((_, row) => {
    const cells = $(row).children("td, th, div, span, p").toArray().map((c) => $(c).text().replace(/\s+/g, " ").trim()).filter(Boolean);
    const texts = cells.length ? cells : [$(row).text().replace(/\s+/g, " ").trim()];
    const joined = texts.join(" | ");
    const date = findDate(joined);
    if (!date) return;
    const timeM = TIME.exec(texts.find((t) => TIME.test(t) && !findDate(t)) ?? joined.replace(new RegExp(NUM_DATE.source), ""));
    const time = timeM ? `${timeM[1]!.padStart(2, "0")}:${timeM[2]}` : (opts.defaultTime ?? "10:00");
    let title = texts.filter((t) => !findDate(t) && !/^\d{1,2}[:.]\d{2}$/.test(t)).sort((a, b) => b.length - a.length)[0];
    if (!title && texts.length === 1) {
      // Tek metinli satır ("12.11.2026 — Sanayi Üretim Endeksi"): tarih ve saat çıkarılır, ayraçlar temizlenir
      title = texts[0]!.replace(TEXT_DATE, " ").replace(NUM_DATE, " ").replace(ISO_DATE, " ").replace(new RegExp(TIME.source), " ")
        .replace(/[\s|–—-]+/g, " ").trim();
    }
    if (!title || title.length < 4 || /^(tarih|bülten|saat)$/i.test(title)) return;
    const key = `${date}|${title}`;
    if (seen.has(key)) return;
    seen.add(key);
    const href = $(row).find("a[href]").first().attr("href");
    out.push({ institution: "tuik", title, scheduledAt: atIstanbul(date, time), sourceUrl: href ? safeUrl(href, opts.sourceUrl) : opts.sourceUrl });
  });
  return out.sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
}

/**
 * TCMB PPK toplantı takvimi: sayfadaki tüm tarihler (tablo ya da liste) toplantı günüdür; karar 14:00'te açıklanır.
 * Aynı sayfada başka takvimler (Enflasyon Raporu vb.) varsa `title` içeren satır etiketi kullanılır.
 */
export function parseTcmbCalendar(html: string, opts: { sourceUrl?: string; year?: number } = {}): CalendarEntry[] {
  const $ = cheerio.load(html);
  $("script, style, nav, header, footer").remove();
  const out: CalendarEntry[] = [];
  const seen = new Set<string>();
  const push = (date: string, label: string, time: string) => {
    if (opts.year && !date.startsWith(`${opts.year}-`)) return;
    const key = `${date}|${label}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ institution: "tcmb", title: label, scheduledAt: atIstanbul(date, time), sourceUrl: opts.sourceUrl });
  };
  // Tablo: sütun başlığı "özet" / "rapor" gibi bir etiket taşıyorsa o sütundaki tarihler o etiketi alır.
  const headerLabels: (ReturnType<typeof labelFor> | undefined)[] = [];
  $("tr").first().children("th, td").each((i, th) => { const t = $(th).text().toLocaleLowerCase("tr"); headerLabels[i] = /özet|rapor|istikrar/.test(t) ? labelFor(t) : undefined; });
  const rows = $("tr, li").toArray();
  for (const r of rows) {
    const cells = $(r).children("td, th").toArray().map((c) => $(c).text().replace(/\s+/g, " ").trim());
    const rowText = (cells.length ? cells : [$(r).text()]).join(" | ").replace(/\s+/g, " ").trim();
    if (!findAllDates(rowText).length) continue;
    const rowLabel = labelFor(rowText);
    if (cells.length) {
      cells.forEach((cell, i) => { const label = headerLabels[i] ?? rowLabel; for (const d of findAllDates(cell)) push(d, label.title, label.time); });
    } else {
      for (const d of findAllDates(rowText)) push(d, rowLabel.title, rowLabel.time);
    }
  }
  if (!out.length) {
    // Yapısız sayfa: gövdedeki tüm tarihler toplantı günü sayılır
    const body = $("body").text().replace(/\s+/g, " ");
    const label = labelFor(body);
    for (const d of findAllDates(body)) push(d, label.title, label.time);
  }
  return out.sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
}

function labelFor(text: string): { title: string; time: string } {
  const t = text.toLocaleLowerCase("tr");
  if (/enflasyon raporu/.test(t)) return { title: "Enflasyon Raporu", time: "10:30" };
  if (/finansal istikrar/.test(t)) return { title: "Finansal İstikrar Raporu", time: "10:30" };
  if (/toplantı özeti|özet/.test(t)) return { title: "PPK Toplantı Özeti", time: "14:00" };
  return { title: "PPK Toplantısı ve Faiz Kararı", time: "14:00" };
}
function safeUrl(href: string, base?: string): string | undefined {
  try { return new URL(href, base).toString(); } catch { return base; }
}
