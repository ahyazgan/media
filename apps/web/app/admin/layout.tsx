import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: { default: "Admin", template: "%s · Admin · Kaynak" }, robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const NAV = [["/admin", "Pano"], ["/admin/inceleme", "İnceleme kuyruğu"], ["/admin/duzeltme", "Düzeltme / geri çekme"], ["/admin/talepler", "Düzeltme talepleri"], ["/admin/hatalar", "Düşen işler"], ["/admin/reklam", "Reklam talepleri"], ["/admin/dagitim", "Dağıtım günlüğü"]] as const;

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="k-admin">
      <nav className="k-admin__nav" aria-label="Admin">
        <span className="k-label">Admin</span>
        {NAV.map(([href, label]) => <Link key={href} href={href}>{label}</Link>)}
      </nav>
      <div className="k-admin__body">{children}</div>
    </div>
  );
}
