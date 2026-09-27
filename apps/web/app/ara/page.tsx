import type { Metadata } from "next";
import Link from "next/link";
import { ArticleListItem } from "@kaynak/ui";
import { searchArticles } from "@/lib/queries";

export const metadata: Metadata = { title: "Ara", robots: { index: false } };
const NextLink = ({ href, className, children }: { href: string; className?: string; children: React.ReactNode }) => <Link href={href} className={className}>{children}</Link>;

/** Arama; PWA share_target (title/text/url) da buraya düşer: paylaşılan metin sorgu olarak kullanılır. */
export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string; title?: string; text?: string; url?: string }> }) {
  const sp = await searchParams;
  const shared = sp.url || sp.text || sp.title;
  const q = (sp.q ?? sp.title ?? sp.text ?? "").trim();
  const items = q ? await searchArticles(q) : [];
  return (
    <div style={{ maxWidth: 860 }}>
      <span className="k-label">Arama</span>
      <form action="/ara" method="get" style={{ display: "flex", gap: 8, margin: "8px 0 18px", maxWidth: 560 }}>
        <input name="q" defaultValue={q} placeholder="başlık ya da özet" style={{ flex: 1, font: "inherit", padding: "10px 12px", border: "1px solid var(--line)", borderRadius: "var(--radius)" }} />
        <button type="submit" className="k-btn">Ara</button>
      </form>
      {shared && sp.url && <p className="k-muted" style={{ fontSize: 13 }}>Paylaşılan bağlantı: <a href={sp.url} rel="noopener nofollow">{sp.url}</a></p>}
      {q && items.length === 0 && <div className="k-empty">"{q}" için sonuç yok.</div>}
      {items.map((a) => <ArticleListItem key={a.id} a={a} LinkComponent={NextLink} />)}
    </div>
  );
}
