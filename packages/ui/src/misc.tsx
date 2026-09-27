/**
 * Faz 2–3 bileşenlerinin yer tutucuları. Arayüzleri şimdiden sabitlenir, veri bağlantısı ilgili fazda gelir.
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

export function KapFeed({ items = [] }: { items?: { time: string; code: string; title: string; href: string }[] }) {
  return (
    <section className="k-kap">
      <header className="k-kap__h"><span className="k-label">KAP akışı</span><span className="k-kap__live">● canlı</span></header>
      {items.length === 0 && <p className="k-muted" style={{ fontSize: 14 }}>KAP akışı Faz 2'de devreye girer.</p>}
      <ul className="k-kap__list">{items.map((i, k) => <li key={k}><time>{i.time}</time> <b>{i.code}</b> <a href={i.href}>{i.title}</a></li>)}</ul>
      <style>{`.k-kap__h{display:flex;justify-content:space-between;border-bottom:2px solid var(--accent);padding-bottom:6px;margin-bottom:10px}.k-kap__live{font-size:11px;color:var(--accent)}.k-kap__list{list-style:none;padding:0;margin:0;font-size:14px}.k-kap__list li{padding:6px 0;border-bottom:1px dashed var(--line)}.k-kap__list time{color:var(--muted);font-variant-numeric:tabular-nums;margin-right:6px}`}</style>
    </section>
  );
}

export function MacroCalendar({ items = [] }: { items?: { when: string; institution: string; title: string }[] }) {
  return (
    <section className="k-cal">
      <header className="k-cal__h"><span className="k-label" style={{ color: "var(--accent-2)" }}>Makro takvim</span></header>
      {items.length === 0 && <p className="k-muted" style={{ fontSize: 14 }}>TCMB ve TÜİK takvimi Faz 3'te devreye girer.</p>}
      <ul className="k-cal__list">{items.map((i, k) => <li key={k}><time>{i.when}</time> <span className="k-muted">{i.institution}</span> {i.title}</li>)}</ul>
      <style>{`.k-cal__h{border-bottom:2px solid var(--accent-2);padding-bottom:6px;margin-bottom:10px}.k-cal__list{list-style:none;padding:0;margin:0;font-size:14px}.k-cal__list li{padding:6px 0;border-bottom:1px dashed var(--line)}.k-cal__list time{font-variant-numeric:tabular-nums;margin-right:6px}`}</style>
    </section>
  );
}

export function InstallBanner({ children }: { children?: ReactNode }) {
  return <div className="k-install" hidden>{children ?? "Ana ekrana ekleyin"}</div>;
}

export function TabBar({ items = DEFAULT_TABS }: { items?: { href: string; label: string }[] }) {
  return (
    <nav className="k-tabbar" aria-label="Alt menü">
      {items.map((t) => <a key={t.href} href={t.href}>{t.label}</a>)}
      <style>{`.k-tabbar{display:none;position:fixed;left:0;right:0;bottom:0;background:var(--ground);border-top:1px solid var(--line);padding:8px 0 calc(8px + var(--safe-bottom));justify-content:space-around;font-size:12px;font-weight:600;z-index:20}@media (display-mode: standalone){.k-tabbar{display:flex}}`}</style>
    </nav>
  );
}
const DEFAULT_TABS = [{ href: "/", label: "Akış" }, { href: "/resmi-gazete", label: "Gazete" }, { href: "/takvim", label: "Takvim" }, { href: "/kategori/borsa", label: "Borsa" }];

export function CookieBar() {
  return (
    <div className="k-cookie" role="dialog" aria-label="Çerez tercihleri" hidden>
      <p>Zorunlu çerezler dışında çerez kullanmıyoruz. Reklam çerezleri yalnızca onayınızla yüklenir.</p>
      <button className="k-btn k-btn--ghost" type="button">Sadece zorunlu</button>
      <button className="k-btn" type="button">Kabul et</button>
    </div>
  );
}
