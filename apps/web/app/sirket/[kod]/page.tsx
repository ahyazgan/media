import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArticleListItem } from "@kaynak/ui";
import { Ad } from "@/components/Ad";
import { articlesForCompany, companyByCode, companyTimeline } from "@/lib/queries";
import { dateTimeLabel } from "@/lib/format";

export const revalidate = 300; // publish'te /api/revalidate ile anında yenilenir

const SITE = process.env.SITE_URL ?? "http://localhost:3000";
const NextLink = ({ href, className, children }: { href: string; className?: string; children: React.ReactNode }) => <Link href={href} className={className}>{children}</Link>;
const isCode = (s: string) => /^[a-z0-9]{3,6}$/i.test(s);

export async function generateMetadata({ params }: { params: Promise<{ kod: string }> }): Promise<Metadata> {
  const { kod } = await params;
  if (!isCode(kod)) return {};
  const c = await companyByCode(kod);
  if (!c) return {};
  return {
    title: `${c.name} (${c.kapCode}) — KAP bildirimleri ve haberler`,
    description: `${c.name} şirketinin KAP bildirim geçmişi ve resmi belgeden üretilmiş doğrulanmış haberleri.`,
    alternates: { canonical: `${SITE}/sirket/${c.kapCode.toLowerCase()}` },
  };
}

export default async function CompanyPage({ params }: { params: Promise<{ kod: string }> }) {
  const { kod } = await params;
  if (!isCode(kod)) notFound();
  const c = await companyByCode(kod);
  if (!c) notFound();
  const [timeline, news] = await Promise.all([companyTimeline(c.kapCode), articlesForCompany(c.kapCode)]);
  const newsCount = timeline.filter((t) => t.articleStatus === "published").length;

  const jsonLd = {
    "@context": "https://schema.org", "@type": "Organization", name: c.name, tickerSymbol: c.kapCode,
    url: `${SITE}/sirket/${c.kapCode.toLowerCase()}`, sameAs: [`https://www.kap.org.tr/tr/sirket-bilgileri/ozet/${c.kapCode}`],
  };

  return (
    <div className="k-grid k-grid--main">
      <div style={{ maxWidth: 860 }}>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
        <span className="k-label" style={{ color: "var(--accent-2)" }}>Şirket · {c.kapCode}</span>
        <h1 style={{ fontSize: 34, margin: "6px 0 4px" }}>{c.name}</h1>
        <p className="k-muted" style={{ margin: "0 0 18px", fontSize: 14 }}>
          {c.sector ? `${c.sector} · ` : ""}{timeline.length} bildirim · {newsCount} haber · <Link href="/sirket">Tüm şirketler →</Link>
        </p>
        {c.description && <p className="k-body" style={{ maxWidth: 680 }}>{c.description}</p>}

        <section>
          <div className="k-section-h"><h2>Haberler</h2></div>
          {news.length === 0
            ? <div className="k-empty">Bu şirket için henüz haber yok.</div>
            : news.map((a) => <ArticleListItem key={a.id} a={a} LinkComponent={NextLink} />)}
        </section>

        <section>
          <div className="k-section-h"><h2>Bildirim geçmişi</h2><span className="k-muted" style={{ fontSize: 13 }}>Kaynak: KAP</span></div>
          {timeline.length === 0 && <div className="k-empty">Kayıtlı bildirim yok.</div>}
          <ul className="k-tl">
            {timeline.map((t) => (
              <li key={t.id} className="k-tl__i">
                <time className="k-muted k-tl__time">{dateTimeLabel(t.publishedAt)}</time>
                <div>
                  <span className="k-tl__class">{t.classLabel}</span>
                  {t.articleSlug && t.articleStatus === "published"
                    ? <Link href={`/haber/${t.articleSlug}`} className="k-tl__t k-tl__t--news">{t.articleTitle ?? t.subject}</Link>
                    : <a href={t.url} target="_blank" rel="noopener" className="k-tl__t">{t.subject}</a>}
                  {!t.isNews && <span className="k-tl__badge">Rutin</span>}
                  {t.isNews && t.articleStatus === "review" && <span className="k-tl__badge">İncelemede</span>}
                </div>
              </li>
            ))}
          </ul>
          <p className="k-muted" style={{ fontSize: 13, marginTop: 16 }}>"Rutin" etiketli bildirimler (adres, unvan, genel bilgi formu vb.) haber değeri taşımadığından yalnızca listelenir; bağlantı KAP'taki belgeye gider.</p>
        </section>
        <style>{`
          .k-tl{list-style:none;margin:0;padding:0}
          .k-tl__i{display:grid;grid-template-columns:150px 1fr;gap:12px;padding:10px 0;border-bottom:1px dashed var(--line);font-size:15px}
          .k-tl__time{font-size:13px;font-variant-numeric:tabular-nums}
          .k-tl__class{display:block;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin-bottom:2px}
          .k-tl__t--news{font-weight:600}
          .k-tl__badge{margin-left:8px;font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);background:var(--tint);border-radius:3px;padding:2px 6px}
          @media (max-width:640px){.k-tl__i{grid-template-columns:1fr;gap:2px}}
        `}</style>
      </div>
      <aside><Ad id="company-rail" /></aside>
    </div>
  );
}
