"use client";
import { useEffect, useState } from "react";
import { PUSH_CATEGORIES, PushOptIn } from "@kaynak/ui";
import { usePush } from "./usePush";

const LS = "k-push-categories";

/** /bildirimler: abonelik durumu, kategori tercihleri (yeniden kayıtla güncellenir), tek tıkla iptal. */
export function PushPreferences() {
  const { state, subscribe, unsubscribe } = usePush();
  const [cats, setCats] = useState<string[]>(["makro", "borsa"]);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  useEffect(() => { try { const v = localStorage.getItem(LS); if (v) setCats(JSON.parse(v)); } catch { /* yok */ } }, []);
  const toggle = (id: string) => setCats((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
  const save = async () => {
    setBusy(true); setMsg("");
    const err = await subscribe(cats, true);
    try { localStorage.setItem(LS, JSON.stringify(cats)); } catch { /* yok */ }
    setMsg(err || "Tercihler kaydedildi."); setBusy(false);
  };

  if (state === "loading") return <p className="k-muted">Durum kontrol ediliyor…</p>;
  if (state === "unsupported") return <p className="k-card">Bu tarayıcı web push desteklemiyor ya da push bu sitede kapalı.</p>;
  if (state === "ios-needs-install") return <p className="k-card">iPhone/iPad'de bildirimler yalnızca ana ekrana eklenmiş uygulamada çalışır: Safari'de <b>Paylaş → Ana Ekrana Ekle</b>, sonra uygulamayı açıp bu sayfaya gelin.</p>;
  if (state === "blocked") return <p className="k-card">Bildirim izni tarayıcıda engellenmiş. Adres çubuğundaki site ayarlarından izni "Sor" ya da "İzin ver" yapıp sayfayı yenileyin.</p>;
  if (state === "off") {
    return <PushOptIn categories={cats} onToggle={toggle} consent={consent} onConsent={setConsent} busy={busy} error={msg} onSubmit={async () => { setBusy(true); const err = await subscribe(cats, consent); setMsg(err); setBusy(false); }} />;
  }
  return (
    <div className="k-card" style={{ display: "grid", gap: 10, fontSize: 14 }}>
      <p style={{ margin: 0 }}><b>Bildirimler açık.</b> Yalnızca seçtiğiniz kategorilerdeki önemli haberler gönderilir.</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))", gap: 6 }}>
        {PUSH_CATEGORIES.map((c) => <label key={c.id}><input type="checkbox" checked={cats.includes(c.id)} onChange={() => toggle(c.id)} /> {c.label}</label>)}
      </div>
      {msg && <p style={{ margin: 0, color: msg.includes("kaydedildi") ? "var(--up)" : "var(--down)" }}>{msg}</p>}
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" className="k-btn" onClick={save} disabled={busy}>Tercihleri kaydet</button>
        <button type="button" className="k-btn k-btn--ghost" onClick={() => void unsubscribe()} disabled={busy}>Bildirimleri kapat</button>
      </div>
    </div>
  );
}
