"use client";
import { useState } from "react";

export function ContactForm({ defaultArticle = "" }: { defaultArticle?: string }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [error, setError] = useState("");
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const body = Object.fromEntries(fd.entries()) as Record<string, unknown>;
    body.consent = fd.get("consent") === "on";
    setState("busy"); setError("");
    try {
      const res = await fetch("/api/iletisim", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !data.ok) { setState("error"); setError(data.error ?? "Bir hata oluştu."); return; }
      setState("done");
    } catch { setState("error"); setError("Bağlantı hatası."); }
  };
  if (state === "done") return <p className="k-card">Talebiniz alındı. Düzeltme politikamız gereği en geç 24 saat içinde e-postayla yanıt veririz.</p>;
  return (
    <form onSubmit={submit} className="k-contact" aria-label="İletişim ve düzeltme talebi">
      <div className="k-contact__row">
        <label>Ad Soyad<input name="name" required minLength={2} autoComplete="name" /></label>
        <label>E-posta<input name="email" type="email" required autoComplete="email" /></label>
      </div>
      <label>Konu
        <select name="kind" defaultValue="duzeltme">
          <option value="duzeltme">Düzeltme talebi</option>
          <option value="tekzip">Tekzip / cevap hakkı</option>
          <option value="diger">Diğer</option>
        </select>
      </label>
      <label>Haber bağlantısı (varsa)<input name="article" defaultValue={defaultArticle} placeholder="https://…/haber/…" /></label>
      <label>Mesaj — itiraz ettiğiniz ifadeyi ve doğrusunu, mümkünse belge referansıyla yazın<textarea name="message" rows={6} required minLength={10} /></label>
      <input name="website" tabIndex={-1} autoComplete="off" style={{ position: "absolute", left: -9999 }} aria-hidden="true" />
      <label className="k-contact__consent"><input type="checkbox" name="consent" required /> <span>Ad, e-posta ve mesajımın talebimi yanıtlamak amacıyla işlenmesine <a href="/kvkk">KVKK aydınlatma metni</a> kapsamında açık rıza veriyorum.</span></label>
      {error && <p style={{ color: "var(--down)", fontSize: 13, margin: 0 }}>{error}</p>}
      <button type="submit" className="k-btn" disabled={state === "busy"}>{state === "busy" ? "Gönderiliyor…" : "Gönder"}</button>
      <style>{`
        .k-contact{display:grid;gap:12px;max-width:640px;position:relative}
        .k-contact__row{display:grid;gap:12px;grid-template-columns:1fr 1fr}
        .k-contact label{display:grid;gap:4px;font-size:14px;font-weight:600;color:var(--body)}
        .k-contact input,.k-contact select,.k-contact textarea{font:inherit;font-weight:400;padding:10px 12px;border:1px solid var(--line);border-radius:var(--radius)}
        .k-contact__consent{display:flex!important;gap:8px;align-items:flex-start;font-weight:400!important;font-size:13px!important}
        .k-contact .k-btn{justify-self:start}
        @media (max-width:560px){.k-contact__row{grid-template-columns:1fr}}
      `}</style>
    </form>
  );
}
