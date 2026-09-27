import type { ReactNode } from "react";
import { categoryLabel } from "./labels.js";

export interface ArticleSummary {
  slug: string;
  title: string;
  dek: string;
  category: string;
  importance: number;
  publishedAt: string | Date | null;
  sourceName?: string;
}

export function fmtTime(d: string | Date | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" }).format(date);
}

type LinkC = (props: { href: string; className?: string; children: ReactNode }) => ReactNode;
const A: LinkC = ({ href, className, children }) => <a href={href} className={className}>{children}</a>;

export function ArticleListItem({ a, LinkComponent = A, showDek = true }: { a: ArticleSummary; LinkComponent?: LinkC; showDek?: boolean }) {
  return (
    <article className="k-item">
      <div className="k-item__meta">
        <span className="k-label">{categoryLabel(a.category)}</span>
        <time className="k-muted k-item__time">{fmtTime(a.publishedAt)}</time>
        {a.importance >= 4 && <span className="k-item__hot" title="Yüksek önem">●</span>}
      </div>
      <h3 className="k-item__title"><LinkComponent href={`/haber/${a.slug}`}>{a.title}</LinkComponent></h3>
      {showDek && <p className="k-item__dek k-body">{a.dek}</p>}
      <style>{CSS}</style>
    </article>
  );
}

const CSS = `
.k-item{padding:14px 0;border-bottom:1px solid var(--line)}
.k-item__meta{display:flex;align-items:center;gap:10px;margin-bottom:6px;font-size:12px}
.k-item__time{font-variant-numeric:tabular-nums}
.k-item__hot{color:var(--accent);font-size:10px}
.k-item__title{font-size:20px;font-weight:600}
.k-item__dek{margin:6px 0 0;font-size:15px}
`;
