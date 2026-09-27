import type { Metadata } from "next";
import Link from "next/link";
import { institutionLabel } from "@kaynak/ui";
import { calendarUpcoming } from "@/lib/queries";
import { dateLabel } from "@/lib/format";

export const revalidate = 3600; // şartname: ISR günlük; publish'te /api/revalidate ile yenilenir
export const metadata: Metadata = { title: "Makro takvim", description: "Önümüzdeki 30 günün TCMB ve TÜİK veri açıklama takvimi; açıklanan veriler habere bağlanır." };

const NextLink = ({ href, className, children }: { href: string; className?: string; children: React.ReactNode }) => <Link href={href} className={className}>{children}</Link>;
const TZ = "Europe/Istanbul";
const dayKey = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
const clock = (iso: string) => new Intl.DateTimeFormat("tr-TR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
const weekday = (d: string) => new Intl.DateTimeFormat("tr-TR", { timeZone: TZ, weekday: "long" }).format(new Date(`${d}T12:00:00+03:00`));

export default async function CalendarPage() {
  const items = await calendarUpcoming(30);
  const days = new Map<string, typeof items>();
  for (const i of items) days.set(dayKey(i.scheduledAt), [...(days.get(dayKey(i.scheduledAt)) ?? []), i]);
  return (
    <div style={{ maxWidth: 860 }}>
      <span className="k-label" style={{ color: "var(--accent-2)" }}>Makro takvim</span>
      <h1 style={{ fontSize: 34, margin: "6px 0 4px" }}>Önümüzdeki 30 gün</h1>
      <p className="k-muted" style={{ margin: "0 0 18px", fontSize: 14 }}>{items.length} açıklama · TCMB ve TÜİK yayın takvimlerinden · saatler Türkiye saati</p>
      {items.length === 0 && (
        <div className="k-empty"><p>Takvim henüz yüklenmedi.</p><p style={{ fontSize: 14 }}>Senkron: <code>pnpm pipeline:run -- --calendar</code> (ağsız deneme için <code>--fixture</code>)</p></div>
      )}
      {[...days.entries()].map(([d, list]) => (
        <section key={d} className="k-day">
          <h2 className="k-day__h">{dateLabel(d)} <span className="k-muted">{weekday(d)}</span></h2>
          <ul className="k-day__list">
            {list.map((i) => (
              <li key={i.id} className="k-day__i">
                <time dateTime={i.scheduledAt}>{clock(i.scheduledAt)}</time>
                <span className="k-day__inst">{institutionLabel(i.institution)}</span>
                <span>
                  {i.articleHref ? <NextLink href={i.articleHref} className="k-day__t k-day__t--news">{i.title}</NextLink> : <span className="k-day__t">{i.title}</span>}
                  {i.articleHref && <span className="k-day__badge">Açıklandı</span>}
                  {!i.articleHref && i.sourceUrl && <a href={i.sourceUrl} target="_blank" rel="noopener" className="k-day__src">takvim ↗</a>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <p className="k-muted" style={{ fontSize: 13, marginTop: 24 }}>Veri açıklandığında ilgili haber otomatik olarak bu satıra bağlanır; açıklama saatinde kaynaklar 30 saniyede bir taranır.</p>
      <style>{`
        .k-day{margin:22px 0}
        .k-day__h{font-size:20px;border-bottom:2px solid var(--ink);padding-bottom:4px;margin-bottom:6px;display:flex;justify-content:space-between;align-items:baseline}
        .k-day__h .k-muted{font-family:var(--font-text);font-size:13px;font-weight:500}
        .k-day__list{list-style:none;margin:0;padding:0}
        .k-day__i{display:grid;grid-template-columns:56px 56px 1fr;gap:12px;padding:9px 0;border-bottom:1px dashed var(--line);font-size:15px;align-items:baseline}
        .k-day__i time{font-variant-numeric:tabular-nums;color:var(--muted);font-size:13px}
        .k-day__inst{font-size:11px;font-weight:700;letter-spacing:.04em;color:var(--accent-2)}
        .k-day__t--news{font-weight:600}
        .k-day__badge{margin-left:8px;font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--ground);background:var(--accent-2);border-radius:3px;padding:2px 6px}
        .k-day__src{margin-left:8px;font-size:12px;color:var(--muted)}
      `}</style>
    </div>
  );
}
