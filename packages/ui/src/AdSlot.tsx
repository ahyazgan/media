import type { CSSProperties, ReactNode } from "react";

export type AdSize = "970x90" | "320x100" | "300x250" | "336x280" | "300x600" | "320x50";

/**
 * Reklam yer tutucu. Boyut sabit tutulur ki CLS oluşmasın (şartname Faz 5 kabul: CLS < 0,1); reklam ağı yüklense de
 * yüklenmese de kutu aynı yeri kaplar. "Reklam" / "Sponsorlu" etiketi zorunlu (§10). Gerçek reklam `children` ile
 * kutunun içine konur (apps/web/components/Ad.tsx: rıza kapılı AdSense/Ad Manager). Boyutlar örnek başına CSS
 * değişkeniyle verilir; aynı sayfadaki slotlar ortak stil bloğunu paylaşır.
 */
export function AdSlot({ size, id, mobileSize, label = "Reklam", children }: { size: AdSize; id: string; mobileSize?: AdSize; label?: "Reklam" | "Sponsorlu"; children?: ReactNode }) {
  const [w, h] = size.split("x").map(Number);
  const [mw, mh] = (mobileSize ?? size).split("x").map(Number);
  const vars = { "--ad-w": `${w}px`, "--ad-h": `${h}px`, "--ad-mw": `${mw}px`, "--ad-mh": `${mh}px` } as CSSProperties;
  return (
    <div className="k-ad" data-ad-slot={id} aria-label="Reklam alanı" style={vars}>
      <span className="k-ad__label">{label}</span>
      <div className="k-ad__box">{children}</div>
      <style>{CSS}</style>
    </div>
  );
}

const CSS = `
.k-ad{display:flex;flex-direction:column;align-items:center;gap:4px;margin:16px auto}
.k-ad__label{font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}
.k-ad__box{width:var(--ad-mw);height:var(--ad-mh);max-width:100%;background:var(--tint);border:1px dashed var(--line);border-radius:var(--radius-sm);overflow:hidden;display:flex;align-items:center;justify-content:center}
.k-ad__box:has(ins,iframe,div){background:transparent;border-color:transparent}
@media (min-width:960px){.k-ad__box{width:var(--ad-w);height:var(--ad-h)}}
`;
