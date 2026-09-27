import { sourceHealth, sources } from "@kaynak/db";
import { SILENCE_HOURS, summarizeSources, type HealthStatus } from "@kaynak/pipeline";
import { getDb } from "@/lib/db";
import { dateTimeLabel, sourceLabel } from "@/lib/format";

export const metadata = { title: "Kaynak sağlığı" };

const BADGE: Record<HealthStatus, { label: string; color: string }> = {
  ok: { label: "Çalışıyor", color: "var(--up)" },
  degraded: { label: "Aksıyor", color: "#B7791F" },
  failing: { label: "Bozuk", color: "var(--down)" },
  stale: { label: "Sessiz", color: "var(--down)" },
  unknown: { label: "Henüz taranmadı", color: "var(--muted)" },
};

export default async function SourcesHealthPage() {
  const { db } = await getDb();
  const all = await db.select().from(sources);
  const enabled = all.filter((s) => s.enabled).map((s) => s.id);
  const rows = await db.select().from(sourceHealth);
  const rep = summarizeSources(rows, enabled);
  const byId = new Map(rows.map((r) => [r.sourceId, r]));
  const alerts = [process.env.ALERT_EMAIL ? "e-posta" : null, process.env.ALERT_TELEGRAM_CHAT_ID ? "Telegram" : null].filter(Boolean);
  return (
    <div>
      <h1>Kaynak sağlığı</h1>
      <p className="k-muted" style={{ fontSize: 13 }}>
        Yapı değişikliği, TLS ya da robots sorunu ilk taramada <b>Bozuk</b> sayılır; ağ ve HTTP hataları üst üste 3 kez olursa. Kaynak kendi
        sessizlik süresinden uzun öğe döndürmezse <b>Sessiz</b> olur. Uyarı kanalı: {alerts.length ? alerts.join(", ") : "tanımlı değil (ALERT_EMAIL / ALERT_TELEGRAM_CHAT_ID)"}.
        Uptime izleyicisi için: <code>/api/health/sources</code> (sorun varsa 503).
      </p>
      <table className="k-admin__table">
        <thead><tr><th>Kaynak</th><th>Durum</th><th>Son başarılı tarama</th><th>Son öğe</th><th>Sessizlik sınırı</th><th>Üst üste hata</th><th>Son hata</th></tr></thead>
        <tbody>
          {rep.sources.map((s) => {
            const r = byId.get(s.sourceId);
            const b = BADGE[s.status];
            return (
              <tr key={s.sourceId}>
                <td>{sourceLabel(s.sourceId)}</td>
                <td><span style={{ color: b.color, fontWeight: 700 }}>● {b.label}</span></td>
                <td style={{ fontSize: 13 }}>{s.lastOkAt ? dateTimeLabel(s.lastOkAt) : "—"}</td>
                <td style={{ fontSize: 13 }}>{s.lastItemsAt ? dateTimeLabel(s.lastItemsAt) : "—"}</td>
                <td style={{ fontSize: 13 }}>{SILENCE_HOURS[s.sourceId] ?? 168} sa</td>
                <td>{s.consecutiveFailures || "—"}</td>
                <td style={{ fontSize: 12, whiteSpace: "pre-wrap", maxWidth: 520 }}>
                  {r?.lastError ? <><b>{r.lastErrorKind}</b> · {r.lastErrorAt ? dateTimeLabel(r.lastErrorAt) : ""}<br />{r.lastError}</> : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {all.some((s) => !s.enabled) && (
        <p className="k-muted" style={{ fontSize: 13, marginTop: 16 }}>Kapalı kaynaklar: {all.filter((s) => !s.enabled).map((s) => sourceLabel(s.id)).join(", ")} (açmak için <code>pnpm db:seed -- --enable &lt;kaynak&gt;</code>).</p>
      )}
    </div>
  );
}
