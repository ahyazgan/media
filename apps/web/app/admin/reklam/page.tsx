import { adInquiryList } from "@/lib/adminQueries";
import { dateTimeLabel } from "@/lib/format";
import { AD_SLOTS, type AdSlotId } from "@/lib/ads";
import { resolveAdInquiryAction } from "../actions";
import { Flash } from "../Flash";

export const metadata = { title: "Reklam talepleri" };

export default async function AdInquiriesPage({ searchParams }: { searchParams: Promise<{ ok?: string; hata?: string }> }) {
  const sp = await searchParams;
  const rows = await adInquiryList();
  return (
    <div>
      <h1>Reklam talepleri</h1>
      <Flash sp={sp} />
      {rows.length === 0 && <div className="k-empty">Talep yok.</div>}
      <table className="k-admin__table">
        <thead><tr><th>Tarih</th><th>Şirket / kişi</th><th>Bütçe</th><th>Alanlar</th><th>Mesaj</th><th>Durum</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} style={{ opacity: r.resolvedAt ? 0.6 : 1 }}>
              <td style={{ whiteSpace: "nowrap", fontSize: 13 }}>{dateTimeLabel(r.createdAt)}</td>
              <td style={{ fontSize: 13 }}><b>{r.company}</b><br />{r.name} · <a href={`mailto:${r.email}`}>{r.email}</a>{r.phone ? <><br />{r.phone}</> : null}</td>
              <td style={{ fontSize: 13 }}>{r.budget ?? "—"}</td>
              <td style={{ fontSize: 12 }}>{r.formats.map((f) => AD_SLOTS[f as AdSlotId]?.description ?? f).join(", ") || "—"}</td>
              <td style={{ fontSize: 13, whiteSpace: "pre-wrap", maxWidth: 380 }}>{r.message}</td>
              <td style={{ fontSize: 13 }}>{r.resolvedAt ? <>Kapatıldı · {r.resolvedBy}<br />{r.note}</> : (
                <form action={resolveAdInquiryAction} className="k-admin__inline"><input type="hidden" name="id" value={r.id} /><input name="note" placeholder="sonuç (teklif gönderildi…)" required /><button type="submit" className="k-btn k-btn--ghost">Kapat</button></form>
              )}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
