import type { ReactNode } from "react";

export interface KapFeedItem {
  /** raw_event id ya da KAP bildirim no — React key */
  id: string;
  /** ISO zaman damgası */
  publishedAt: string;
  code: string;
  company: string;
  title: string;
  /** Haberleşmişse /haber/[slug], değilse KAP belge bağlantısı */
  href: string;
  isNews: boolean;
  status?: string | null;
}

type LinkC = (props: { href: string; className?: string; children: ReactNode }) => ReactNode;
const A: LinkC = ({ href, className, children }) => <a href={href} className={className}>{children}</a>;

export function fmtClock(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(d) === new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(now);
  return new Intl.DateTimeFormat("tr-TR", sameDay
    ? { timeZone: "Europe/Istanbul", hour: "2-digit", minute: "2-digit" }
    : { timeZone: "Europe/Istanbul", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(d);
}

/**
 * Canlı KAP akışı (şartname §6.2: ana sayfada 30 sn polling). Sunucu ilk listeyi verir; istemci sarmalayıcı
 * (apps/web/components/KapFeedLive) items'ı yeniler. Haberleşmiş bildirimler habere, diğerleri KAP belgesine gider.
 */
export function KapFeed({ items = [], LinkComponent = A, updatedAt, live = true, limit }: {
  items?: KapFeedItem[]; LinkComponent?: LinkC; updatedAt?: string; live?: boolean; limit?: number;
}) {
  const shown = limit ? items.slice(0, limit) : items;
  return (
    <section className="k-kap" aria-live="polite">
      <header className="k-kap__h">
        <LinkComponent href="/sirket" className="k-label">KAP akışı</LinkComponent>
        {live && <span className="k-kap__live" title={updatedAt ? `Son güncelleme ${fmtClock(updatedAt)}` : undefined}>● canlı</span>}
      </header>
      {shown.length === 0 && <p className="k-muted" style={{ fontSize: 14 }}>Henüz KAP bildirimi yok.</p>}
      <ul className="k-kap__list">
        {shown.map((i) => (
          <li key={i.id} className={i.isNews ? "k-kap__i k-kap__i--news" : "k-kap__i"}>
            <time dateTime={i.publishedAt}>{fmtClock(i.publishedAt)}</time>
            <LinkComponent href={`/sirket/${i.code.toLowerCase()}`} className="k-kap__code">{i.code}</LinkComponent>
            {i.isNews && i.status === "published"
              ? <LinkComponent href={i.href} className="k-kap__t k-kap__t--news">{i.title}</LinkComponent>
              : <a href={i.href} target="_blank" rel="noopener" className="k-kap__t">{i.title}</a>}
          </li>
        ))}
      </ul>
      <style>{CSS}</style>
    </section>
  );
}

const CSS = `
.k-kap__h{display:flex;justify-content:space-between;align-items:baseline;border-bottom:2px solid var(--accent);padding-bottom:6px;margin-bottom:10px}
.k-kap__live{font-size:11px;color:var(--accent);animation:k-kap-pulse 2s infinite}
@keyframes k-kap-pulse{0%,100%{opacity:1}50%{opacity:.45}}
.k-kap__list{list-style:none;padding:0;margin:0;font-size:14px}
.k-kap__i{padding:6px 0;border-bottom:1px dashed var(--line);display:grid;grid-template-columns:auto auto 1fr;gap:8px;align-items:baseline}
.k-kap__i time{color:var(--muted);font-variant-numeric:tabular-nums;font-size:12px;white-space:nowrap}
.k-kap__code{font-weight:700;font-size:12px;letter-spacing:.04em;color:var(--accent-2)}
.k-kap__t{color:var(--body)}
.k-kap__t--news{font-weight:600;color:var(--ink)}
`;
