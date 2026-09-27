import { AdSlot, ArticleListItem, BreakingBar, CookieBar, GazetteList, HeroArticle, InstallBanner, KapFeed, KeyFacts, MacroCalendar, MarketTicker, SourceBox, TabBar } from "@kaynak/ui";

export const metadata = { title: "UI bileşenleri", robots: { index: false } };

const sample = { slug: "ornek-haber-abc123", title: "Ticaret Bakanlığı uzlaşma komisyonlarını il müdürlüklerine yayıyor", dek: "Değişiklik 1 Ekim 2025'te yürürlüğe giriyor; komisyonlar üç üyeden oluşacak.", category: "mevzuat", importance: 4, publishedAt: new Date().toISOString(), sourceName: "T.C. Resmî Gazete" };

export default function DevUi() {
  const Block = ({ name, children }: { name: string; children: React.ReactNode }) => (
    <section style={{ margin: "28px 0" }}><h2 style={{ fontSize: 14, fontFamily: "var(--font-text)", color: "var(--muted)", marginBottom: 8 }}>{name}</h2>{children}</section>
  );
  return (
    <div>
      <h1>Bileşenler</h1>
      <Block name="MarketTicker"><MarketTicker items={[{ symbol: "BIST100", value: "10.842", change: 1.24 }, { symbol: "USD/TRY", value: "41,52", change: -0.08 }]} /></Block>
      <Block name="BreakingBar"><BreakingBar text="TCMB politika faizini açıkladı" href="#" /></Block>
      <Block name="HeroArticle"><HeroArticle a={sample} /></Block>
      <Block name="ArticleListItem"><ArticleListItem a={sample} /></Block>
      <Block name="GazetteList"><GazetteList dateLabel="26 Eylül 2025" issueNo={33029} entries={[
        { externalId: "1", title: "Organ Nakli Hizmetleri Yönetmeliğinde Değişiklik", url: "#", section: "yonetmelik", sectionLabel: "Yönetmelikler", articleSlug: "x", status: "published" },
        { externalId: "2", title: "Kırşehir Ahi Evran Üniversitesi Merkez Yönetmeliği", url: "#", section: "yonetmelik", sectionLabel: "Yönetmelikler", articleSlug: null, status: null },
      ]} /></Block>
      <Block name="SourceBox"><SourceBox title="Uzlaşma Yönetmeliğinde Değişiklik" institution="T.C. Resmî Gazete · Sayı 33027" dateLabel="24 Eylül 2025" url="#" excerpt="MADDE 1- 30/5/2018 tarihli ve 30436 sayılı…" /></Block>
      <Block name="KeyFacts"><KeyFacts facts={[{ text: "Komisyon üç üyeden oluşur", quoteFromSource: "Komisyon, ticaret il müdürü başkanlığında … üç üyeden oluşur." }]} /></Block>
      <Block name="KapFeed"><KapFeed /></Block>
      <Block name="MacroCalendar"><MacroCalendar /></Block>
      <Block name="AdSlot"><AdSlot id="dev" size="300x250" /></Block>
      <Block name="InstallBanner / TabBar / CookieBar (gizli, PWA modunda)"><InstallBanner /><TabBar /><CookieBar /></Block>
    </div>
  );
}
