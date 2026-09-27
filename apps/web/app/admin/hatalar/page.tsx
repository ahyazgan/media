import { failures } from "@/lib/adminQueries";
import { dateTimeLabel, sourceLabel } from "@/lib/format";
import { retryFailureAction } from "../actions";
import { Flash } from "../Flash";

export const metadata = { title: "Düşen işler" };

export default async function FailuresPage({ searchParams }: { searchParams: Promise<{ ok?: string; hata?: string }> }) {
  const sp = await searchParams;
  const rows = await failures();
  return (
    <div>
      <h1>Düşen işler</h1>
      <Flash sp={sp} />
      <p className="k-muted" style={{ fontSize: 13 }}>Üç denemeden sonra düşen işler (BullMQ `dead` kuyruğunun veritabanı karşılığı). "Yeniden dene" olayı `new` durumuna döndürür; worker bekleyen süpürmesinde (5 dk) tekrar işler.</p>
      {rows.length === 0 && <div className="k-empty">Düşen iş yok.</div>}
      <table className="k-admin__table">
        <thead><tr><th>Tarih</th><th>Kaynak</th><th>Olay</th><th>Hata</th><th>Deneme</th><th></th></tr></thead>
        <tbody>
          {rows.map(({ f, title, url }) => (
            <tr key={f.id} style={{ opacity: f.resolvedAt ? 0.6 : 1 }}>
              <td style={{ whiteSpace: "nowrap", fontSize: 13 }}>{dateTimeLabel(f.failedAt)}</td>
              <td>{sourceLabel(f.sourceId)}</td>
              <td style={{ fontSize: 13 }}>{url ? <a href={url} target="_blank" rel="noopener">{title}</a> : f.rawEventId ?? "—"}</td>
              <td style={{ fontSize: 12, whiteSpace: "pre-wrap", maxWidth: 480 }}>{f.error}</td>
              <td>{f.attempts}</td>
              <td>{f.resolvedAt ? <span className="k-muted" style={{ fontSize: 12 }}>çözüldü {dateTimeLabel(f.resolvedAt)}</span> : (
                <form action={retryFailureAction}><input type="hidden" name="id" value={f.id} /><button type="submit" className="k-btn k-btn--ghost">Yeniden dene</button></form>
              )}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
