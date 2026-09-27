import Link from "next/link";
import { openRequests } from "@/lib/adminQueries";
import { dateTimeLabel } from "@/lib/format";
import { resolveRequestAction } from "../actions";
import { Flash } from "../Flash";

export const metadata = { title: "Düzeltme talepleri" };
const KIND: Record<string, string> = { duzeltme: "Düzeltme", tekzip: "Tekzip", diger: "Diğer" };

export default async function RequestsPage({ searchParams }: { searchParams: Promise<{ ok?: string; hata?: string }> }) {
  const sp = await searchParams;
  const rows = await openRequests();
  return (
    <div>
      <h1>Düzeltme talepleri</h1>
      <Flash sp={sp} />
      <p className="k-muted" style={{ fontSize: 13 }}>İletişim formundan gelenler. Düzeltme politikası: 24 saat içinde yanıt. Kapatırken sonucu yazın (talep sahibine e-postayla bildirin).</p>
      {rows.length === 0 && <div className="k-empty">Talep yok.</div>}
      <table className="k-admin__table">
        <thead><tr><th>Tarih</th><th>Tür</th><th>Kimden</th><th>Haber</th><th>Mesaj</th><th>Durum</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} style={{ opacity: r.resolvedAt ? 0.6 : 1 }}>
              <td style={{ whiteSpace: "nowrap", fontSize: 13 }}>{dateTimeLabel(r.createdAt)}</td>
              <td>{KIND[r.kind] ?? r.kind}</td>
              <td style={{ fontSize: 13 }}>{r.name}<br /><a href={`mailto:${r.email}`}>{r.email}</a></td>
              <td style={{ fontSize: 13 }}>{r.articleSlug ? <Link href={`/haber/${r.articleSlug}`} target="_blank">{r.articleSlug}</Link> : "—"}</td>
              <td style={{ fontSize: 13, whiteSpace: "pre-wrap", maxWidth: 420 }}>{r.message}</td>
              <td style={{ fontSize: 13 }}>
                {r.resolvedAt ? <>Kapatıldı · {r.resolvedBy}<br />{r.resolution}</> : (
                  <form action={resolveRequestAction} className="k-admin__inline">
                    <input type="hidden" name="id" value={r.id} />
                    <input name="resolution" placeholder="sonuç" required />
                    <button type="submit" className="k-btn k-btn--ghost">Kapat</button>
                  </form>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
