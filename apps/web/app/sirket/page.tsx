import type { Metadata } from "next";
import Link from "next/link";
import { CompanyCard } from "@kaynak/ui";
import { companiesIndex } from "@/lib/queries";

export const revalidate = 300;
export const metadata: Metadata = { title: "Şirketler", description: "KAP'a bildirim yapan halka açık şirketler; bildirim geçmişi ve doğrulanmış haberler." };

const NextLink = ({ href, className, children }: { href: string; className?: string; children: React.ReactNode }) => <Link href={href} className={className}>{children}</Link>;

export default async function CompaniesPage() {
  const rows = await companiesIndex();
  return (
    <div style={{ maxWidth: 1040 }}>
      <span className="k-label" style={{ color: "var(--accent-2)" }}>KAP</span>
      <h1 style={{ fontSize: 34, margin: "6px 0 4px" }}>Şirketler</h1>
      <p className="k-muted" style={{ margin: "0 0 18px", fontSize: 14 }}>{rows.length} şirket · son bildirime göre sıralı</p>
      {rows.length === 0
        ? <div className="k-empty"><p>Henüz KAP bildirimi işlenmedi.</p><p style={{ fontSize: 14 }}>Kuru çalıştırma: <code>pnpm pipeline:run -- --source kap --fixture</code></p></div>
        : <div className="k-grid k-grid--3">{rows.map((c) => <CompanyCard key={c.kapCode} compact c={c} LinkComponent={NextLink} />)}</div>}
    </div>
  );
}
