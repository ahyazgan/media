import type { ReactNode } from "react";

export interface CompanySummary {
  kapCode: string;
  name: string;
  sector?: string | null;
  /** Bildirim geçmişi sayısı (isNews=false dahil) */
  disclosureCount?: number;
  /** Yayınlanmış haber sayısı */
  newsCount?: number;
  lastDisclosureAt?: string | Date | null;
}

type LinkC = (props: { href: string; className?: string; children: ReactNode }) => ReactNode;
const A: LinkC = ({ href, className, children }) => <a href={href} className={className}>{children}</a>;

/** Haber sayfasındaki "ilgili şirket" kartı (şartname §6.3) ve /sirket listesi öğesi. */
export function CompanyCard({ c, LinkComponent = A, compact = false }: { c: CompanySummary; LinkComponent?: LinkC; compact?: boolean }) {
  const href = `/sirket/${c.kapCode.toLowerCase()}`;
  return (
    <div className={`k-co k-card${compact ? " k-co--compact" : ""}`}>
      <div className="k-co__head">
        <LinkComponent href={href} className="k-co__code">{c.kapCode}</LinkComponent>
        {c.sector && <span className="k-muted k-co__sector">{c.sector}</span>}
      </div>
      <h4 className="k-co__name"><LinkComponent href={href}>{c.name}</LinkComponent></h4>
      {(c.disclosureCount !== undefined || c.newsCount !== undefined) && (
        <p className="k-co__stats k-muted">
          {c.disclosureCount !== undefined && <span>{c.disclosureCount} bildirim</span>}
          {c.newsCount !== undefined && <span>{c.newsCount} haber</span>}
        </p>
      )}
      {!compact && <LinkComponent href={href} className="k-btn k-btn--ghost">Şirket profili →</LinkComponent>}
      <style>{CSS}</style>
    </div>
  );
}

const CSS = `
.k-co{margin:20px 0;display:grid;gap:6px}
.k-co__head{display:flex;justify-content:space-between;align-items:baseline}
.k-co__code{font-family:var(--font-text);font-weight:700;font-size:13px;letter-spacing:.06em;color:var(--accent-2)}
.k-co__sector{font-size:12px}
.k-co__name{font-family:var(--font-text);font-size:16px;font-weight:700;margin:0}
.k-co__stats{font-size:13px;margin:0;display:flex;gap:12px}
.k-co .k-btn{justify-self:start;margin-top:4px}
.k-co--compact{margin:0;padding:12px}
`;
