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

export async function pdfToText(bytes: Buffer): Promise<string> {
  const mod = await import("pdf-parse");
  const pdfParse = (mod as unknown as { default?: (b: Buffer) => Promise<{ text: string }> }).default ?? (mod as unknown as (b: Buffer) => Promise<{ text: string }>);
  const out = await pdfParse(bytes);
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
