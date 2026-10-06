import * as cheerio from "cheerio";

/**
 * HTML → düz metin. readability benzeri hafif temizlik: script/style/nav/aside/form atılır,
 * varsa <main>/<article>/#content, yoksa <body> alınır; blok elemanlar satır sonuna çevrilir.
 */
export function htmlToText(html: string): string {
  const $ = cheerio.load(html);
  $("script, style, noscript, nav, header, footer, aside, form, iframe, svg, button").remove();
  const root = pickRoot($);
  root.find("br").replaceWith("\n");
  root.find("p, div, li, tr, h1, h2, h3, h4, h5, h6, blockquote, table, section, article").each((_, el) => {
    $(el).prepend("\n").append("\n");
  });
  const text = root.text()
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text;
}

function pickRoot($: cheerio.CheerioAPI) {
  for (const sel of ["main", "article", "#content", ".content", "#main"]) {
    const el = $(sel).first();
    if (el.length && el.text().trim().length > 200) return el;
  }
  return $("body").length ? $("body") : $.root();
}

interface PdfTextItem { str: string; width: number; transform: number[] }
interface PdfPage { getTextContent(o: { normalizeWhitespace: boolean; disableCombineTextItems: boolean }): Promise<{ items: PdfTextItem[] }> }
type PdfParse = (b: Buffer, o?: { pagerender?: (p: PdfPage) => Promise<string> }) => Promise<{ text: string }>;

/**
 * pdf-parse'ın varsayılan sayfa çözücüsü aynı satırdaki parçaları aralıksız birleştirir: KAP tablolarında hücreler
 * "05.10.2026100.0000,024915,294118.313" olur, sayı kontrolü 118.313'ü bulamaz ve doğru haber reddedilir.
 * Parçalar arasındaki yatay boşluk yazı boyutuna göre okunur: kelime aralığı → " ", hücre aralığı → " | ".
 */
export function joinPdfLine(items: PdfTextItem[]): string {
  let text = "";
  let lastY: number | undefined;
  let lastEnd = 0;
  for (const it of items) {
    const x = it.transform[4] ?? 0;
    const y = it.transform[5] ?? 0;
    const size = Math.abs(it.transform[0] ?? 0) || 10;
    if (lastY === undefined) text += it.str;
    else if (lastY !== y) text += "\n" + it.str;
    else {
      const gap = x - lastEnd;
      const sep = gap > size * 1.5 ? " | " : gap > size * 0.2 && !/\s$/.test(text) && !/^\s/.test(it.str) ? " " : "";
      text += sep + it.str;
    }
    lastY = y;
    lastEnd = x + it.width;
  }
  return text;
}

export async function pdfToText(bytes: Buffer): Promise<string> {
  const mod = await import("pdf-parse");
  const pdfParse = (mod as unknown as { default?: PdfParse }).default ?? (mod as unknown as PdfParse);
  const out = await pdfParse(bytes, {
    pagerender: async (page) => joinPdfLine((await page.getTextContent({ normalizeWhitespace: false, disableCombineTextItems: false })).items),
  });
  return out.text.replace(/\r/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

export async function documentToText(mime: string, bytes: Buffer): Promise<string> {
  if (mime.includes("pdf")) return pdfToText(bytes);
  return htmlToText(decodeHtml(bytes));
}

/**
 * HTML baytlarını doğru karakter setiyle çözer: önce Content-Type başlığı, sonra <meta charset>.
 * Resmi Gazete'nin eski sayfaları windows-1254 olabilir; yanlış çözülürse "YÖNETMELİK" gibi bölüm adları bozulur.
 */
export function decodeHtml(bytes: Buffer | Uint8Array, contentType?: string | null): string {
  const buf = Buffer.from(bytes);
  const fromHeader = /charset=["']?([\w-]+)/i.exec(contentType ?? "")?.[1];
  const fromMeta = /<meta[^>]+charset=["']?([\w-]+)/i.exec(buf.subarray(0, 4096).toString("latin1"))?.[1];
  const cs = (fromHeader ?? fromMeta ?? "utf-8").toLowerCase();
  if (cs.includes("1254") || cs.includes("8859-9") || cs === "latin5") return new TextDecoder("windows-1254").decode(buf);
  return buf.toString("utf8");
}
