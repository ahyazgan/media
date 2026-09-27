import type { ReactNode } from "react";

export interface MastheadProps {
  siteName?: string;
  tagline?: string;
  dateLabel?: string;
  nav?: { href: string; label: string }[];
  right?: ReactNode;
  /** Bağlantı bileşeni (Next.js Link) enjekte edilebilir; varsayılan <a> */
  LinkComponent?: (props: { href: string; className?: string; children: ReactNode }) => ReactNode;
}

const A = ({ href, className, children }: { href: string; className?: string; children: ReactNode }) => <a href={href} className={className}>{children}</a>;

export function Masthead({ siteName = "Kaynak", tagline = "Resmi kaynaktan, dakikalar içinde, doğrulanmış.", dateLabel, nav = DEFAULT_NAV, right, LinkComponent = A }: MastheadProps) {
  return (
    <header className="k-masthead" data-testid="masthead">
      <div className="k-container k-masthead__top">
        <span className="k-muted k-masthead__date">{dateLabel}</span>
        <div className="k-masthead__brand">
          <LinkComponent href="/" className="k-masthead__name">{siteName}</LinkComponent>
          <span className="k-masthead__tagline k-muted">{tagline}</span>
        </div>
        <div className="k-masthead__right">{right}</div>
      </div>
      <nav className="k-masthead__nav" aria-label="Ana menü">
        <div className="k-container k-masthead__navinner">
          {nav.map((n) => <LinkComponent key={n.href} href={n.href} className="k-masthead__link">{n.label}</LinkComponent>)}
        </div>
      </nav>
      <style>{CSS}</style>
    </header>
  );
}

const DEFAULT_NAV = [
  { href: "/", label: "Son Dakika" }, { href: "/kategori/borsa", label: "Borsa" }, { href: "/kategori/mevzuat", label: "Mevzuat" },
  { href: "/kategori/makro", label: "Makro" }, { href: "/kategori/bankacilik", label: "Bankacılık" }, { href: "/kategori/enerji", label: "Enerji" },
  { href: "/resmi-gazete", label: "Resmi Gazete" }, { href: "/sirket", label: "Şirketler" }, { href: "/takvim", label: "Takvim" },
];

const CSS = `
.k-masthead{border-bottom:2px solid var(--ink);background:var(--ground);padding-top:var(--safe-top)}
.k-masthead__top{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;padding-top:14px;padding-bottom:10px;gap:12px}
.k-masthead__date{font-size:13px}
.k-masthead__brand{text-align:center;display:flex;flex-direction:column;align-items:center;gap:2px}
.k-masthead__name{font-family:var(--font-display);font-weight:800;font-size:40px;letter-spacing:-0.03em;color:var(--ink);line-height:1}
.k-masthead__name::after{content:".";color:var(--accent)}
.k-masthead__tagline{font-size:12px}
.k-masthead__right{display:flex;justify-content:flex-end;gap:8px}
.k-masthead__nav{border-top:1px solid var(--line)}
.k-masthead__navinner{display:flex;gap:4px;overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch}
.k-masthead__navinner::-webkit-scrollbar{display:none}
.k-masthead__link{white-space:nowrap;padding:10px 12px;font-weight:500;font-size:14px;border-bottom:2px solid transparent}
.k-masthead__link:hover{text-decoration:none;border-bottom-color:var(--accent)}
@media (max-width:640px){.k-masthead__top{grid-template-columns:1fr;text-align:center}.k-masthead__date,.k-masthead__right{display:none}.k-masthead__name{font-size:32px}}
`;
