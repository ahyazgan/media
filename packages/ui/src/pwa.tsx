/**
 * PWA yüzeyleri — yalnızca görünüm; durum ve tarayıcı API'leri apps/web/components/PwaClient.tsx'te.
 * Şartname §7: InstallBanner iOS'ta "Paylaş → Ana Ekrana Ekle" adımlarını gösterir, Android'de beforeinstallprompt yakalanır;
 * push izni ana ekrana eklendikten sonra, KVKK aydınlatma metni + açık rıza kutusuyla istenir (§10).
 */
import type { ReactNode } from "react";

export function InstallBanner({ mode, onInstall, onDismiss }: { mode: "ios" | "prompt"; onInstall?: () => void; onDismiss?: () => void }) {
  return (
    <div className="k-install" role="dialog" aria-label="Ana ekrana ekle">
      <div className="k-install__body">
        <b>Kaynak'ı ana ekrana ekleyin</b>
        {mode === "ios"
          ? <span className="k-muted">Safari'de <span className="k-install__kbd">Paylaş</span> → <span className="k-install__kbd">Ana Ekrana Ekle</span>. Çevrimdışı okuma ve bildirimler ancak böyle çalışır.</span>
          : <span className="k-muted">Uygulama gibi açılır, çevrimdışı okunur, önemli haberlerde bildirim gönderir.</span>}
      </div>
      <div className="k-install__actions">
        {mode === "prompt" && <button type="button" className="k-btn" onClick={onInstall}>Ekle</button>}
        <button type="button" className="k-btn k-btn--ghost" onClick={onDismiss} aria-label="Kapat">Kapat</button>
      </div>
      <style>{CSS}</style>
    </div>
  );
}

export const PUSH_CATEGORIES: { id: string; label: string }[] = [
  { id: "makro", label: "Makro (faiz, enflasyon)" }, { id: "borsa", label: "Borsa / KAP" }, { id: "mevzuat", label: "Mevzuat" },
  { id: "bankacilik", label: "Bankacılık" }, { id: "enerji", label: "Enerji" },
];

export function PushOptIn({ categories, onToggle, consent, onConsent, onSubmit, busy, error }: {
  categories: string[]; onToggle: (id: string) => void; consent: boolean; onConsent: (v: boolean) => void; onSubmit: () => void; busy?: boolean; error?: string;
}) {
  return (
    <form className="k-push k-card" onSubmit={(e) => { e.preventDefault(); onSubmit(); }} aria-label="Bildirim izni">
      <span className="k-label">Bildirimler</span>
      <p style={{ margin: "6px 0 10px" }}>Yalnızca önemli haberlerde (faiz kararı, asgari ücret, büyük KAP bildirimi) bildirim gönderiyoruz. Kategori seçin:</p>
      <div className="k-push__cats">
        {PUSH_CATEGORIES.map((c) => (
          <label key={c.id}><input type="checkbox" checked={categories.includes(c.id)} onChange={() => onToggle(c.id)} /> {c.label}</label>
        ))}
      </div>
      <label className="k-push__consent">
        <input type="checkbox" checked={consent} onChange={(e) => onConsent(e.target.checked)} required />
        <span>Bildirim aboneliğim için tarayıcı kimliğimin (push uç noktası) saklanmasına, <a href="/kvkk">KVKK aydınlatma metni</a> kapsamında açık rıza veriyorum. İstediğim zaman tarayıcı ayarlarından iptal edebilirim.</span>
      </label>
      {error && <p className="k-push__err">{error}</p>}
      <button type="submit" className="k-btn" disabled={busy || !consent}>{busy ? "Bekleyin…" : "Bildirimlere izin ver"}</button>
      <style>{CSS}</style>
    </form>
  );
}

export function CookieBar({ onEssential, onAccept }: { onEssential: () => void; onAccept: () => void }) {
  return (
    <div className="k-cookie" role="dialog" aria-label="Çerez tercihleri">
      <p style={{ margin: 0 }}>Zorunlu çerezler dışında çerez kullanmıyoruz. Reklam çerezleri yalnızca onayınızla yüklenir. <a href="/cerez-politikasi">Çerez politikası</a></p>
      <div className="k-cookie__actions">
        <button className="k-btn k-btn--ghost" type="button" onClick={onEssential}>Sadece zorunlu</button>
        <button className="k-btn" type="button" onClick={onAccept}>Kabul et</button>
      </div>
      <style>{CSS}</style>
    </div>
  );
}

export function Toast({ children }: { children: ReactNode }) {
  return <div className="k-toast" role="status">{children}<style>{CSS}</style></div>;
}

const CSS = `
.k-install{position:fixed;left:12px;right:12px;bottom:calc(12px + var(--safe-bottom));z-index:30;background:var(--ink);color:var(--ground);border-radius:var(--radius);padding:14px 16px;display:flex;gap:12px;align-items:center;justify-content:space-between;box-shadow:0 8px 24px rgba(26,24,38,.25);font-size:14px}
.k-install .k-muted{color:#c9c3d1;display:block;margin-top:2px}
.k-install__kbd{border:1px solid #6b6580;border-radius:3px;padding:0 4px;font-size:12px}
.k-install__actions{display:flex;gap:8px;flex:none}
.k-install .k-btn{background:var(--accent);border-color:var(--accent)}
.k-install .k-btn--ghost{background:transparent;color:var(--ground);border-color:#6b6580}
@media (display-mode: standalone){.k-install{bottom:calc(64px + var(--safe-bottom))}}
.k-push{display:grid;gap:8px;font-size:14px;margin:16px 0}
.k-push__cats{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:6px}
.k-push__consent{display:flex;gap:8px;align-items:flex-start;font-size:13px;color:var(--body);margin-top:6px}
.k-push__err{color:var(--down);margin:0;font-size:13px}
.k-push .k-btn{justify-self:start}
.k-cookie{position:fixed;left:0;right:0;bottom:0;z-index:31;background:var(--ground);border-top:2px solid var(--ink);padding:12px var(--gutter) calc(12px + var(--safe-bottom));display:flex;flex-wrap:wrap;gap:10px 20px;align-items:center;justify-content:space-between;font-size:14px}
.k-cookie__actions{display:flex;gap:8px}
.k-toast{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(20px + var(--safe-bottom));z-index:32;background:var(--accent-2);color:#fff;padding:10px 16px;border-radius:var(--radius);font-size:14px;font-weight:600}
`;
