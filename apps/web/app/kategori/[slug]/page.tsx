import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArticleListItem, CATEGORY_LABELS, categoryLabel } from "@kaynak/ui";
import { latestArticles } from "@/lib/queries";

export const revalidate = 120;
const NextLink = ({ href, className, children }: { href: string; className?: string; children: React.ReactNode }) => <Link href={href} className={className}>{children}</Link>;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  return CATEGORY_LABELS[slug] ? { title: categoryLabel(slug), description: `${categoryLabel(slug)} kategorisindeki doğrulanmış resmi kaynak haberleri.` } : {};
}

export default async function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!CATEGORY_LABELS[slug]) notFound();
  const items = await latestArticles(50, slug);
  return (
    <div style={{ maxWidth: 860 }}>
      <span className="k-label">Kategori</span>
      <h1 style={{ fontSize: 34, margin: "6px 0 18px" }}>{categoryLabel(slug)}</h1>
      {items.length === 0 ? <div className="k-empty">Bu kategoride henüz haber yok.</div> : items.map((a) => <ArticleListItem key={a.id} a={a} LinkComponent={NextLink} />)}
    </div>
  );
}
