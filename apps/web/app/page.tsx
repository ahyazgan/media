import Link from "next/link";
import { ArticleListItem, BreakingBar, GazetteList, HeroArticle, MacroCalendar } from "@kaynak/ui";
import { Ad } from "@/components/Ad";
import { KapFeedLive } from "@/components/KapFeedLive";
import { SOURCE_LABELS } from "@/lib/format";
import { breakingArticle, calendarUpcoming, gazetteForDate, kapFeed, latestArticles, latestGazetteDate } from "@/lib/queries";
import { dateLabel, todayIso } from "@/lib/format";

export const revalidate = 60; // şartname: ana sayfa ISR 60 sn

const NextLink = ({ href, className, children }: { href: string; className?: string; children: React.ReactNode }) => <Link href={href} className={className}>{children}</Link>;

export default async function HomePage() {
  const [items, latestDate, feed, calendar, breaking] = await Promise.all([latestArticles(24), latestGazetteDate(), kapFeed(12), calendarUpcoming(30, 40), breakingArticle()]);
  const gazDate = latestDate ?? todayIso();
  const gazette = await gazetteForDate(gazDate);
  const [hero, ...rest] = items;
  const hot = rest.filter((a) => a.importance >= 3).slice(0, 4);
  const others = rest.filter((a) => !hot.includes(a)).slice(0, 12);

  return (
    <>
      {breaking && <BreakingBar text={breaking.title} href={`/haber/${breaking.slug}`} />}
      <Ad id="home-top" />
      <div className="k-grid k-grid--main">
        <div>
          {hero ? <HeroArticle a={{ ...hero, sourceName: hero.tickers.length ? SOURCE_LABELS.kap : SOURCE_LABELS["resmi-gazete"] }} LinkComponent={NextLink} /> : (
            <div className="k-empty">
              <p>Henüz yayınlanmış haber yok.</p>
              <p style={{ fontSize: 14 }}>İlk akışı başlatmak için: <code>pnpm pipeline:run -- --fixture</code></p>
            </div>
          )}
          {hot.length > 0 && (
            <section>
              <div className="k-section-h"><h2>Sıcak gelişmeler</h2></div>
              {hot.map((a) => <ArticleListItem key={a.id} a={a} LinkComponent={NextLink} />)}
            </section>
          )}
          {others.length > 0 && (
            <section>
              <div className="k-section-h"><h2>Son haberler</h2><Link href="/kategori/mevzuat">Tümü →</Link></div>
              {others.map((a) => <ArticleListItem key={a.id} a={a} LinkComponent={NextLink} showDek={false} />)}
            </section>
          )}
        </div>
        <aside style={{ display: "grid", gap: 28, alignContent: "start" }}>
          <GazetteList compact entries={gazette} dateLabel={dateLabel(gazDate)} issueNo={gazette[0]?.issueNo} LinkComponent={NextLink} />
          <Link href={`/resmi-gazete/${gazDate}`} className="k-btn k-btn--ghost" style={{ justifySelf: "start" }}>Günün tamamı →</Link>
          <KapFeedLive initial={feed} />
          <MacroCalendar items={calendar} limit={6} LinkComponent={NextLink} />
          <Ad id="home-rail" />
        </aside>
      </div>
    </>
  );
}
