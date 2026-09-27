import type { ReactNode } from "react";

export interface GazetteEntry {
  externalId: string;
  title: string;
  url: string;
  section: string;      // slug: yonetmelik, teblig...
  sectionLabel: string; // "Yönetmelik"
  articleSlug?: string | null;
  status?: string | null; // published | review | skipped ...
}

type LinkC = (props: { href: string; className?: string; children: ReactNode }) => ReactNode;
const A: LinkC = ({ href, className, children }) => <a href={href} className={className}>{children}</a>;

/** Günün Resmi Gazete maddeleri, türe göre gruplu. Haberleşmiş olanlar haber sayfasına, diğerleri belgeye bağlanır. */
export function GazetteList({ entries, dateLabel, issueNo, LinkComponent = A, compact = false }: { entries: GazetteEntry[]; dateLabel?: string; issueNo?: number; LinkComponent?: LinkC; compact?: boolean }) {
  const groups = new Map<string, GazetteEntry[]>();
  for (const e of entries) groups.set(e.sectionLabel, [...(groups.get(e.sectionLabel) ?? []), e]);
  return (
    <section className={`k-gaz${compact ? " k-gaz--compact" : ""}`}>
      {(dateLabel || issueNo) && (
        <header className="k-gaz__head">
          <span className="k-label" style={{ color: "var(--accent-2)" }}>Resmi Gazete</span>
          <span className="k-gaz__date">{dateLabel}{issueNo ? ` · Sayı ${issueNo}` : ""}</span>
        </header>
      )}
      {entries.length === 0 && <p className="k-muted">Bu tarihte kayıtlı madde yok.</p>}
      {[...groups.entries()].map(([label, items]) => (
        <div key={label} className="k-gaz__group">
          <h4 className="k-gaz__section">{label}</h4>
          <ul className="k-gaz__list">
            {items.map((e) => (
              <li key={e.externalId} className="k-gaz__item">
                {e.articleSlug && (e.status === "published" || e.status === "corrected")
                  ? <LinkComponent href={`/haber/${e.articleSlug}`} className="k-gaz__link k-gaz__link--news">{e.title}</LinkComponent>
                  : <a href={e.url} target="_blank" rel="noopener" className="k-gaz__link">{e.title}</a>}
                {e.articleSlug && (e.status === "published" || e.status === "corrected") && <span className="k-gaz__badge">Haber</span>}
              </li>
            ))}
          </ul>
        </div>
      ))}
      <style>{CSS}</style>
    </section>
  );
}

const CSS = `
.k-gaz__head{display:flex;justify-content:space-between;align-items:baseline;border-bottom:2px solid var(--accent-2);padding-bottom:6px;margin-bottom:10px}
.k-gaz__date{font-size:13px;color:var(--muted)}
.k-gaz__group{margin-bottom:14px}
.k-gaz__section{font-family:var(--font-text);font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin:0 0 6px}
.k-gaz__list{list-style:none;margin:0;padding:0}
.k-gaz__item{padding:7px 0;border-bottom:1px dashed var(--line);font-size:15px;display:flex;gap:8px;align-items:flex-start}
.k-gaz__link--news{font-weight:600}
.k-gaz__badge{flex:none;font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--ground);background:var(--accent);border-radius:3px;padding:2px 6px;margin-top:3px}
.k-gaz--compact .k-gaz__item{font-size:14px;padding:5px 0}
`;
