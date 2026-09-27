import type { CSSProperties } from "react";

export type AdSize = "970x90" | "320x100" | "300x250" | "336x280" | "300x600" | "320x50";

/**
 * Reklam yer tutucu (Faz 5'te Ad Manager bağlanır). Boyut sabit tutulur ki CLS oluşmasın.
 * "Reklam" etiketi zorunlu (şartname §10). Boyutlar örnek başına CSS değişkeniyle verilir; aynı sayfadaki
 * birden fazla slot ortak stil bloğunu paylaşır (aksi halde son slotun boyutu hepsini ezer).
 */
export function AdSlot({ size, id, mobileSize }: { size: AdSize; id: string; mobileSize?: AdSize }) {
  const [w, h] = size.split("x").map(Number);
  const [mw, mh] = (mobileSize ?? size).split("x").map(Number);
  const vars = { "--ad-w": `${w}px`, "--ad-h": `${h}px`, "--ad-mw": `${mw}px`, "--ad-mh": `${mh}px` } as CSSProperties;
  return (
    <div className="k-ad" data-ad-slot={id} aria-label="Reklam alanı" style={vars}>
      <span className="k-ad__label">Reklam</span>
      <div className="k-ad__box" />
      <style>{CSS}</style>
    </div>
  );
}

const CSS = `
.k-ad{display:flex;flex-direction:column;align-items:center;gap:4px;margin:16px auto}
.k-ad__label{font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}
.k-ad__box{width:var(--ad-mw);height:var(--ad-mh);max-width:100%;background:var(--tint);border:1px dashed var(--line);border-radius:var(--radius-sm)}
@media (min-width:960px){.k-ad__box{width:var(--ad-w);height:var(--ad-h)}}
`;
