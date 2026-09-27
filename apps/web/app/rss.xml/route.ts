import { recentArticles } from "@/lib/queries";
import { categoryLabel } from "@kaynak/ui";

export const revalidate = 300;
const SITE = process.env.SITE_URL ?? "http://localhost:3000";
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);

/** Şartname §8: RSS çıkışı — son 50 haber, kaynak belge bağlantısıyla. */
export async function GET() {
  const items = await recentArticles(50);
  const last = items[0]?.publishedAt ?? new Date();
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">
<channel>
<title>Kaynak</title>
<link>${SITE}</link>
<atom:link href="${SITE}/rss.xml" rel="self" type="application/rss+xml"/>
<description>Resmi kaynaktan, dakikalar içinde, doğrulanmış ekonomi haberleri.</description>
<language>tr</language>
<lastBuildDate>${last.toUTCString()}</lastBuildDate>
${items.map((a) => `<item>
<title>${esc(a.title)}</title>
<link>${SITE}/haber/${a.slug}</link>
<guid isPermaLink="true">${SITE}/haber/${a.slug}</guid>
<pubDate>${(a.publishedAt ?? a.createdAt).toUTCString()}</pubDate>
<category>${esc(categoryLabel(a.category))}</category>
<dc:creator>Kaynak Haber Merkezi</dc:creator>
<description>${esc(a.dek)} Kaynak belge: ${esc(a.sourceUrl)}</description>
</item>`).join("\n")}
</channel>
</rss>`;
  return new Response(xml, { headers: { "content-type": "application/rss+xml; charset=utf-8", "cache-control": "public, s-maxage=300, stale-while-revalidate=600" } });
}
