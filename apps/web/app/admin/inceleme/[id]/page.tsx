import Link from "next/link";
import { notFound } from "next/navigation";
import { categoryLabel } from "@kaynak/ui";
import { articleForAdmin } from "@/lib/adminQueries";
import { dateTimeLabel, sourceLabel } from "@/lib/format";
import { publishReviewAction, rejectReviewAction } from "../../actions";
import { Flash } from "../../Flash";

export const metadata = { title: "İnceleme" };

export default async function ReviewDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; hata?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const r = await articleForAdmin(id);
  if (!r) notFound();
  const { article: a, document: doc, event: ev, queue } = r;
  // Flaş yayındaysa kuyruktaki iş bekleyen tam metindir (pendingDraft; otomatik tam metin reddedildiyse editör yazar)
  const flashLive = a.isFlash && a.status === "published";
  const editable = a.status === "review" || a.status === "draft" || flashLive;
  const d = flashLive ? (a.pendingDraft ?? { title: a.title, dek: a.dek, bodyMarkdown: a.bodyMarkdown, keyFacts: a.keyFacts }) : a;
  return (
    <div className="k-admin__split">
      <div>
        <p><Link href="/admin/inceleme">← Kuyruk</Link></p>
        <h1 style={{ fontSize: 24 }}>İnceleme</h1>
        <Flash sp={sp} />
        <p className="k-muted" style={{ fontSize: 13 }}>
          {sourceLabel(ev?.sourceId)} · {categoryLabel(a.category)} · önem {a.importance} · durum <b>{a.status}</b>{queue ? ` · kuyruk: ${queue.reason}` : ""}<br />
          {ev && <>Olay: <a href={ev.url} target="_blank" rel="noopener">{ev.title}</a> · {dateTimeLabel(ev.publishedAt)}</>}
        </p>
        {flashLive && <p className="k-admin__flash">Flaş yayında (<Link href={`/haber/${a.slug}`}>haberi aç</Link>): “{a.title}”. Aşağıdaki tam metni onaylarsanız aynı adreste flaşın yerine geçer; dağıtım (Telegram/X/bildirim) tekrarlanmaz. Reddederseniz flaş olduğu gibi kalır.{!a.pendingDraft && " Otomatik tam metin reddedildi; metni siz yazın."}</p>}
        {!editable && <p className="k-admin__flash">Bu makale artık kuyrukta değil (durum: {a.status}).{a.status === "published" && <> <Link href={`/haber/${a.slug}`}>Haberi aç →</Link></>}</p>}
        <form action={publishReviewAction} className="k-admin__form">
          <input type="hidden" name="id" value={a.id} />
          <label>Başlık <span className="k-muted">({d.title.length}/70)</span><input name="title" defaultValue={d.title} maxLength={70} required /></label>
          <label>Dek<textarea name="dek" defaultValue={d.dek} rows={2} required /></label>
          <label>Gövde (Markdown)<textarea name="bodyMarkdown" defaultValue={d.bodyMarkdown} rows={18} required /></label>
          <label>Editör notu (haber sayfasında görünmez)<input name="note" placeholder="isteğe bağlı" /></label>
          <div className="k-admin__actions">
            <button type="submit" className="k-btn" disabled={!editable}>Yayınla</button>
          </div>
        </form>
        <form action={rejectReviewAction} className="k-admin__form k-admin__form--danger">
          <input type="hidden" name="id" value={a.id} />
          <label>Reddetme gerekçesi<input name="reason" placeholder="ör. belgeyle uyumsuz / haber değeri yok" required /></label>
          <button type="submit" className="k-btn k-btn--ghost" disabled={!editable}>Reddet</button>
        </form>
        <h3>Belgede ne diyor (keyFacts)</h3>
        <ol style={{ fontSize: 14 }}>{d.keyFacts.map((k, i) => <li key={i}><b>{k.text}</b><br /><i className="k-muted">“{k.quoteFromSource}”</i></li>)}</ol>
        {a.editorNote && <p className="k-muted" style={{ fontSize: 13 }}>Kural motoru: {a.editorNote}</p>}
      </div>
      <aside>
        <h3>Kaynak belge</h3>
        <p style={{ fontSize: 13 }}><a href={a.sourceUrl} target="_blank" rel="noopener">{a.sourceUrl}</a></p>
        <pre className="k-admin__doc">{doc?.textContent ?? "(belge metni yok)"}</pre>
      </aside>
    </div>
  );
}
