import Link from "next/link";
import { notFound } from "next/navigation";
import { articleForAdmin } from "@/lib/adminQueries";
import { dateTimeLabel } from "@/lib/format";
import { correctionAction, retractAction } from "../../actions";
import { Flash } from "../../Flash";

export const metadata = { title: "Düzeltme" };

export default async function CorrectionDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; hata?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const r = await articleForAdmin(id);
  if (!r) notFound();
  const { article: a, document: doc, versions } = r;
  const live = a.status === "published" || a.status === "corrected";
  return (
    <div className="k-admin__split">
      <div>
        <p><Link href="/admin/duzeltme">← Liste</Link> · <Link href={`/haber/${a.slug}`} target="_blank">Haberi aç ↗</Link></p>
        <h1 style={{ fontSize: 24 }}>Düzeltme</h1>
        <Flash sp={sp} />
        <p className="k-muted" style={{ fontSize: 13 }}>Durum <b>{a.status}</b> · yayın {a.publishedAt ? dateTimeLabel(a.publishedAt) : "—"} · son güncelleme {dateTimeLabel(a.updatedAt)}{a.editorNote ? ` · not: ${a.editorNote}` : ""}</p>
        <form action={correctionAction} className="k-admin__form">
          <input type="hidden" name="id" value={a.id} />
          <label>Başlık<input name="title" defaultValue={a.title} maxLength={70} required /></label>
          <label>Dek<textarea name="dek" defaultValue={a.dek} rows={2} required /></label>
          <label>Gövde (Markdown)<textarea name="bodyMarkdown" defaultValue={a.bodyMarkdown} rows={18} required /></label>
          <label>Düzeltme gerekçesi (haber sayfasında "Düzeltildi" notu olarak görünür)<input name="reason" placeholder="ör. Tutar 1,2 milyar TL yerine 1,24 milyar TL olarak düzeltildi" required /></label>
          <div className="k-admin__actions"><button type="submit" className="k-btn" disabled={!live}>Düzeltmeyi yayınla</button></div>
        </form>
        <form action={retractAction} className="k-admin__form k-admin__form--danger">
          <input type="hidden" name="id" value={a.id} />
          <label>Geri çekme gerekçesi<input name="reason" placeholder="ör. Belge iptal edildi" required /></label>
          <button type="submit" className="k-btn k-btn--ghost" disabled={!live}>Geri çek</button>
        </form>
        <h3>Sürüm geçmişi</h3>
        {versions.length === 0 && <p className="k-muted" style={{ fontSize: 13 }}>Henüz sürüm yok (ilk düzeltmede geriye dönük v1 alınır).</p>}
        <ul style={{ fontSize: 14 }}>
          {versions.map((v) => <li key={v.id}><b>v{v.version}</b> · {dateTimeLabel(v.createdAt)} · {v.reason} · <i className="k-muted">{String((v.snapshot as { title?: string }).title ?? "")}</i></li>)}
        </ul>
      </div>
      <aside>
        <h3>Kaynak belge</h3>
        <p style={{ fontSize: 13 }}><a href={a.sourceUrl} target="_blank" rel="noopener">{a.sourceUrl}</a></p>
        <pre className="k-admin__doc">{doc?.textContent ?? "(belge metni yok)"}</pre>
      </aside>
    </div>
  );
}
