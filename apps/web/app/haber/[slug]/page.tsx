import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { renderArticleMarkdown } from "@/lib/markdown";
import { ArticleListItem, CompanyCard, KeyFacts, SourceBox, categoryLabel } from "@kaynak/ui";
import { Ad } from "@/components/Ad";
import { articleBySlug, companiesByCodes, relatedArticles, storyTimeline } from "@/lib/queries";
import { dateLabel, dateTimeLabel, sourceLabel } from "@/lib/format";

export const revalidate = 3600; // publish'te /api/revalidate ile anında yenilenir

const SITE = process.env.SITE_URL ?? "http://localhost:3000";
const NextLink = ({ href, className, children }: { href: string; className?: string; children: React.ReactNode }) => <Link href={href} className={className}>{children}</Link>;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const r = await articleBySlug(slug);
  if (!r) return {};
  const { article: a } = r;
  return {
    title: a.title, description: a.dek,
    robots: a.status === "retracted" ? { index: false, follow: true } : undefined,
    alternates: { canonical: `${SITE}/haber/${a.slug}` },
    openGraph: { type: "article", title: a.title, description: a.dek, publishedTime: a.publishedAt?.toISOString(), modifiedTime: a.updatedAt.toISOString(), section: categoryLabel(a.category), tags: a.tags },
  };
}

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const r = await articleBySlug(slug);
  if (!r) notFound();
  const { article: a, document: doc, event: ev, versions } = r;
  const [related, cos, story] = await Promise.all([relatedArticles(a), companiesByCodes(a.tickers), storyTimeline(a)]);
  const html = renderArticleMarkdown(a.bodyMarkdown);
  const paragraphs = html.split(/(?<=<\/p>)/);
  const before = paragraphs.slice(0, 3).join(""), after = paragraphs.slice(3).join("");
  const payload = (ev?.payload ?? {}) as { issueDate?: string; issueNo?: number; index?: number; sectionLabel?: string };
  const issueDate = payload.issueDate;
  const issueNo = payload.issueNo;
  const institution = ev?.sourceId === "resmi-gazete"
    ? `T.C. Resmî Gazete${issueNo ? ` · Sayı ${issueNo}` : ""}`
    : ev?.sourceId === "kap"
      ? `KAP${payload.sectionLabel ? ` · ${payload.sectionLabel}` : ""}${payload.index ? ` · No ${payload.index}` : ""}`
      : sourceLabel(ev?.sourceId);

  const jsonLd = {
    "@context": "https://schema.org", "@type": "NewsArticle",
    headline: a.title, description: a.dek, datePublished: a.publishedAt?.toISOString(), dateModified: a.updatedAt.toISOString(),
    author: { "@type": "Organization", name: "Kaynak Haber Merkezi" },
    publisher: { "@type": "Organization", name: "Kaynak", url: SITE },
    isAccessibleForFree: true, citation: a.sourceUrl, articleSection: categoryLabel(a.category), keywords: a.tags.join(", "),
    mainEntityOfPage: `${SITE}/haber/${a.slug}`,
    image: [`${SITE}/haber/${a.slug}/opengraph-image`],
    ...(a.status === "corrected" && a.editorNote ? { correction: { "@type": "CorrectionComment", text: a.editorNote, datePublished: a.updatedAt.toISOString() } } : {}),
    ...(cos.length ? { about: cos.map((c) => ({ "@type": "Organization", name: c.name, tickerSymbol: c.kapCode, url: `${SITE}/sirket/${c.kapCode.toLowerCase()}` })) } : {}),
  };

  return (
    <div className="k-grid k-grid--main">
      <article className="k-article">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
        <Link href={`/kategori/${a.category}`} className="k-label">{categoryLabel(a.category)}</Link>
        {a.isFlash && <span className="k-flash-tag">Flaş</span>}
        <h1 className="k-article__title">{a.title}</h1>
        <p className="k-article__dek">{a.dek}</p>
        <div className="k-article__byline">
          <span><b style={{ color: "var(--ink)" }}>Kaynak Haber Merkezi</b> · Sorumlu editör: Yayın Kurulu</span>
          <span>Bu haber resmi belgeden otomatik üretilmiş ve editör kurallarından geçmiştir.</span>
          <span>{a.publishedAt ? `Yayın: ${dateTimeLabel(a.publishedAt)}` : ""}{a.updatedAt.getTime() - (a.publishedAt?.getTime() ?? 0) > 60_000 ? ` · Güncelleme: ${dateTimeLabel(a.updatedAt)}` : ""}</span>
        </div>
        {a.isFlash && (
          <aside className="k-flash" role="status">
            <b>Flaş haber.</b> Bu satır resmi belgenin yayımlandığı anda belgeden alındı; haberin ayrıntıları hazırlanıyor ve bu sayfa güncellenecek.
          </aside>
        )}
        {(a.status === "corrected" || a.status === "retracted") && (
          <aside className={`k-correction${a.status === "retracted" ? " k-correction--retracted" : ""}`} aria-label={a.status === "retracted" ? "Geri çekildi" : "Düzeltildi"}>
            <b>{a.status === "retracted" ? "Bu haber geri çekildi." : "Düzeltildi."}</b> {a.editorNote}
            <span className="k-muted"> ({dateTimeLabel(a.updatedAt)})</span>
            {versions.length > 0 && (
              <details className="k-correction__hist">
                <summary>Düzeltme geçmişi ({versions.length})</summary>
                <ol>{versions.map((v) => <li key={v.id}><time>{dateTimeLabel(v.createdAt)}</time> — {v.reason.replace(/^(düzeltme|geri çekme) \([^)]*\): /, "")} <span className="k-muted">(v{v.version})</span></li>)}</ol>
                <p className="k-muted" style={{ fontSize: 12, margin: "6px 0 0" }}>Kaynak hiçbir haberi silmez; her sürüm saklanır. <Link href="/duzeltme-politikasi">Düzeltme politikası</Link></p>
              </details>
            )}
          </aside>
        )}
        <Ad id="article-top" />
        <div className="k-article__body" dangerouslySetInnerHTML={{ __html: before }} />
        {after && <Ad id="article-inline" />}
        {after && <div className="k-article__body" dangerouslySetInnerHTML={{ __html: after }} />}
        <SourceBox
          title={ev?.title ?? "Kaynak belge"} institution={institution}
          dateLabel={issueDate ? dateLabel(issueDate) : ev?.publishedAt ? dateTimeLabel(ev.publishedAt) : a.publishedAt ? dateLabel(a.publishedAt) : ""}
          url={a.sourceUrl} excerpt={doc ? doc.textContent.replace(/\s+/g, " ").slice(0, 280) + "…" : undefined}
        />
        <KeyFacts facts={a.keyFacts} />
        {story.length > 0 && (
          <section className="k-story" aria-labelledby="k-story-h">
            <div className="k-section-h"><h2 id="k-story-h">Bu konudaki gelişmeler</h2><span className="k-muted" style={{ fontSize: 13 }}>{story.length} haber</span></div>
            <ol className="k-story__list">
              {story.map((s) => (
                <li key={s.id} className={`k-story__i${s.id === a.id ? " k-story__i--current" : ""}`}>
                  <time className="k-story__time" dateTime={s.eventAt.toISOString()}>{dateTimeLabel(s.eventAt)}</time>
                  {s.id === a.id
                    ? <span className="k-story__t" aria-current="page">{s.title} <span className="k-story__badge">Bu haber</span></span>
                    : <Link href={`/haber/${s.slug}`} className="k-story__t">{s.title}</Link>}
                </li>
              ))}
            </ol>
            <p className="k-muted" style={{ fontSize: 12, margin: "8px 0 0" }}>Her gelişme kendi resmi belgesine dayanır; saatler belgenin yayımlandığı zamandır.</p>
          </section>
        )}
        {cos.map((c) => <CompanyCard key={c.kapCode} c={c} LinkComponent={NextLink} />)}
        {related.length > 0 && (
          <section>
            <div className="k-section-h"><h2>İlgili haberler</h2></div>
            {related.map((x) => <ArticleListItem key={x.id} a={x} LinkComponent={NextLink} showDek={false} />)}
          </section>
        )}
      </article>
      <aside><Ad id="article-rail" /></aside>
    </div>
  );
}
