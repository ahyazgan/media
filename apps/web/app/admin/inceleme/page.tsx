import Link from "next/link";
import { categoryLabel } from "@kaynak/ui";
import { reviewList } from "@/lib/adminQueries";
import { dateTimeLabel, sourceLabel } from "@/lib/format";
import { Flash } from "../Flash";

export const metadata = { title: "İnceleme kuyruğu" };

export default async function ReviewQueuePage({ searchParams }: { searchParams: Promise<{ ok?: string; hata?: string }> }) {
  const sp = await searchParams;
  const rows = await reviewList();
  return (
    <div>
      <h1>İnceleme kuyruğu <span className="k-muted" style={{ fontSize: 16 }}>({rows.length})</span></h1>
      <Flash sp={sp} />
      {rows.length === 0 && <div className="k-empty">Kuyruk boş.</div>}
      <table className="k-admin__table">
        <thead><tr><th>Önem</th><th>Kaynak</th><th>Başlık</th><th>Neden</th><th>Bekliyor</th><th></th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.queueId}>
              <td><b>{r.article.importance}</b></td>
              <td>{sourceLabel(r.sourceId)}<br /><span className="k-label">{categoryLabel(r.article.category)}</span></td>
              <td><Link href={`/admin/inceleme/${r.article.id}`}>{r.article.title}</Link><br /><span className="k-muted" style={{ fontSize: 13 }}>{r.article.dek.slice(0, 140)}</span></td>
              <td style={{ fontSize: 13 }}>{r.reason}</td>
              <td style={{ fontSize: 13, whiteSpace: "nowrap" }}>{dateTimeLabel(r.createdAt)}</td>
              <td><Link href={`/admin/inceleme/${r.article.id}`} className="k-btn k-btn--ghost">İncele</Link></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
