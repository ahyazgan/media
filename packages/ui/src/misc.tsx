/**
 * MarketTicker/BreakingBar yer tutucuları (Faz 5), MacroCalendar (Faz 3) ve TabBar. InstallBanner/CookieBar pwa.tsx'te.
 * Hepsi /_dev/ui sayfasında listelenir.
 */
import type { ReactNode } from "react";

export function MarketTicker({ items = [] }: { items?: { symbol: string; value: string; change: number }[] }) {
  if (!items.length) return null;
  return (
    <div className="k-ticker" aria-label="Piyasa şeridi">
      {items.map((i) => (
        <span key={i.symbol} className="k-ticker__i">
          <b>{i.symbol}</b> {i.value} <span className={i.change >= 0 ? "k-up" : "k-down"}>{i.change >= 0 ? "▲" : "▼"} {Math.abs(i.change).toFixed(2)}%</span>
        </span>
      ))}
      <style>{`.k-ticker{display:flex;gap:20px;overflow-x:auto;font-size:13px;padding:8px var(--gutter);background:var(--tint);border-bottom:1px solid var(--line);white-space:nowrap;scrollbar-width:none}.k-ticker__i{font-variant-numeric:tabular-nums}`}</style>
    </div>
  );
}

export function BreakingBar({ text, href }: { text?: string; href?: string }) {
  if (!text) return null;
  return (
    <div className="k-breaking" role="status">
      <span className="k-breaking__tag">Son dakika</span>
      <a href={href}>{text}</a>
      <style>{`.k-breaking{display:flex;gap:12px;align-items:center;padding:10px var(--gutter);background:var(--accent);color:#fff;font-weight:600;font-size:15px}.k-breaking__tag{font-size:11px;letter-spacing:.1em;text-transform:uppercase;background:#fff;color:var(--accent);padding:2px 6px;border-radius:3px}.k-breaking a{color:#fff}`}</style>
    </div>
  );
}

export interface MacroCalendarItem {
  id: string;
  /** ISO zaman */
  scheduledAt: string;
  institution: string;      // tcmb | tuik
  title: string;
  /** Yayınlandıysa haber bağlantısı */
  articleHref?: string | null;
  sourceUrl?: string | null;
}
const INSTITUTION_LABEL: Record<string, string> = { tcmb: "TCMB", tuik: "TÜİK" };
export const institutionLabel = (id: string) => INSTITUTION_LABEL[id] ?? id.toUpperCase();

export function fmtCalendarWhen(iso: string, withDate = true): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("tr-TR", withDate
    ? { timeZone: "Europe/Istanbul", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }
    : { timeZone: "Europe/Istanbul", hour: "2-digit", minute: "2-digit" }).format(d);
}

type LinkC = (props: { href: string; className?: string; children: ReactNode }) => ReactNode;
const A: LinkC = ({ href, className, children }) => <a href={href} className={className}>{children}</a>;

/** Makro takvim (şartname §6.2): ana sayfada yaklaşan 5 girdi, /takvim'de 30 gün. Yayınlanmış veri habere bağlanır. */
export function MacroCalendar({ items = [], LinkComponent = A, limit, moreHref = "/takvim" }: { items?: MacroCalendarItem[]; LinkComponent?: LinkC; limit?: number; moreHref?: string | null }) {
  const shown = limit ? items.slice(0, limit) : items;
  return (
    <section className="k-cal">
      <header className="k-cal__h"><LinkComponent href="/takvim" className="k-label" >{"Makro takvim"}</LinkComponent></header>
      {shown.length === 0 && <p className="k-muted" style={{ fontSize: 14 }}>Önümüzdeki günlerde planlı veri açıklaması yok.</p>}
      <ul className="k-cal__list">
        {shown.map((i) => (
          <li key={i.id} className={i.articleHref ? "k-cal__i k-cal__i--done" : "k-cal__i"}>
            <time dateTime={i.scheduledAt}>{fmtCalendarWhen(i.scheduledAt)}</time>
            <span className="k-cal__inst">{institutionLabel(i.institution)}</span>
            {i.articleHref ? <LinkComponent href={i.articleHref} className="k-cal__t k-cal__t--news">{i.title}</LinkComponent> : <span className="k-cal__t">{i.title}</span>}
          </li>
        ))}
      </ul>
      {moreHref && items.length > shown.length && <LinkComponent href={moreHref} className="k-cal__more">Takvimin tamamı →</LinkComponent>}
      <style>{`.k-cal__h{border-bottom:2px solid var(--accent-2);padding-bottom:6px;margin-bottom:10px}.k-cal__h .k-label{color:var(--accent-2)}.k-cal__list{list-style:none;padding:0;margin:0;font-size:14px}.k-cal__i{padding:6px 0;border-bottom:1px dashed var(--line);display:grid;grid-template-columns:auto auto 1fr;gap:8px;align-items:baseline}.k-cal__i time{font-variant-numeric:tabular-nums;color:var(--muted);font-size:12px;white-space:nowrap}.k-cal__inst{font-size:11px;font-weight:700;letter-spacing:.04em;color:var(--accent-2)}.k-cal__t{color:var(--body)}.k-cal__t--news{font-weight:600;color:var(--ink)}.k-cal__more{display:inline-block;margin-top:8px;font-size:13px;color:var(--muted)}`}</style>
    </section>
  );
}

export function TabBar({ items = DEFAULT_TABS }: { items?: { href: string; label: string }[] }) {
  return (
    <nav className="k-tabbar" aria-label="Alt menü">
      {items.map((t) => <a key={t.href} href={t.href}>{t.label}</a>)}
      <style>{`.k-tabbar{display:none;position:fixed;left:0;right:0;bottom:0;background:var(--ground);border-top:1px solid var(--line);padding:8px 0 calc(8px + var(--safe-bottom));justify-content:space-around;font-size:12px;font-weight:600;z-index:20}@media (display-mode: standalone){.k-tabbar{display:flex}}`}</style>
    </nav>
  );
}
const DEFAULT_TABS = [{ href: "/", label: "Akış" }, { href: "/resmi-gazete", label: "Gazete" }, { href: "/sirket", label: "Şirketler" }, { href: "/takvim", label: "Takvim" }];
