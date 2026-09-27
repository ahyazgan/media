import type { Metadata, Viewport } from "next";
import { DM_Sans, Fraunces } from "next/font/google";
import Link from "next/link";
import "@kaynak/ui/tokens.css";
import "./globals.css";
import { Masthead, TabBar } from "@kaynak/ui";
import { todayLabel } from "@/lib/format";

const fraunces = Fraunces({ subsets: ["latin", "latin-ext"], weight: ["600", "800"], variable: "--font-fraunces", display: "swap" });
const dmSans = DM_Sans({ subsets: ["latin", "latin-ext"], weight: ["400", "500", "700"], variable: "--font-dm", display: "swap" });

const SITE = process.env.SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: { default: "Kaynak — Resmi kaynaktan, dakikalar içinde, doğrulanmış", template: "%s · Kaynak" },
  description: "Resmi Gazete, KAP, TCMB ve TÜİK bildirimlerini dakikalar içinde doğrulanmış, belgeye linkli habere çeviren ekonomi haber sitesi.",
  applicationName: "Kaynak",
  robots: { index: true, follow: true },
};

export const viewport: Viewport = { themeColor: "#E0187B", viewportFit: "cover", width: "device-width", initialScale: 1 };

const NextLink = ({ href, className, children }: { href: string; className?: string; children: React.ReactNode }) => (
  <Link href={href} className={className}>{children}</Link>
);

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr" className={`${fraunces.variable} ${dmSans.variable}`}>
      <body>
        <Masthead dateLabel={todayLabel()} LinkComponent={NextLink} />
        <main className="k-container k-main">{children}</main>
        <footer className="k-footer">
          <div className="k-container k-footer__inner">
            <p className="k-footer__disclaimer"><b>Yatırım tavsiyesi değildir.</b> Kaynak'taki haberler resmi belgelerden otomatik üretilir ve editör kurallarından geçer; yorum, tahmin veya öneri içermez.</p>
            <nav className="k-footer__nav">
              <Link href="/kunye">Künye</Link><Link href="/iletisim">İletişim</Link><Link href="/duzeltme-politikasi">Düzeltme politikası</Link>
              <Link href="/kvkk">KVKK</Link><Link href="/cerez-politikasi">Çerez politikası</Link><Link href="/reklam">Reklam</Link><Link href="/rss.xml">RSS</Link>
            </nav>
            <p className="k-muted" style={{ fontSize: 12 }}>© {new Date().getFullYear()} Kaynak. Resmi Gazete metinleri FSEK m.31 gereği telif korumasında değildir.</p>
          </div>
        </footer>
        <TabBar />
      </body>
    </html>
  );
}
