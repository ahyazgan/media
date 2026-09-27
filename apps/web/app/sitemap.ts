import type { MetadataRoute } from "next";
import { sitemapData } from "@/lib/queries";

const SITE = process.env.SITE_URL ?? "http://localhost:3000";
export const revalidate = 3600;

/** sitemap.xml (şartname §8): statik sayfalar, tüm canlı haberler, şirketler, Resmi Gazete günleri. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const d = await sitemapData();
  const now = new Date();
  const statics: MetadataRoute.Sitemap = [
    { url: `${SITE}/`, lastModified: now, changeFrequency: "always", priority: 1 },
    ...["/resmi-gazete", "/sirket", "/takvim", "/bulten"].map((p) => ({ url: `${SITE}${p}`, lastModified: now, changeFrequency: "hourly" as const, priority: 0.8 })),
    ...["borsa", "mevzuat", "makro", "bankacilik", "enerji", "sirketler", "diger"].map((c) => ({ url: `${SITE}/kategori/${c}`, lastModified: now, changeFrequency: "hourly" as const, priority: 0.7 })),
    ...["/kunye", "/iletisim", "/duzeltme-politikasi", "/kvkk", "/cerez-politikasi", "/reklam"].map((p) => ({ url: `${SITE}${p}`, changeFrequency: "monthly" as const, priority: 0.3 })),
  ];
  return [
    ...statics,
    ...d.articles.map((a) => ({ url: `${SITE}/haber/${a.slug}`, lastModified: a.updatedAt, changeFrequency: "weekly" as const, priority: 0.6 })),
    ...d.companies.map((c) => ({ url: `${SITE}/sirket/${c.kapCode.toLowerCase()}`, lastModified: c.updatedAt, changeFrequency: "daily" as const, priority: 0.5 })),
    ...d.gazetteDays.map((day) => ({ url: `${SITE}/resmi-gazete/${day}`, changeFrequency: "monthly" as const, priority: 0.4 })),
  ];
}
