import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { marked } from "marked";
import { AdSlot, ArticleListItem, KeyFacts, SourceBox, categoryLabel } from "@kaynak/ui";
import { articleBySlug, relatedArticles } from "@/lib/queries";
import { dateLabel, dateTimeLabel } from "@/lib/format";

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
    alternates: { canonical: `${SITE}/haber/${a.slug}` },
    openGraph: { type: "article", title: a.title, description: a.dek, publishedTime: a.publishedAt?.toISOString(), modifiedTime: a.updatedAt.toISOString(), section: categoryLabel(a.category), tags: a.tags },
  };
}

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const r = await articleBySlug(slug);
  if (!r) notFound();
  const { article: a, document: doc, event: ev } = r;
  const related = await relatedArticles(a);
  const html = await marked.parse(a.bodyMarkdown, { async: true });
  const paragraphs = html.split(/(?<=<\/p>)/);
  const before = paragraphs.slice(0, 3).join(""), after = paragraphs.slice(3).join("");
  const issueDate = (ev?.payload as { issueDate?: string } | undefined)?.issueDate;
  const issueNo = (ev?.payload as { issueNo?: number } | undefined)?.issueNo;

  const jsonLd = {
    "@context": "https://schema.org", "@type": "NewsArticle",
    headline: a.title, description: a.dek, datePublished: a.publishedAt?.toISOString(), dateModified: a.updatedAt.toISOString(),
    author: { "@type": "Organization", name: "Kaynak Haber Merkezi" },
    publisher: { "@type": "Organization", name: "Kaynak", url: SITE },
    isAccessibleForFree: true, citation: a.sourceUrl, articleSection: categoryLabel(a.category), keywords: a.tags.join(", "),
    mainEntityOfPage: `${SITE}/haber/${a.slug}`,
  };

  return (
    <div className="k-grid k-grid--main">
      <article className="k-article">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
        <Link href={`/kategori/${a.category}`} className="k-label">{categoryLabel(a.category)}</Link>
        <h1 className="k-article__title">{a.title}</h1>
        <p className="k-article__dek">{a.dek}</p>
        <div className="k-article__byline">
          <span><b style={{ color: "var(--ink)" }}>Kaynak Haber Merkezi</b> · Sorumlu editör: Yayın Kurulu</span>
          <span>Bu haber resmi belgeden otomatik üretilmiş ve editör kurallarından geçmiştir.</span>
          <span>{a.publishedAt ? `Yayın: ${dateTimeLabel(a.publishedAt)}` : ""}{a.updatedAt.getTime() - (a.publishedAt?.getTime() ?? 0) > 60_000 ? ` · Güncelleme: ${dateTimeLabel(a.updatedAt)}` : ""}</span>
          {a.status !== "published" && <span className="k-article__status">{a.status === "retracted" ? "Geri çekildi" : "Düzeltildi"}{a.editorNote ? ` — ${a.editorNote}` : ""}</span>}
        </div>
        <AdSlot id="article-top" size="970x90" mobileSize="320x100" />
        <div className="k-article__body" dangerouslySetInnerHTML={{ __html: before }} />
        {after && <AdSlot id="article-inline" size="300x250" mobileSize="336x280" />}
        {after && <div className="k-article__body" dangerouslySetInnerHTML={{ __html: after }} />}
        <SourceBox
          title={ev?.title ?? "Kaynak belge"} institution={ev?.sourceId === "resmi-gazete" ? `T.C. Resmî Gazete${issueNo ? ` · Sayı ${issueNo}` : ""}` : ev?.sourceId ?? "Resmi kaynak"}
          dateLabel={issueDate ? dateLabel(issueDate) : a.publishedAt ? dateLabel(a.publishedAt) : ""}
          url={a.sourceUrl} excerpt={doc ? doc.textContent.replace(/\s+/g, " ").slice(0, 280) + "…" : undefined}
        />
        <KeyFacts facts={a.keyFacts} />
        {related.length > 0 && (
          <section>
            <div className="k-section-h"><h2>İlgili haberler</h2></div>
            {related.map((x) => <ArticleListItem key={x.id} a={x} LinkComponent={NextLink} showDek={false} />)}
          </section>
        )}
      </article>
      <aside><AdSlot id="article-rail" size="300x600" mobileSize="300x250" /></aside>
    </div>
  );
}
