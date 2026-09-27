import type { ReactNode } from "react";
import { categoryLabel } from "./labels.js";
import { fmtTime, type ArticleSummary } from "./ArticleListItem.js";

type LinkC = (props: { href: string; className?: string; children: ReactNode }) => ReactNode;
const A: LinkC = ({ href, className, children }) => <a href={href} className={className}>{children}</a>;

export function HeroArticle({ a, LinkComponent = A }: { a: ArticleSummary; LinkComponent?: LinkC }) {
  return (
    <article className="k-hero">
      <div className="k-hero__meta"><span className="k-label">{categoryLabel(a.category)}</span><time className="k-muted">{fmtTime(a.publishedAt)}</time></div>
      <h2 className="k-hero__title"><LinkComponent href={`/haber/${a.slug}`}>{a.title}</LinkComponent></h2>
      <p className="k-hero__dek k-body">{a.dek}</p>
      {a.sourceName && <p className="k-hero__src k-muted">Kaynak: {a.sourceName}</p>}
      <style>{`
        .k-hero{padding:20px 0 24px;border-bottom:1px solid var(--line)}
        .k-hero__meta{display:flex;gap:12px;align-items:center;font-size:12px;margin-bottom:10px}
        .k-hero__title{font-size:40px;font-weight:800;letter-spacing:-0.02em}
        .k-hero__dek{font-size:18px;margin:12px 0 0;max-width:720px}
        .k-hero__src{font-size:12px;margin:10px 0 0}
        @media (max-width:640px){.k-hero__title{font-size:28px}}
      `}</style>
    </article>
  );
}
