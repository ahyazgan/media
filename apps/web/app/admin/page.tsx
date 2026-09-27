import Link from "next/link";
import { adminDashboard } from "@/lib/adminQueries";

export const metadata = { title: "Pano" };
const n = (v: number | null | undefined) => (v === null || v === undefined ? "—" : v >= 100 ? String(Math.round(v)) : String(v));

/** Şartname §11 ölçütleri: yayına geçiş süresi, otomatik yayın oranı, düzeltme/geri çekme, grounding redleri, aboneler. */
export default async function AdminHome() {
  const { counts, today, recent } = await adminDashboard();
  const rows = [today, ...recent.filter((r) => r.date !== today.date).map((r) => ({ ...r, timeToPublishP50: r.timeToPublishP50, timeToPublishP95: r.timeToPublishP95 }))];
  const tiles: [string, string, string][] = [
    ["İnceleme bekleyen", String(counts.openReviews), "/admin/inceleme"],
    ["Düşen iş", String(counts.openFailures), "/admin/hatalar"],
    ["İşlenmemiş olay", String(counts.pendingEvents), "/admin/hatalar"],
    ["Yayında haber", String(counts.published), "/"],
    ["Düzeltilmiş", String(counts.corrected), "/admin/duzeltme"],
    ["Push abonesi", String(counts.pushSubscribers), "/admin"],
    ["Bülten abonesi", String(counts.newsletterSubscribers), "/bulten"],
  ];
  return (
    <div>
      <h1>Pano</h1>
      <div className="k-admin__tiles">
        {tiles.map(([label, value, href]) => <Link key={label} href={href} className="k-admin__tile"><b>{value}</b><span>{label}</span></Link>)}
      </div>
      <h2>Günlük ölçütler</h2>
      <p className="k-muted" style={{ fontSize: 13 }}>Hedefler: KAP &lt; 3 dk, Resmi Gazete &lt; 10 dk (medyan); düzeltme/geri çekme ayda 0. Bugün canlı hesaplanır, önceki günler 00:10'da yazılır.</p>
      <table className="k-admin__table">
        <thead><tr><th>Gün</th><th>p50 (dk)</th><th>p95 (dk)</th><th>Yayın</th><th>Otomatik</th><th>Oran</th><th>İnceleme</th><th>Red</th><th>Grounding red</th><th>Atlanan</th><th>Düzeltme</th><th>Geri çekme</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.date}>
              <td>{r.date}{r.date === today.date ? " (bugün)" : ""}</td><td>{n(r.timeToPublishP50)}</td><td>{n(r.timeToPublishP95)}</td>
              <td>{r.published}</td><td>{r.autoPublished}</td><td>{r.published ? Math.round((100 * r.autoPublished) / r.published) + "%" : "—"}</td>
              <td>{r.reviewed}</td><td>{r.rejected}</td><td>{r.groundingRejects}</td><td>{r.skipped}</td><td>{r.corrections}</td><td>{r.retracted}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
