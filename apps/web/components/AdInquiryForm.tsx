"use client";
import { useState } from "react";
import { AD_SLOTS, type AdSlotId } from "@/lib/ads";

export function AdInquiryForm() {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [error, setError] = useState("");
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const body: Record<string, unknown> = Object.fromEntries(fd.entries());
    body.formats = fd.getAll("formats");
    body.consent = fd.get("consent") === "on";
    setState("busy"); setError("");
    try {
      const res = await fetch("/api/reklam", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !data.ok) { setState("error"); setError(data.error ?? "Bir hata oluştu."); return; }
      setState("done");
    } catch { setState("error"); setError("Bağlantı hatası."); }
  };
  if (state === "done") return <p className="k-card">Talebiniz alındı. Bir iş günü içinde teklif ve medya kitiyle dönüş yapılır.</p>;
  return (
    <form onSubmit={submit} className="k-contact" aria-label="Reklam teklif formu">
      <div className="k-contact__row">
        <label>Şirket / ajans<input name="company" required minLength={2} autoComplete="organization" /></label>
        <label>Ad Soyad<input name="name" required minLength={2} autoComplete="name" /></label>
      </div>
      <div className="k-contact__row">
        <label>E-posta<input name="email" type="email" required autoComplete="email" /></label>
        <label>Telefon (isteğe bağlı)<input name="phone" autoComplete="tel" /></label>
      </div>
      <label>Aylık bütçe aralığı
        <select name="budget" defaultValue="">
          <option value="">Belirtmek istemiyorum</option><option>25.000 TL altı</option><option>25.000–100.000 TL</option><option>100.000–500.000 TL</option><option>500.000 TL üzeri</option>
        </select>
      </label>
      <fieldset className="k-contact__fs"><legend>İlgilendiğiniz alanlar</legend>
        {(Object.keys(AD_SLOTS) as AdSlotId[]).map((id) => <label key={id} className="k-contact__chk"><input type="checkbox" name="formats" value={id} /> {AD_SLOTS[id].description} ({AD_SLOTS[id].size})</label>)}
      </fieldset>
      <label>Mesaj<textarea name="message" rows={5} required minLength={10} placeholder="Kampanya dönemi, hedef kitle, kreatif türü…" /></label>
      <input name="website" tabIndex={-1} autoComplete="off" style={{ position: "absolute", left: -9999 }} aria-hidden="true" />
      <label className="k-contact__consent"><input type="checkbox" name="consent" required /> <span>İletişim bilgilerimin teklif hazırlamak amacıyla işlenmesine <a href="/kvkk">KVKK aydınlatma metni</a> kapsamında açık rıza veriyorum.</span></label>
      {error && <p style={{ color: "var(--down)", fontSize: 13, margin: 0 }}>{error}</p>}
      <button type="submit" className="k-btn" disabled={state === "busy"}>{state === "busy" ? "Gönderiliyor…" : "Teklif iste"}</button>
      <style>{`
        .k-contact{display:grid;gap:12px;max-width:640px;position:relative}
        .k-contact__row{display:grid;gap:12px;grid-template-columns:1fr 1fr}
        .k-contact label{display:grid;gap:4px;font-size:14px;font-weight:600;color:var(--body)}
        .k-contact input,.k-contact select,.k-contact textarea{font:inherit;font-weight:400;padding:10px 12px;border:1px solid var(--line);border-radius:var(--radius)}
        .k-contact__fs{border:1px solid var(--line);border-radius:var(--radius);padding:10px 12px;display:grid;gap:6px;font-size:14px}
        .k-contact__fs legend{font-weight:600;font-size:13px;color:var(--body);padding:0 4px}
        .k-contact__chk{display:flex!important;gap:8px;align-items:center;font-weight:400!important}
        .k-contact__consent{display:flex!important;gap:8px;align-items:flex-start;font-weight:400!important;font-size:13px!important}
        .k-contact .k-btn{justify-self:start}
        @media (max-width:560px){.k-contact__row{grid-template-columns:1fr}}
      `}</style>
    </form>
  );
}
