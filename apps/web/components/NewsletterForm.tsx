"use client";
import { useState } from "react";

export function NewsletterForm({ compact = false }: { compact?: boolean }) {
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [state, setState] = useState<"idle" | "busy" | "pending" | "already" | "error">("idle");
  const [error, setError] = useState("");
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState("busy"); setError("");
    try {
      const res = await fetch("/api/bulten/abone", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, consent }) });
      const data = (await res.json()) as { ok: boolean; state?: string; error?: string };
      if (!res.ok || !data.ok) { setState("error"); setError(data.error ?? "Bir hata oluştu."); return; }
      setState(data.state === "already" ? "already" : "pending");
    } catch { setState("error"); setError("Bağlantı hatası."); }
  };
  if (state === "pending") return <p className="k-card" style={{ fontSize: 14 }}>Onay e-postası gönderildi. Gelen kutunuzdaki bağlantıya tıklayınca abonelik başlar.</p>;
  if (state === "already") return <p className="k-card" style={{ fontSize: 14 }}>Bu adres zaten abone.</p>;
  return (
    <form onSubmit={submit} className="k-nl" aria-label="Sabah bülteni aboneliği">
      <div className="k-nl__row">
        <input type="email" required placeholder="e-posta adresiniz" value={email} onChange={(e) => setEmail(e.target.value)} className="k-nl__input" autoComplete="email" />
        <button type="submit" className="k-btn" disabled={state === "busy" || !consent}>{state === "busy" ? "…" : "Abone ol"}</button>
      </div>
      <label className="k-nl__consent">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} required />
        <span>E-posta adresimin her sabah 07:30'da bülten göndermek için saklanmasına <a href="/kvkk">KVKK aydınlatma metni</a> kapsamında açık rıza veriyorum. Her bültenin altındaki bağlantıyla çıkabilirim.</span>
      </label>
      {error && <p style={{ color: "var(--down)", fontSize: 13, margin: 0 }}>{error}</p>}
      <style>{`
        .k-nl{display:grid;gap:8px;max-width:${compact ? "420px" : "560px"}}
        .k-nl__row{display:flex;gap:8px}
        .k-nl__input{flex:1;font:inherit;padding:10px 12px;border:1px solid var(--line);border-radius:var(--radius);min-width:0}
        .k-nl__consent{display:flex;gap:8px;align-items:flex-start;font-size:13px;color:var(--body)}
      `}</style>
    </form>
  );
}
