import Link from "next/link";
import { distributionList } from "@/lib/adminQueries";
import { dateTimeLabel } from "@/lib/format";

export const metadata = { title: "Dağıtım günlüğü" };
const CH: Record<string, string> = { telegram: "Telegram", x: "X", push: "Push" };

export default async function DistributionPage() {
  const rows = await distributionList();
  return (
    <div>
      <h1>Dağıtım günlüğü</h1>
      <p className="k-muted" style={{ fontSize: 13 }}>Telegram ve X gönderimleri (ok / failed / skipped). X günlük sınırı ve tekrar önleme bu kayıtlardan hesaplanır.</p>
      {rows.length === 0 && <div className="k-empty">Kayıt yok.</div>}
      <table className="k-admin__table">
        <thead><tr><th>Tarih</th><th>Kanal</th><th>Durum</th><th>Haber</th><th>Ayrıntı</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td style={{ whiteSpace: "nowrap", fontSize: 13 }}>{dateTimeLabel(r.createdAt)}</td>
              <td>{CH[r.channel] ?? r.channel}</td>
              <td className={r.status === "ok" ? "k-up" : r.status === "failed" ? "k-down" : "k-muted"}>{r.status}</td>
              <td style={{ fontSize: 13 }}>{r.slug ? <Link href={`/haber/${r.slug}`} target="_blank">{r.title}</Link> : r.articleId}</td>
              <td style={{ fontSize: 12 }}>{r.externalId ? `id ${r.externalId} · ` : ""}{r.detail ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
