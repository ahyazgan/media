/**
 * Reklam yapılandırması (şartname §6.3 slotları). NEXT_PUBLIC_* değerler derleme anında istemciye gömülür.
 *  NEXT_PUBLIC_AD_PROVIDER=none|adsense|gam
 *  NEXT_PUBLIC_ADSENSE_CLIENT=ca-pub-…            (adsense)
 *  NEXT_PUBLIC_GAM_NETWORK=/1234567/kaynak       (gam: ağ kodu + ana birim)
 *  NEXT_PUBLIC_AD_UNITS={"home-top":"…", …}       (adsense: slot id, gam: birim adı; eksik slot yer tutucu kalır)
 * Kurallar: her slot sabit boyut (CLS), "Reklam" etiketi, kayan kutu ve sesli otomatik video yok (Better Ads), rıza öncesi
 * hiçbir reklam scripti yüklenmez (KVKK/çerez barı "Kabul et").
 */
import type { AdSize } from "@kaynak/ui";

export type AdSlotId = "home-top" | "home-rail" | "article-top" | "article-inline" | "article-rail" | "company-rail" | "tabbar-top";
export const AD_SLOTS: Record<AdSlotId, { size: AdSize; mobileSize: AdSize; description: string }> = {
  "home-top": { size: "970x90", mobileSize: "320x100", description: "Ana sayfa, başlık altı" },
  "home-rail": { size: "300x600", mobileSize: "300x250", description: "Ana sayfa, sağ ray" },
  "article-top": { size: "970x90", mobileSize: "320x100", description: "Haber, başlık altı" },
  "article-inline": { size: "300x250", mobileSize: "336x280", description: "Haber, 3. paragraf sonrası" },
  "article-rail": { size: "300x600", mobileSize: "300x250", description: "Haber, sağ ray (masaüstü)" },
  "company-rail": { size: "300x600", mobileSize: "300x250", description: "Şirket profili, sağ ray" },
  "tabbar-top": { size: "320x50", mobileSize: "320x50", description: "PWA, sekme çubuğu üstü" },
};

export type AdProvider = "none" | "adsense" | "gam";
export interface AdConfig { provider: AdProvider; adsenseClient?: string; gamNetwork?: string; units: Partial<Record<AdSlotId, string>> }

export function adConfig(): AdConfig {
  const provider = (process.env.NEXT_PUBLIC_AD_PROVIDER ?? "none") as AdProvider;
  let units: AdConfig["units"] = {};
  try { units = JSON.parse(process.env.NEXT_PUBLIC_AD_UNITS ?? "{}") as AdConfig["units"]; } catch { units = {}; }
  const cfg: AdConfig = { provider: ["adsense", "gam"].includes(provider) ? provider : "none", adsenseClient: process.env.NEXT_PUBLIC_ADSENSE_CLIENT, gamNetwork: process.env.NEXT_PUBLIC_GAM_NETWORK, units };
  if (cfg.provider === "adsense" && !cfg.adsenseClient) cfg.provider = "none";
  if (cfg.provider === "gam" && !cfg.gamNetwork) cfg.provider = "none";
  return cfg;
}

export const CONSENT_KEY = "k-cookie";
export const CONSENT_EVENT = "k-consent";
export type Consent = "all" | "essential" | null;
export function readConsent(): Consent {
  try { const v = localStorage.getItem(CONSENT_KEY); return v === "all" || v === "essential" ? v : null; } catch { return null; }
}
