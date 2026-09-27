import { newsSitemapArticles } from "@/lib/queries";

export const revalidate = 300;
const SITE = process.env.SITE_URL ?? "http://localhost:3000";
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);

/** Google News sitemap (şartname §8: son 48 saat). Publisher Center başvurusunda bu adres verilir. */
export async function GET() {
  const items = await newsSitemapArticles();
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
${items.map((a) => `<url>
<loc>${SITE}/haber/${a.slug}</loc>
<news:news>
<news:publication><news:name>Kaynak</news:name><news:language>tr</news:language></news:publication>
<news:publication_date>${(a.publishedAt ?? a.createdAt).toISOString()}</news:publication_date>
<news:title>${esc(a.title)}</news:title>
<news:keywords>${esc(a.tags.join(", "))}</news:keywords>
</news:news>
</url>`).join("\n")}
</urlset>`;
  return new Response(xml, { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, s-maxage=300, stale-while-revalidate=600" } });
}
