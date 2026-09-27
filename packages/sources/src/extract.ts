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
  // Resmi Gazete eski sayfalar windows-1254 olabilir; meta charset'e bak.
  const head = bytes.subarray(0, 2048).toString("latin1");
  const m = /charset=["']?([\w-]+)/i.exec(head);
  const cs = (m?.[1] ?? "utf-8").toLowerCase();
  const html = cs.includes("1254") || cs.includes("iso-8859-9") ? new TextDecoder("windows-1254").decode(bytes) : bytes.toString("utf8");
  return htmlToText(html);
}
