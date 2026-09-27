import Link from "next/link";
import { liveArticles } from "@/lib/adminQueries";
import { dateTimeLabel } from "@/lib/format";
import { Flash } from "../Flash";

export const metadata = { title: "Düzeltme" };

export default async function CorrectionsPage({ searchParams }: { searchParams: Promise<{ q?: string; ok?: string; hata?: string }> }) {
  const sp = await searchParams;
  const rows = await liveArticles(sp.q ?? "");
  return (
    <div>
      <h1>Düzeltme / geri çekme</h1>
      <Flash sp={sp} />
      <form method="get" className="k-admin__search"><input name="q" defaultValue={sp.q ?? ""} placeholder="başlık ya da slug" /><button className="k-btn k-btn--ghost" type="submit">Ara</button></form>
      <table className="k-admin__table">
        <thead><tr><th>Durum</th><th>Başlık</th><th>Yayın</th><th></th></tr></thead>
        <tbody>
          {rows.map((a) => (
            <tr key={a.id}>
              <td>{a.status}</td>
              <td><Link href={`/admin/duzeltme/${a.id}`}>{a.title}</Link><br /><span className="k-muted" style={{ fontSize: 12 }}>/haber/{a.slug}</span></td>
              <td style={{ fontSize: 13, whiteSpace: "nowrap" }}>{a.publishedAt ? dateTimeLabel(a.publishedAt) : "—"}</td>
              <td><Link href={`/admin/duzeltme/${a.id}`} className="k-btn k-btn--ghost">Aç</Link></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
